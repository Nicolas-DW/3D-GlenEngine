import { RigidBody } from "../components/RigidBody";
import { Transform } from "../core/Transform";
import type { System, World } from "../core/World";
import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";

/** Limites internes du réceptacle (boîte ouverte : pas de plafond). */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number; // sol
  minZ: number;
  maxZ: number;
}

/** Une bille = son corps + son transform (appariés depuis le World). */
interface Particle {
  body: RigidBody;
  transform: Transform;
}

const SLOP = 0.01; // chevauchement toléré au repos (limite le jitter)
const ROLL_GAIN = 0.6; // couplage glissement -> rotation

/**
 * Système physique (étapes 4-7 du plan + frottement/roulement). Pas de temps
 * FIXE ; collisions bille-bille via grille spatiale (broad phase, ~O(n)).
 *
 * En ECS, il balaie chaque frame les entités RigidBody + Transform.
 */
export class PhysicsSystem implements System {
  gravity = -9.81;
  restitution = 0.2;
  damping = 0.995;
  friction = 0.35;
  angularDamping = 0.96;

  private readonly particles: Particle[] = [];
  private maxRadius = 0;
  private readonly grid = new Map<number, number[]>();
  private accumulator = 0;
  private readonly fixedStep = 1 / 120;

  private readonly spinDelta = new Quaternion();
  private readonly spinAxis = new Vec3();

  constructor(private readonly bounds: Bounds) {}

  update(world: World, dt: number): void {
    // Apparier corps + transforms (les entités peuvent apparaître/disparaître).
    this.particles.length = 0;
    this.maxRadius = 0;
    for (const [entity, body] of world.view(RigidBody)) {
      const transform = world.get(entity, Transform);
      if (!transform) continue;
      this.particles.push({ body, transform });
      if (body.radius > this.maxRadius) this.maxRadius = body.radius;
    }

    this.accumulator += Math.min(dt, 0.05);
    let guard = 0;
    while (this.accumulator >= this.fixedStep && guard++ < 8) {
      this.step(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }
  }

  private step(h: number): void {
    this.integrate(h);
    for (const p of this.particles) this.collideBounds(p);
    this.collidePairs();
    this.integrateOrientation(h);
  }

  private integrate(h: number): void {
    const dv = this.gravity * h;
    for (const { body, transform } of this.particles) {
      const v = body.velocity;
      v.y += dv;
      v.x *= this.damping;
      v.y *= this.damping;
      v.z *= this.damping;
      if (v.x * v.x + v.y * v.y + v.z * v.z < 0.04) {
        v.x *= 0.85;
        v.y *= 0.85;
        v.z *= 0.85;
      }
      const p = transform.position;
      p.x += v.x * h;
      p.y += v.y * h;
      p.z += v.z * h;
    }
  }

  private collideBounds(particle: Particle): void {
    const p = particle.transform.position;
    const v = particle.body.velocity;
    const r = particle.body.radius;
    const e = this.restitution;
    const t = 1 - this.friction;
    const bd = this.bounds;

    if (p.x - r < bd.minX) { p.x = bd.minX + r; if (v.x < 0) v.x = -v.x * e; v.y *= t; v.z *= t; }
    else if (p.x + r > bd.maxX) { p.x = bd.maxX - r; if (v.x > 0) v.x = -v.x * e; v.y *= t; v.z *= t; }

    if (p.z - r < bd.minZ) { p.z = bd.minZ + r; if (v.z < 0) v.z = -v.z * e; v.x *= t; v.y *= t; }
    else if (p.z + r > bd.maxZ) { p.z = bd.maxZ - r; if (v.z > 0) v.z = -v.z * e; v.x *= t; v.y *= t; }

    if (p.y - r < bd.minY) {
      p.y = bd.minY + r;
      if (v.y < 0) v.y = -v.y * e;
      v.x *= t;
      v.z *= t;
      particle.body.angularVelocity.set(v.z / r, 0, -v.x / r); // roulement sur le sol
    }
  }

  private integrateOrientation(h: number): void {
    const d = this.angularDamping;
    for (const { body, transform } of this.particles) {
      const w = body.angularVelocity;
      w.x *= d; w.y *= d; w.z *= d;
      const speed = Math.hypot(w.x, w.y, w.z);
      if (speed < 1e-5) continue;
      this.spinAxis.set(w.x / speed, w.y / speed, w.z / speed);
      this.spinDelta.setFromAxisAngle(this.spinAxis, speed * h);
      this.spinDelta.multiply(transform.rotation);
      transform.rotation.copy(this.spinDelta).normalize();
    }
  }

  /** Broad phase : grille spatiale (cellule = diamètre max). */
  private collidePairs(): void {
    const list = this.particles;
    if (list.length < 2) return;
    const cell = 2 * this.maxRadius || 1;
    const grid = this.grid;
    grid.clear();

    for (let i = 0; i < list.length; i++) {
      const p = list[i].transform.position;
      const key = hashCell(cellOf(p.x, cell), cellOf(p.y, cell), cellOf(p.z, cell));
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    for (let i = 0; i < list.length; i++) {
      const p = list[i].transform.position;
      const cx = cellOf(p.x, cell);
      const cy = cellOf(p.y, cell);
      const cz = cellOf(p.z, cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const bucket = grid.get(hashCell(cx + ox, cy + oy, cz + oz));
            if (!bucket) continue;
            for (const j of bucket) {
              if (j > i) this.resolvePair(list[i], list[j]);
            }
          }
        }
      }
    }
  }

  /** Collision entre deux billes : normale (restitution) + tangentielle (frottement + roulement). */
  private resolvePair(a: Particle, b: Particle): void {
    const pa = a.transform.position;
    const pb = b.transform.position;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const dz = pb.z - pa.z;
    const minDist = a.body.radius + b.body.radius;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= minDist * minDist || d2 < 1e-12) return;

    const dist = Math.sqrt(d2);
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const corr = Math.max(0, minDist - dist - SLOP) * 0.5;
    pa.x -= nx * corr; pa.y -= ny * corr; pa.z -= nz * corr;
    pb.x += nx * corr; pb.y += ny * corr; pb.z += nz * corr;

    const va = a.body.velocity;
    const vb = b.body.velocity;

    const vn = (vb.x - va.x) * nx + (vb.y - va.y) * ny + (vb.z - va.z) * nz;
    if (vn < 0) {
      const jn = (-(1 + this.restitution) * vn) / 2;
      va.x -= jn * nx; va.y -= jn * ny; va.z -= jn * nz;
      vb.x += jn * nx; vb.y += jn * ny; vb.z += jn * nz;
    }

    const rvx = vb.x - va.x;
    const rvy = vb.y - va.y;
    const rvz = vb.z - va.z;
    const rvn = rvx * nx + rvy * ny + rvz * nz;
    let tx = rvx - rvn * nx;
    let ty = rvy - rvn * ny;
    let tz = rvz - rvn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-5) return;
    tx /= tl; ty /= tl; tz /= tl;

    const jt = this.friction * tl * 0.5;
    va.x += tx * jt; va.y += ty * jt; va.z += tz * jt;
    vb.x -= tx * jt; vb.y -= ty * jt; vb.z -= tz * jt;

    const cx = ny * tz - nz * ty;
    const cy = nz * tx - nx * tz;
    const cz = nx * ty - ny * tx;
    const g = (tl * ROLL_GAIN) / a.body.radius;
    a.body.angularVelocity.x += cx * g; a.body.angularVelocity.y += cy * g; a.body.angularVelocity.z += cz * g;
    b.body.angularVelocity.x += cx * g; b.body.angularVelocity.y += cy * g; b.body.angularVelocity.z += cz * g;
  }
}

function cellOf(coord: number, cell: number): number {
  return Math.floor(coord / cell);
}

function hashCell(x: number, y: number, z: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
}

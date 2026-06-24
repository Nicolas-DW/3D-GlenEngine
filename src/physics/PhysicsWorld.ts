import type { RigidBody } from "../components/RigidBody";
import { Component } from "../core/Component";
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

/**
 * Monde physique (étapes 4-7 du plan). C'est un composant « manager » : comme le
 * Renderer parcourt tous les MeshRenderer, le PhysicsWorld traite tous les
 * RigidBody ensemble (nécessaire pour les collisions entre billes).
 *
 * Pas de temps FIXE (sous-pas) : la simulation reste stable et reproductible
 * quel que soit le framerate. Collisions bille-bille via une GRILLE SPATIALE
 * (broad phase) : on ne teste que les billes des cellules voisines → ~O(n) au
 * lieu de O(n²), ce qui débloque la montée en nombre.
 */
export class PhysicsWorld extends Component {
  gravity = -9.81;
  restitution = 0.35;
  damping = 0.999; // léger amortissement linéaire
  friction = 0.15; // frottement tangentiel aux contacts (les billes ne glissent plus à l'infini)
  angularDamping = 0.985; // amortissement de la rotation

  private readonly bodies: RigidBody[] = [];
  private maxRadius = 0;
  private readonly grid = new Map<number, number[]>(); // hash de cellule -> indices
  private accumulator = 0;
  private readonly fixedStep = 1 / 120;

  // Scratch réutilisés (zéro allocation par bille/frame).
  private readonly spinDelta = new Quaternion();
  private readonly spinAxis = new Vec3();

  constructor(private readonly bounds: Bounds) {
    super();
  }

  add(body: RigidBody): void {
    this.bodies.push(body);
    if (body.radius > this.maxRadius) this.maxRadius = body.radius;
  }

  override update(dt: number): void {
    this.accumulator += Math.min(dt, 0.05); // borne anti-spirale après un lag
    let guard = 0;
    while (this.accumulator >= this.fixedStep && guard++ < 8) {
      this.step(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }
  }

  private step(h: number): void {
    this.integrate(h);
    for (const body of this.bodies) this.collideBounds(body);
    this.collidePairs();
    this.integrateOrientation(h);
  }

  /** Intégration semi-implicite d'Euler : v += g·h ; p += v·h. */
  private integrate(h: number): void {
    const dv = this.gravity * h;
    for (const b of this.bodies) {
      b.velocity.y += dv;
      b.velocity.x *= this.damping;
      b.velocity.y *= this.damping;
      b.velocity.z *= this.damping;
      const p = b.transform.position;
      p.x += b.velocity.x * h;
      p.y += b.velocity.y * h;
      p.z += b.velocity.z * h;
    }
  }

  /**
   * Collision bille ↔ parois : on repousse à l'intérieur, on amortit la vitesse
   * normale (restitution), on freine le glissement tangentiel (friction), et au
   * sol on déduit le roulement sans glissement (ω = (n × v) / r, n = +Y).
   */
  private collideBounds(b: RigidBody): void {
    const p = b.transform.position;
    const v = b.velocity;
    const r = b.radius;
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
      b.angularVelocity.set(v.z / r, 0, -v.x / r); // roulement sur le sol
    }
  }

  /** Intègre l'orientation des billes depuis leur vitesse angulaire. */
  private integrateOrientation(h: number): void {
    const d = this.angularDamping;
    for (const b of this.bodies) {
      const w = b.angularVelocity;
      w.x *= d; w.y *= d; w.z *= d;
      const speed = Math.hypot(w.x, w.y, w.z);
      if (speed < 1e-5) continue;
      this.spinAxis.set(w.x / speed, w.y / speed, w.z / speed);
      this.spinDelta.setFromAxisAngle(this.spinAxis, speed * h);
      this.spinDelta.multiply(b.transform.rotation); // delta * rotation (repère monde)
      b.transform.rotation.copy(this.spinDelta).normalize();
    }
  }

  /**
   * Collisions bille ↔ bille via une grille spatiale (broad phase).
   * Taille de cellule = diamètre max : deux billes qui se touchent sont
   * forcément dans la même cellule ou une cellule adjacente → on ne teste que
   * les 27 cellules voisines au lieu de toutes les paires.
   */
  private collidePairs(): void {
    const list = this.bodies;
    if (list.length < 2) return;
    const cell = 2 * this.maxRadius || 1;
    const grid = this.grid;
    grid.clear();

    // 1) Ranger chaque bille dans sa cellule.
    for (let i = 0; i < list.length; i++) {
      const p = list[i].transform.position;
      const key = hashCell(cellOf(p.x, cell), cellOf(p.y, cell), cellOf(p.z, cell));
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    // 2) Pour chaque bille, ne tester que les voisines (cellules adjacentes).
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const p = a.transform.position;
      const cx = cellOf(p.x, cell);
      const cy = cellOf(p.y, cell);
      const cz = cellOf(p.z, cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const bucket = grid.get(hashCell(cx + ox, cy + oy, cz + oz));
            if (!bucket) continue;
            for (const j of bucket) {
              if (j > i) this.resolvePair(a, list[j]); // chaque paire une seule fois
            }
          }
        }
      }
    }
  }

  /** Résolution d'une collision entre deux billes (masses égales). */
  private resolvePair(a: RigidBody, b: RigidBody): void {
    const pa = a.transform.position;
    const pb = b.transform.position;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const dz = pb.z - pa.z;
    const minDist = a.radius + b.radius;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= minDist * minDist || d2 < 1e-12) return;

    const dist = Math.sqrt(d2);
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    // Séparer (chacune de la moitié du chevauchement).
    const overlap = (minDist - dist) * 0.5;
    pa.x -= nx * overlap; pa.y -= ny * overlap; pa.z -= nz * overlap;
    pb.x += nx * overlap; pb.y += ny * overlap; pb.z += nz * overlap;

    // Impulsion le long de la normale.
    const va = a.velocity;
    const vb = b.velocity;
    const vn = (vb.x - va.x) * nx + (vb.y - va.y) * ny + (vb.z - va.z) * nz;
    if (vn > 0) return; // déjà en train de se séparer
    const imp = (-(1 + this.restitution) * vn) / 2;
    va.x -= imp * nx; va.y -= imp * ny; va.z -= imp * nz;
    vb.x += imp * nx; vb.y += imp * ny; vb.z += imp * nz;
  }
}

function cellOf(coord: number, cell: number): number {
  return Math.floor(coord / cell);
}

/** Hash spatial entier d'une cellule (évite d'allouer une chaîne par bille/frame). */
function hashCell(x: number, y: number, z: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
}

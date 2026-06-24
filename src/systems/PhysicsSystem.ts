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
// Seuils de mise au repos (n'agissent que sur les corps EN CONTACT, jamais en vol).
const STOP_LINEAR_SQ = 0.0009; // |v| < 0.03 m/s   -> arrêt net
const DAMP_LINEAR_SQ = 0.04; //   |v| < 0.2 m/s    -> fort amortissement
const DAMP_ANGULAR_SQ = 0.25; //  |ω| < 0.5 rad/s  -> fort amortissement
const STOP_ANGULAR = 0.08; //     |ω| < 0.08 rad/s -> rotation annulée (tous corps)
const RESTITUTION_SLOP = 0.4; // pas de rebond sous cette vitesse d'approche (m/s)
const TWIST = 0.5; // force du frottement de pivotement vs glissement

/**
 * Paramètres physiques RÉGLABLES, regroupés dans un objet partagé : le système
 * les lit à chaque sous-pas, l'UI (sliders) les écrit. Comme c'est un objet par
 * référence, le réglage prend effet en direct et survit aux relances de
 * l'expérience.
 */
export interface PhysicsParams {
  gravity: number; // m/s² (négatif = vers le bas)
  restitution: number; // rebond [0..1)
  damping: number; // amortissement linéaire (multiplicateur/sous-pas, 1 = aucun)
  angularDamping: number; // amortissement angulaire (idem)
  friction: number; // fraction de la vitesse de surface dissipée par contact [0..1]
}

export function defaultPhysicsParams(): PhysicsParams {
  return { gravity: -9.81, restitution: 0.2, damping: 0.995, angularDamping: 0.99, friction: 0.45 };
}

/**
 * Système physique : pas de temps FIXE, collisions paroi/bille-bille via grille
 * spatiale (broad phase ~O(n)), et un **solveur d'impulsions au point de contact**
 * (modèle de frottement avec inertie).
 *
 * Le frottement agit sur la vitesse de la surface au contact `v + ω × r` : il la
 * ramène vers zéro en répartissant l'impulsion entre le linéaire (1/m) et
 * l'angulaire (1/I). C'est ce qui fait à la fois rouler les billes qui glissent
 * ET dissiper leur rotation quand elles frottent les unes contre les autres.
 */
export class PhysicsSystem implements System {
  private readonly particles: Particle[] = [];
  private maxRadius = 0;
  private readonly grid = new Map<number, number[]>();
  private accumulator = 0;
  private readonly fixedStep = 1 / 120;

  private readonly spinDelta = new Quaternion();
  private readonly spinAxis = new Vec3();

  constructor(
    private readonly bounds: Bounds,
    readonly params: PhysicsParams = defaultPhysicsParams(),
  ) {}

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
    for (const p of this.particles) p.body.contacted = false; // réinitialise avant collisions
    for (const p of this.particles) this.collideBounds(p);
    this.collidePairs();
    this.settleContacted(); // amortit/arrête les corps posés (jamais ceux en vol)
    this.integrateOrientation(h);
  }

  private integrate(h: number): void {
    const damping = this.params.damping; // amortissement de l'air (s'applique à tous)
    const dv = this.params.gravity * h;
    for (const { body, transform } of this.particles) {
      const v = body.velocity;
      v.y += dv;
      v.x *= damping;
      v.y *= damping;
      v.z *= damping;
      const p = transform.position;
      p.x += v.x * h;
      p.y += v.y * h;
      p.z += v.z * h;
    }
  }

  /**
   * Mise au repos : amortit fortement (voire annule) les corps lents QUI ONT UN
   * CONTACT ce sous-pas. Réservé aux corps posés/coincés -> une bille en chute
   * libre n'est jamais freinée, et tombe donc même sous une gravité minuscule.
   */
  private settleContacted(): void {
    for (const { body } of this.particles) {
      if (!body.contacted) continue;
      const v = body.velocity;
      const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
      if (v2 < STOP_LINEAR_SQ) { v.x = 0; v.y = 0; v.z = 0; }
      else if (v2 < DAMP_LINEAR_SQ) { v.x *= 0.6; v.y *= 0.6; v.z *= 0.6; }

      const w = body.angularVelocity;
      if (w.x * w.x + w.y * w.y + w.z * w.z < DAMP_ANGULAR_SQ) { w.x *= 0.6; w.y *= 0.6; w.z *= 0.6; }
    }
  }

  /** Collisions contre les parois (corps statiques : invMass = 0). */
  private collideBounds(particle: Particle): void {
    const p = particle.transform.position;
    const body = particle.body;
    const r = body.radius;
    const bd = this.bounds;

    // Normale dirigée de la bille VERS la paroi (convention du solveur).
    let hit = false;
    if (p.x - r < bd.minX) { p.x = bd.minX + r; this.resolveContact(body, null, -1, 0, 0); hit = true; }
    else if (p.x + r > bd.maxX) { p.x = bd.maxX - r; this.resolveContact(body, null, 1, 0, 0); hit = true; }

    if (p.z - r < bd.minZ) { p.z = bd.minZ + r; this.resolveContact(body, null, 0, 0, -1); hit = true; }
    else if (p.z + r > bd.maxZ) { p.z = bd.maxZ - r; this.resolveContact(body, null, 0, 0, 1); hit = true; }

    if (p.y - r < bd.minY) { p.y = bd.minY + r; this.resolveContact(body, null, 0, -1, 0); hit = true; }

    if (hit) body.contacted = true;
  }

  private integrateOrientation(h: number): void {
    const d = this.params.angularDamping;
    for (const { body, transform } of this.particles) {
      const w = body.angularVelocity;
      w.x *= d; w.y *= d; w.z *= d;
      const speed = Math.hypot(w.x, w.y, w.z);
      if (speed < STOP_ANGULAR) { w.x = 0; w.y = 0; w.z = 0; continue; } // tue le spin résiduel
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
              if (j > i) this.resolveSpheres(list[i], list[j]);
            }
          }
        }
      }
    }
  }

  /** Résout une paire de billes : dépénétration pondérée + impulsion de contact. */
  private resolveSpheres(a: Particle, b: Particle): void {
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

    // Dépénétration répartie selon l'inverse de masse (le plus léger bouge plus).
    const imA = a.body.invMass;
    const imB = b.body.invMass;
    const corr = Math.max(0, minDist - dist - SLOP) / (imA + imB);
    pa.x -= nx * corr * imA; pa.y -= ny * corr * imA; pa.z -= nz * corr * imA;
    pb.x += nx * corr * imB; pb.y += ny * corr * imB; pb.z += nz * corr * imB;

    a.body.contacted = true;
    b.body.contacted = true;
    this.resolveContact(a.body, b.body, nx, ny, nz);
  }

  /**
   * Solveur d'impulsions pour UN contact. `n` est unitaire, dirigée de A vers B
   * (ou vers la paroi si `b === null`, traité comme statique : invMass = 0).
   *
   * 1. Impulsion normale (restitution). Pour des sphères, le point de contact est
   *    sur la ligne des centres : `r × n = 0`, donc l'angulaire n'intervient pas
   *    dans le normal.
   * 2. Frottement de GLISSEMENT (tangentiel) : on vise la vitesse de surface au
   *    contact `v + ω × r`. On en retire une fraction `friction`, répartie entre
   *    linéaire et angulaire via la masse effective tangentielle `1/m + r²/I`.
   * 3. Frottement de PIVOTEMENT (twist/drilling) : amortit la rotation relative
   *    autour de la normale — le glissement ne peut pas la voir (point de contact
   *    sur l'axe = vitesse de surface nulle), sans quoi une bille tournerait
   *    indéfiniment comme une toupie.
   */
  private resolveContact(a: RigidBody, b: RigidBody | null, nx: number, ny: number, nz: number): void {
    const ra = a.radius;
    const rb = b ? b.radius : 0;
    const rax = nx * ra, ray = ny * ra, raz = nz * ra; // décalage A -> contact
    const rbx = -nx * rb, rby = -ny * rb, rbz = -nz * rb; // décalage B -> contact

    const av = a.velocity, aw = a.angularVelocity;
    // Vitesse de surface de A au contact : v + ω × r.
    const vax = av.x + (aw.y * raz - aw.z * ray);
    const vay = av.y + (aw.z * rax - aw.x * raz);
    const vaz = av.z + (aw.x * ray - aw.y * rax);

    let vbx = 0, vby = 0, vbz = 0;
    const bv = b ? b.velocity : null;
    const bw = b ? b.angularVelocity : null;
    if (bv && bw) {
      vbx = bv.x + (bw.y * rbz - bw.z * rby);
      vby = bv.y + (bw.z * rbx - bw.x * rbz);
      vbz = bv.z + (bw.x * rby - bw.y * rbx);
    }

    // Vitesse relative au contact (B vue depuis A).
    const rvx = vbx - vax;
    const rvy = vby - vay;
    const rvz = vbz - vaz;
    const vn = rvx * nx + rvy * ny + rvz * nz;

    const imA = a.invMass, imB = b ? b.invMass : 0;
    const iiA = a.invInertia, iiB = b ? b.invInertia : 0;

    // --- 1. Impulsion normale (rebond). ---
    // Restitution annulée sous une vitesse d'approche faible : stoppe le
    // micro-rebond qui entretient le jitter d'un tas au repos.
    if (vn < 0) {
      const e = -vn > RESTITUTION_SLOP ? this.params.restitution : 0;
      const jn = (-(1 + e) * vn) / (imA + imB);
      av.x -= jn * imA * nx; av.y -= jn * imA * ny; av.z -= jn * imA * nz;
      if (bv) { bv.x += jn * imB * nx; bv.y += jn * imB * ny; bv.z += jn * imB * nz; }
    }

    // --- 2. Frottement de glissement (tangentiel). ---
    // Composante tangentielle de la vitesse de surface relative.
    let tx = rvx - vn * nx;
    let ty = rvy - vn * ny;
    let tz = rvz - vn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl > 1e-6) {
      tx /= tl; ty /= tl; tz /= tl;

      // Masse effective tangentielle : 1/m + r²/I de chaque corps (|r × t| = r).
      const kt = imA + imB + iiA * ra * ra + iiB * rb * rb;
      const jt = (tl / kt) * this.params.friction; // on dissipe une fraction de la vitesse de surface

      // Impulsion P sur B (et −P sur A), dirigée pour réduire la vitesse tangentielle.
      const px = -jt * tx, py = -jt * ty, pz = -jt * tz;

      // A reçoit −P (linéaire + couple ω -= 1/I · (r × P)).
      av.x -= imA * px; av.y -= imA * py; av.z -= imA * pz;
      aw.x -= iiA * (ray * pz - raz * py);
      aw.y -= iiA * (raz * px - rax * pz);
      aw.z -= iiA * (rax * py - ray * px);

      if (bv && bw) {
        bv.x += imB * px; bv.y += imB * py; bv.z += imB * pz;
        bw.x += iiB * (rby * pz - rbz * py);
        bw.y += iiB * (rbz * px - rbx * pz);
        bw.z += iiB * (rbx * py - rby * px);
      }
    }

    // --- 3. Frottement de pivotement (twist) : amortit la rotation relative
    //        autour de la normale, invisible au glissement. ---
    const iiSum = iiA + iiB;
    if (iiSum > 1e-9) {
      const wan = aw.x * nx + aw.y * ny + aw.z * nz;
      const wbn = bw ? bw.x * nx + bw.y * ny + bw.z * nz : 0;
      const jw = ((wbn - wan) / iiSum) * this.params.friction * TWIST;
      aw.x += iiA * jw * nx; aw.y += iiA * jw * ny; aw.z += iiA * jw * nz;
      if (bw) { bw.x -= iiB * jw * nx; bw.y -= iiB * jw * ny; bw.z -= iiB * jw * nz; }
    }
  }
}

function cellOf(coord: number, cell: number): number {
  return Math.floor(coord / cell);
}

function hashCell(x: number, y: number, z: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
}

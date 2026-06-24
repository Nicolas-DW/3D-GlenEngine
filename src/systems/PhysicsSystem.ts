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

/** Contact mis en cache pour un sous-pas (b = -1 -> paroi statique). */
interface Contact {
  a: number;
  b: number;
  nx: number;
  ny: number;
  nz: number;
  depth: number;
}

const SLOP = 0.005; // chevauchement toléré au repos (sous lequel on ne corrige plus)
const BETA = 0.2; // fraction de pénétration corrigée par sous-pas (Baumgarte, douce)
const VEL_ITERS = 6; // itérations du solveur de vitesse (Gauss-Seidel -> convergence)

const RESTITUTION_SLOP = 0.4; // pas de rebond sous cette vitesse d'approche (m/s)
const TWIST = 0.5; // force du frottement de pivotement vs glissement

// Mise au repos / sommeil (n'agissent que sur les corps EN CONTACT, jamais en vol).
const STOP_LINEAR_SQ = 0.0009; // |v| < 0.03 m/s   -> arrêt net
const DAMP_LINEAR_SQ = 0.04; //   |v| < 0.2 m/s    -> fort amortissement
const DAMP_ANGULAR_SQ = 0.25; //  |ω| < 0.5 rad/s  -> fort amortissement
const STOP_ANGULAR = 0.08; //     |ω| < 0.08 rad/s -> rotation annulée
const SLEEP_LINEAR_SQ = 0.01; //  |v| < 0.1 m/s  } seuils de calme
const SLEEP_ANGULAR_SQ = 0.04; // |ω| < 0.2 rad/s }
const SLEEP_TIME = 0.3; // s de calme continu avant de dormir
const WAKE_SPEED = 0.4; // vitesse d'approche qui réveille un corps endormi (m/s)

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
 * Système physique : pas de temps FIXE, broad phase par grille spatiale, et un
 * **solveur d'impulsions séquentiel itéré (Gauss-Seidel)** avec correction de
 * position douce (Baumgarte) et **mise en sommeil** des corps au repos.
 *
 * Boucle d'un sous-pas :
 *   forces (gravité) -> intégration des positions -> détection des contacts ->
 *   N itérations de vitesse -> 1 passe de correction de position -> rotation ->
 *   amortissement/sommeil.
 *
 * Séparer vitesse et position (« split impulse ») évite que la dépénétration
 * injecte de l'énergie ; itérer la vitesse fait converger les piles ; le sommeil
 * garantit l'immobilité finale exacte.
 */
export class PhysicsSystem implements System {
  private readonly particles: Particle[] = [];
  private maxRadius = 0;
  private readonly grid = new Map<number, number[]>();
  private accumulator = 0;
  private readonly fixedStep = 1 / 120;

  private readonly contacts: Contact[] = []; // pool réutilisé (zéro alloc/sous-pas)
  private contactCount = 0;

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
    this.applyForces(h);
    this.integratePositions(h);
    this.buildContacts();
    for (let it = 0; it < VEL_ITERS; it++) this.solveVelocities(it === 0);
    this.solvePositions();
    this.integrateOrientation(h);
    this.settleAndSleep(h);
  }

  /** Gravité + amortissement de l'air sur les vitesses (corps éveillés). */
  private applyForces(h: number): void {
    const damping = this.params.damping;
    const dv = this.params.gravity * h;
    for (const { body } of this.particles) {
      if (body.sleeping) continue;
      const v = body.velocity;
      v.y += dv;
      v.x *= damping;
      v.y *= damping;
      v.z *= damping;
    }
  }

  /** Intègre les positions (corps éveillés uniquement). */
  private integratePositions(h: number): void {
    for (const { body, transform } of this.particles) {
      if (body.sleeping) continue;
      const v = body.velocity;
      const p = transform.position;
      p.x += v.x * h;
      p.y += v.y * h;
      p.z += v.z * h;
    }
  }

  /** Détecte tous les contacts (parois + paires via grille) et les met en cache. */
  private buildContacts(): void {
    this.contactCount = 0;
    const list = this.particles;
    const bd = this.bounds;
    for (const p of list) { p.body.contacted = false; p.body.supported = false; }

    // Parois (la normale est dirigée de la bille VERS la paroi).
    for (let i = 0; i < list.length; i++) {
      const p = list[i].transform.position;
      const r = list[i].body.radius;
      if (p.x - r < bd.minX) this.addContact(i, -1, -1, 0, 0, bd.minX - (p.x - r));
      else if (p.x + r > bd.maxX) this.addContact(i, -1, 1, 0, 0, p.x + r - bd.maxX);
      if (p.z - r < bd.minZ) this.addContact(i, -1, 0, 0, -1, bd.minZ - (p.z - r));
      else if (p.z + r > bd.maxZ) this.addContact(i, -1, 0, 0, 1, p.z + r - bd.maxZ);
      if (p.y - r < bd.minY) this.addContact(i, -1, 0, -1, 0, bd.minY - (p.y - r));
    }

    // Paires : broad phase par grille (cellule = diamètre max).
    if (list.length >= 2) {
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
        const pa = list[i].transform.position;
        const ra = list[i].body.radius;
        const cx = cellOf(pa.x, cell);
        const cy = cellOf(pa.y, cell);
        const cz = cellOf(pa.z, cell);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            for (let oz = -1; oz <= 1; oz++) {
              const bucket = grid.get(hashCell(cx + ox, cy + oy, cz + oz));
              if (!bucket) continue;
              for (const j of bucket) {
                if (j <= i) continue;
                const pb = list[j].transform.position;
                const dx = pb.x - pa.x;
                const dy = pb.y - pa.y;
                const dz = pb.z - pa.z;
                const minDist = ra + list[j].body.radius;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 >= minDist * minDist || d2 < 1e-12) continue;
                const dist = Math.sqrt(d2);
                this.addContact(i, j, dx / dist, dy / dist, dz / dist, minDist - dist);
              }
            }
          }
        }
      }
    }
  }

  private addContact(a: number, b: number, nx: number, ny: number, nz: number, depth: number): void {
    this.particles[a].body.contacted = true;
    if (b >= 0) this.particles[b].body.contacted = true;

    // « Soutenu » = a un appui sous lui (n dirigée de la bille vers ce qui la
    // porte). n.y < 0 -> b/paroi est sous a ; n.y > 0 -> a est sous b.
    if (ny < -0.3) this.particles[a].body.supported = true;
    else if (ny > 0.3 && b >= 0) this.particles[b].body.supported = true;

    let c = this.contacts[this.contactCount];
    if (!c) {
      c = { a: 0, b: 0, nx: 0, ny: 0, nz: 0, depth: 0 };
      this.contacts[this.contactCount] = c;
    }
    c.a = a; c.b = b; c.nx = nx; c.ny = ny; c.nz = nz; c.depth = depth;
    this.contactCount++;
  }

  /** Une itération du solveur de vitesse sur tous les contacts. */
  private solveVelocities(bounce: boolean): void {
    for (let k = 0; k < this.contactCount; k++) {
      const c = this.contacts[k];
      const a = this.particles[c.a].body;
      const b = c.b >= 0 ? this.particles[c.b].body : null;
      this.resolveContact(a, b, c.nx, c.ny, c.nz, bounce);
    }
  }

  /** Correction de position douce (Baumgarte) : sépare les corps qui pénètrent. */
  private solvePositions(): void {
    for (let k = 0; k < this.contactCount; k++) {
      const c = this.contacts[k];
      const pen = c.depth - SLOP;
      if (pen <= 0) continue;
      const a = this.particles[c.a];
      if (c.b < 0) {
        if (a.body.sleeping) continue;
        const k2 = BETA * pen; // paroi immobile : on repousse A à l'opposé de n
        a.transform.position.x -= c.nx * k2;
        a.transform.position.y -= c.ny * k2;
        a.transform.position.z -= c.nz * k2;
      } else {
        const b = this.particles[c.b];
        const imA = a.body.sleeping ? 0 : a.body.invMass;
        const imB = b.body.sleeping ? 0 : b.body.invMass;
        const sum = imA + imB;
        if (sum <= 0) continue;
        const k2 = (BETA * pen) / sum;
        a.transform.position.x -= c.nx * k2 * imA;
        a.transform.position.y -= c.ny * k2 * imA;
        a.transform.position.z -= c.nz * k2 * imA;
        b.transform.position.x += c.nx * k2 * imB;
        b.transform.position.y += c.ny * k2 * imB;
        b.transform.position.z += c.nz * k2 * imB;
      }
    }
  }

  private integrateOrientation(h: number): void {
    const d = this.params.angularDamping;
    for (const { body, transform } of this.particles) {
      if (body.sleeping) continue;
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

  /**
   * Amortit fortement (voire annule) les corps lents EN CONTACT, et endort ceux
   * restés calmes assez longtemps. Une bille en chute libre (sans contact) n'est
   * jamais touchée -> elle tombe sous n'importe quelle gravité, et ne dort jamais.
   */
  private settleAndSleep(h: number): void {
    for (const { body } of this.particles) {
      if (body.sleeping) continue;
      if (!body.contacted) { body.stillTime = 0; continue; }

      const v = body.velocity;
      let v2 = v.x * v.x + v.y * v.y + v.z * v.z;
      if (v2 < STOP_LINEAR_SQ) { v.x = 0; v.y = 0; v.z = 0; v2 = 0; }
      else if (v2 < DAMP_LINEAR_SQ) { v.x *= 0.6; v.y *= 0.6; v.z *= 0.6; v2 *= 0.36; }

      const w = body.angularVelocity;
      let w2 = w.x * w.x + w.y * w.y + w.z * w.z;
      if (w2 < DAMP_ANGULAR_SQ) { w.x *= 0.6; w.y *= 0.6; w.z *= 0.6; w2 *= 0.36; }

      if (body.supported && v2 < SLEEP_LINEAR_SQ && w2 < SLEEP_ANGULAR_SQ) {
        body.stillTime += h;
        if (body.stillTime >= SLEEP_TIME) {
          body.sleeping = true;
          v.x = 0; v.y = 0; v.z = 0;
          w.x = 0; w.y = 0; w.z = 0;
        }
      } else {
        body.stillTime = 0;
      }
    }
  }

  /**
   * Solveur d'impulsions pour UN contact. `n` unitaire, de A vers B (ou vers la
   * paroi si `b === null`). Un corps endormi est traité comme immobile (1/m = 0)
   * sauf si l'approche est assez vive : il est alors réveillé.
   *
   * 1. Impulsion normale (restitution, annulée à faible vitesse).
   * 2. Frottement de GLISSEMENT (vitesse de surface tangentielle `v + ω × r`).
   * 3. Frottement de PIVOTEMENT (rotation autour de la normale, invisible au
   *    glissement) -> empêche une bille de tourner comme une toupie.
   */
  private resolveContact(
    a: RigidBody,
    b: RigidBody | null,
    nx: number,
    ny: number,
    nz: number,
    bounce: boolean,
  ): void {
    const ra = a.radius;
    const rb = b ? b.radius : 0;
    const rax = nx * ra, ray = ny * ra, raz = nz * ra; // décalage A -> contact
    const rbx = -nx * rb, rby = -ny * rb, rbz = -nz * rb; // décalage B -> contact

    const av = a.velocity, aw = a.angularVelocity;
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

    const rvx = vbx - vax;
    const rvy = vby - vay;
    const rvz = vbz - vaz;
    const vn = rvx * nx + rvy * ny + rvz * nz;

    // Réveil : une approche assez vive sort les corps du sommeil.
    if (bounce && vn < -WAKE_SPEED) {
      wake(a);
      if (b) wake(b);
    }

    // Masses effectives : un corps endormi compte comme immobile (1/m = 0).
    const imA = a.sleeping ? 0 : a.invMass;
    const imB = !b || b.sleeping ? 0 : b.invMass;
    const iiA = a.sleeping ? 0 : a.invInertia;
    const iiB = !b || b.sleeping ? 0 : b.invInertia;
    const imSum = imA + imB;
    if (imSum <= 0) return; // deux corps immobiles/endormis : rien à faire

    // --- 1. Impulsion normale (rebond, restitution annulée à faible approche). ---
    if (vn < 0) {
      const e = bounce && -vn > RESTITUTION_SLOP ? this.params.restitution : 0;
      const jn = (-(1 + e) * vn) / imSum;
      av.x -= jn * imA * nx; av.y -= jn * imA * ny; av.z -= jn * imA * nz;
      if (bv) { bv.x += jn * imB * nx; bv.y += jn * imB * ny; bv.z += jn * imB * nz; }
    }

    // --- 2. Frottement de glissement (tangentiel). ---
    let tx = rvx - vn * nx;
    let ty = rvy - vn * ny;
    let tz = rvz - vn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl > 1e-6) {
      tx /= tl; ty /= tl; tz /= tl;
      const kt = imSum + iiA * ra * ra + iiB * rb * rb; // |r × t| = r
      const jt = (tl / kt) * this.params.friction;
      const px = -jt * tx, py = -jt * ty, pz = -jt * tz;

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

    // --- 3. Frottement de pivotement (twist) autour de la normale. ---
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

/** Réveille un corps endormi (remet ses compteurs de calme à zéro). */
function wake(body: RigidBody): void {
  body.sleeping = false;
  body.stillTime = 0;
}

function cellOf(coord: number, cell: number): number {
  return Math.floor(coord / cell);
}

function hashCell(x: number, y: number, z: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
}

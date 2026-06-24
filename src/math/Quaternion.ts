import { Vec3 } from "./Vec3";

/**
 * Quaternion unitaire (x, y, z, w) représentant une rotation.
 *
 * Pourquoi pas des angles d'Euler ? Pas de gimbal lock, composition par simple
 * multiplication, et interpolation douce (slerp). En contrepartie c'est moins
 * lisible à l'œil nu — d'où les helpers `setFromAxisAngle` / `setFromEuler`.
 *
 * Convention : `w` est la partie scalaire ; l'identité (aucune rotation) est
 * (0, 0, 0, 1). On garde le quaternion normalisé (longueur 1) car seuls les
 * quaternions unitaires encodent une rotation pure.
 */
export class Quaternion {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  copy(q: Quaternion): this {
    return this.set(q.x, q.y, q.z, q.w);
  }

  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  identity(): this {
    return this.set(0, 0, 0, 1);
  }

  /** Rotation d'`angle` radians autour d'un `axis` (supposé normalisé). */
  setFromAxisAngle(axis: Vec3, angle: number): this {
    const half = angle * 0.5;
    const s = Math.sin(half);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(half));
  }

  /**
   * Compose des angles d'Euler (radians) dans l'ordre X puis Y puis Z.
   * Pratique comme pont avec une API "humaine" ou un delta de rotation.
   */
  setFromEuler(x: number, y: number, z: number): this {
    const cx = Math.cos(x * 0.5), sx = Math.sin(x * 0.5);
    const cy = Math.cos(y * 0.5), sy = Math.sin(y * 0.5);
    const cz = Math.cos(z * 0.5), sz = Math.sin(z * 0.5);
    // q = qz * qy * qx
    this.x = sx * cy * cz - cx * sy * sz;
    this.y = cx * sy * cz + sx * cy * sz;
    this.z = cx * cy * sz - sx * sy * cz;
    this.w = cx * cy * cz + sx * sy * sz;
    return this;
  }

  /** this = this * q  (applique `q` "avant" this : composition de rotations). */
  multiply(q: Quaternion): this {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = q.x, by = q.y, bz = q.z, bw = q.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  /** Renormalise : corrige la dérive numérique accumulée par les multiplications. */
  normalize(): this {
    const len = this.length();
    if (len < 1e-8) return this.identity();
    const inv = 1 / len;
    this.x *= inv;
    this.y *= inv;
    this.z *= inv;
    this.w *= inv;
    return this;
  }
}

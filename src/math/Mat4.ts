import type { Quaternion } from "./Quaternion";
import { Vec3 } from "./Vec3";

/**
 * Matrice 4x4 stockée en column-major (ordre attendu par WebGL/GLSL).
 * Les éléments sont dans un Float32Array de 16 cases, prêt à être envoyé
 * au GPU via uniformMatrix4fv sans transposition.
 *
 * Indexation column-major : m[col * 4 + row].
 */
export class Mat4 {
  readonly data: Float32Array;

  constructor() {
    this.data = new Float32Array(16);
    this.identity();
  }

  identity(): this {
    const m = this.data;
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return this;
  }

  copy(src: Mat4): this {
    this.data.set(src.data);
    return this;
  }

  /** this = this * b  (b appliquée "avant" this, convention OpenGL). */
  multiply(b: Mat4): this {
    const a = this.data;
    const bd = b.data;
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        out[col * 4 + row] =
          a[0 * 4 + row] * bd[col * 4 + 0] +
          a[1 * 4 + row] * bd[col * 4 + 1] +
          a[2 * 4 + row] * bd[col * 4 + 2] +
          a[3 * 4 + row] * bd[col * 4 + 3];
      }
    }
    this.data.set(out);
    return this;
  }

  setTranslation(x: number, y: number, z: number): this {
    this.identity();
    this.data[12] = x;
    this.data[13] = y;
    this.data[14] = z;
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.identity();
    this.data[0] = x;
    this.data[5] = y;
    this.data[10] = z;
    return this;
  }

  setRotationX(rad: number): this {
    const c = Math.cos(rad), s = Math.sin(rad);
    this.identity();
    this.data[5] = c; this.data[6] = s;
    this.data[9] = -s; this.data[10] = c;
    return this;
  }

  setRotationY(rad: number): this {
    const c = Math.cos(rad), s = Math.sin(rad);
    this.identity();
    this.data[0] = c; this.data[2] = -s;
    this.data[8] = s; this.data[10] = c;
    return this;
  }

  setRotationZ(rad: number): this {
    const c = Math.cos(rad), s = Math.sin(rad);
    this.identity();
    this.data[0] = c; this.data[1] = s;
    this.data[4] = -s; this.data[5] = c;
    return this;
  }

  /**
   * Matrice de rotation à partir d'un quaternion unitaire.
   * Formule standard : on développe la rotation encodée par (x, y, z, w) en
   * une matrice 3x3 (logée dans la 4x4), en column-major comme le reste.
   */
  setFromQuaternion(q: Quaternion): this {
    const { x, y, z, w } = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const m = this.data;
    m[0] = 1 - (yy + zz); m[1] = xy + wz;       m[2] = xz - wy;       m[3] = 0;
    m[4] = xy - wz;       m[5] = 1 - (xx + zz); m[6] = yz + wx;       m[7] = 0;
    m[8] = xz + wy;       m[9] = yz - wx;       m[10] = 1 - (xx + yy); m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return this;
  }

  /** Projection perspective. fovY en radians. */
  setPerspective(fovY: number, aspect: number, near: number, far: number): this {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    const m = this.data;
    m[0] = f / aspect; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = f; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = (far + near) * nf; m[11] = -1;
    m[12] = 0; m[13] = 0; m[14] = 2 * far * near * nf; m[15] = 0;
    return this;
  }

  /** Matrice de vue regardant `target` depuis `eye`. */
  setLookAt(eye: Vec3, target: Vec3, up: Vec3): this {
    const z = eye.sub(target).normalized();      // axe avant (inversé)
    const x = up.cross(z).normalized();           // axe droit
    const y = z.cross(x);                          // axe haut recalculé
    const m = this.data;
    m[0] = x.x; m[1] = y.x; m[2] = z.x; m[3] = 0;
    m[4] = x.y; m[5] = y.y; m[6] = z.y; m[7] = 0;
    m[8] = x.z; m[9] = y.z; m[10] = z.z; m[11] = 0;
    m[12] = -x.dot(eye); m[13] = -y.dot(eye); m[14] = -z.dot(eye); m[15] = 1;
    return this;
  }
}

import { Mat4 } from "../math/Mat4";
import { Vec3 } from "../math/Vec3";

/**
 * Composant caméra perspective (données). La position vient du Transform de
 * l'entité (passée à viewMatrix) ; on regarde `target`.
 */
export class Camera {
  fovY = (60 * Math.PI) / 180;
  near = 0.1;
  far = 100;
  readonly target = new Vec3(0, 0, 0);
  readonly up = new Vec3(0, 1, 0);

  private readonly _proj = new Mat4();
  private readonly _view = new Mat4();

  projectionMatrix(aspect: number): Mat4 {
    return this._proj.setPerspective(this.fovY, aspect, this.near, this.far);
  }

  viewMatrix(eye: Vec3): Mat4 {
    return this._view.setLookAt(eye, this.target, this.up);
  }
}

import { Component } from "../core/Component";
import { Mat4 } from "../math/Mat4";
import { Vec3 } from "../math/Vec3";

/**
 * Caméra perspective. La position vient du Transform de l'hôte ; la caméra
 * regarde `target`. On évite l'inversion de matrice en construisant
 * directement la matrice de vue via lookAt.
 */
export class Camera extends Component {
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

  viewMatrix(): Mat4 {
    return this._view.setLookAt(this.transform.position, this.target, this.up);
  }
}

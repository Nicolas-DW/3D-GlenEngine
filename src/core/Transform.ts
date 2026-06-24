import { Mat4 } from "../math/Mat4";
import { Vec3 } from "../math/Vec3";
import type { GameObject } from "./GameObject";

/**
 * Position / rotation (angles d'Euler en radians) / échelle d'un GameObject.
 *
 * On utilise des angles d'Euler plutôt que des quaternions : c'est moins
 * robuste (gimbal lock) mais largement suffisant pour un premier jet, et
 * bien plus simple à lire. Le passage aux quaternions est une évolution
 * naturelle plus tard.
 */
export class Transform {
  readonly position = new Vec3(0, 0, 0);
  readonly rotation = new Vec3(0, 0, 0);
  readonly scale = new Vec3(1, 1, 1);

  private readonly _local = new Mat4();
  private readonly _world = new Mat4();
  private readonly _tmp = new Mat4();

  constructor(readonly gameObject: GameObject) {}

  /** Matrice locale (TRS) recomposée à la demande. */
  localMatrix(): Mat4 {
    const local = this._local.setTranslation(
      this.position.x,
      this.position.y,
      this.position.z,
    );
    // Ordre R = Rz * Ry * Rx ; puis T * R * S.
    local.multiply(this._tmp.setRotationZ(this.rotation.z));
    local.multiply(this._tmp.setRotationY(this.rotation.y));
    local.multiply(this._tmp.setRotationX(this.rotation.x));
    local.multiply(this._tmp.setScale(this.scale.x, this.scale.y, this.scale.z));
    return local;
  }

  /** Matrice monde = matrice monde du parent * matrice locale. */
  worldMatrix(): Mat4 {
    const parent = this.gameObject.parent;
    if (parent) {
      this._world.copy(parent.transform.worldMatrix());
      this._world.multiply(this.localMatrix());
    } else {
      this._world.copy(this.localMatrix());
    }
    return this._world;
  }
}

import { Mat4 } from "../math/Mat4";
import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";
import type { GameObject } from "./GameObject";

/**
 * Position / rotation (quaternion) / échelle d'un GameObject.
 *
 * La rotation est un quaternion unitaire : pas de gimbal lock, composition par
 * multiplication, interpolation possible. Pour fixer une orientation de façon
 * lisible, on passe par `setEuler(x, y, z)` qui convertit des angles en interne.
 */
export class Transform {
  readonly position = new Vec3(0, 0, 0);
  readonly rotation = new Quaternion();
  readonly scale = new Vec3(1, 1, 1);

  private readonly _local = new Mat4();
  private readonly _world = new Mat4();
  private readonly _tmp = new Mat4();

  constructor(readonly gameObject: GameObject) {}

  /** Fixe la rotation à partir d'angles d'Euler (radians), pour le confort. */
  setEuler(x: number, y: number, z: number): this {
    this.rotation.setFromEuler(x, y, z);
    return this;
  }

  /** Matrice locale (TRS) recomposée à la demande. */
  localMatrix(): Mat4 {
    const local = this._local.setTranslation(
      this.position.x,
      this.position.y,
      this.position.z,
    );
    // T * R * S : une seule matrice de rotation, issue du quaternion.
    local.multiply(this._tmp.setFromQuaternion(this.rotation));
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

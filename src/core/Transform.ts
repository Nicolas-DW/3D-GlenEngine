import { Mat4 } from "../math/Mat4";
import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";

/**
 * Composant de transformation : position / rotation (quaternion) / échelle.
 *
 * La hiérarchie passe par une référence directe au Transform parent (et non par
 * une entité), pour que worldMatrix() reste autonome côté World.
 */
export class Transform {
  readonly position = new Vec3(0, 0, 0);
  readonly rotation = new Quaternion();
  readonly scale = new Vec3(1, 1, 1);
  parent: Transform | null = null;

  private readonly _local = new Mat4();
  private readonly _world = new Mat4();
  private readonly _tmp = new Mat4();

  /** Fixe la rotation à partir d'angles d'Euler (radians), pour le confort. */
  setEuler(x: number, y: number, z: number): this {
    this.rotation.setFromEuler(x, y, z);
    return this;
  }

  /** Matrice locale (TRS). */
  localMatrix(): Mat4 {
    const local = this._local.setTranslation(
      this.position.x,
      this.position.y,
      this.position.z,
    );
    local.multiply(this._tmp.setFromQuaternion(this.rotation));
    local.multiply(this._tmp.setScale(this.scale.x, this.scale.y, this.scale.z));
    return local;
  }

  /** Matrice monde = matrice monde du parent * matrice locale. */
  worldMatrix(): Mat4 {
    if (this.parent) {
      this._world.copy(this.parent.worldMatrix());
      this._world.multiply(this.localMatrix());
    } else {
      this._world.copy(this.localMatrix());
    }
    return this._world;
  }
}

import { Component } from "../core/Component";
import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";

/**
 * Composant de démonstration : fait tourner l'objet sur lui-même.
 * Vitesses exprimées en radians par seconde, par axe.
 */
export class Rotator extends Component {
  /** Quaternion réutilisé chaque frame pour éviter une allocation. */
  private readonly _delta = new Quaternion();

  constructor(public speed = new Vec3(0.4, 0.8, 0)) {
    super();
  }

  override update(dt: number): void {
    // Rotation de cette frame, puis composition : rotation = rotation * delta.
    this._delta.setFromEuler(this.speed.x * dt, this.speed.y * dt, this.speed.z * dt);
    this.transform.rotation.multiply(this._delta).normalize();
  }
}

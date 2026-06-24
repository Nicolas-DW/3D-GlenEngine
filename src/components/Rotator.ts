import { Component } from "../core/Component";
import { Vec3 } from "../math/Vec3";

/**
 * Composant de démonstration : fait tourner l'objet sur lui-même.
 * Vitesses exprimées en radians par seconde.
 */
export class Rotator extends Component {
  constructor(public speed = new Vec3(0.4, 0.8, 0)) {
    super();
  }

  override update(dt: number): void {
    const r = this.transform.rotation;
    r.x += this.speed.x * dt;
    r.y += this.speed.y * dt;
    r.z += this.speed.z * dt;
  }
}

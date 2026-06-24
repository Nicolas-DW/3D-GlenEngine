import { Vec3 } from "../math/Vec3";

/**
 * Composant corps physique (données) : vitesse linéaire, vitesse angulaire (pour
 * le roulement) et rayon. La simulation est dans le PhysicsSystem.
 */
export class RigidBody {
  readonly velocity = new Vec3(0, 0, 0);
  readonly angularVelocity = new Vec3(0, 0, 0);

  constructor(public radius = 0.3) {}
}

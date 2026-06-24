import { Vec3 } from "../math/Vec3";

/**
 * Composant corps physique (données pures) : vitesse linéaire, vitesse angulaire
 * et propriétés inertielles. La simulation vit dans le PhysicsSystem.
 *
 * On précalcule les **inverses** de masse et d'inertie : un solveur d'impulsions
 * ne divise jamais par la masse (coûteux, et 0 = corps statique). Pour une sphère
 * pleine homogène, le moment d'inertie est `I = ⅖·m·r²` autour de tout axe.
 */
export class RigidBody {
  readonly velocity = new Vec3(0, 0, 0);
  readonly angularVelocity = new Vec3(0, 0, 0);

  readonly radius: number;
  readonly mass: number;
  readonly invMass: number;
  readonly invInertia: number; // 1 / I, avec I = ⅖·m·r²

  constructor(radius = 0.3, mass = 1) {
    this.radius = radius;
    this.mass = mass;
    this.invMass = 1 / mass;
    this.invInertia = 1 / (0.4 * mass * radius * radius);
  }
}

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

  /** Transitoire : le PhysicsSystem le met à true quand le corps a un contact ce
   *  sous-pas (sert à n'amortir au repos QUE les corps posés, pas ceux en vol). */
  contacted = false;
  /** Mise en sommeil : un corps lent et posé depuis assez longtemps est gelé
   *  (gravité + intégration ignorées) jusqu'à ce qu'un choc le réveille. */
  sleeping = false;
  stillTime = 0; // durée écoulée au calme (s), pour décider du sommeil
  /** Transitoire : a un appui par en dessous ce sous-pas (garde-fou anti-flottaison
   *  — on n'endort que les corps réellement soutenus). */
  supported = false;

  constructor(radius = 0.3, mass = 1) {
    this.radius = radius;
    this.mass = mass;
    this.invMass = 1 / mass;
    this.invInertia = 1 / (0.4 * mass * radius * radius);
  }
}

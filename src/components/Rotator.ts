import { Vec3 } from "../math/Vec3";

/**
 * Composant de démonstration (données) : vitesse de rotation en radians/seconde
 * par axe. La logique est dans le RotatorSystem.
 */
export class Rotator {
  constructor(public speed = new Vec3(0.4, 0.8, 0)) {}
}

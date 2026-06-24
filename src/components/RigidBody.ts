import { Component } from "../core/Component";
import { Vec3 } from "../math/Vec3";

/**
 * Corps physique d'une bille (étape 3 du plan). Porte juste l'état : vitesse et
 * rayon. Volontairement SANS update() : ce n'est pas le composant qui se met à
 * jour seul — c'est le PhysicsWorld qui voit TOUS les corps et fait le pas
 * global (sinon les collisions bille-bille seraient impossibles, cf. plan).
 */
export class RigidBody extends Component {
  readonly velocity = new Vec3(0, 0, 0);
  /** Vitesse angulaire (rad/s) ; sert au roulement, intégrée dans l'orientation. */
  readonly angularVelocity = new Vec3(0, 0, 0);

  constructor(public radius = 0.3) {
    super();
  }
}

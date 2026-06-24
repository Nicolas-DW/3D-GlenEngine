import { Rotator } from "../components/Rotator";
import { Transform } from "../core/Transform";
import type { System, World } from "../core/World";
import { Quaternion } from "../math/Quaternion";

/** Fait tourner toutes les entités ayant un Rotator + un Transform. */
export class RotatorSystem implements System {
  private readonly delta = new Quaternion();

  update(world: World, dt: number): void {
    for (const [entity, rotator] of world.view(Rotator)) {
      const transform = world.get(entity, Transform);
      if (!transform) continue;
      this.delta.setFromEuler(rotator.speed.x * dt, rotator.speed.y * dt, rotator.speed.z * dt);
      transform.rotation.multiply(this.delta).normalize();
    }
  }
}

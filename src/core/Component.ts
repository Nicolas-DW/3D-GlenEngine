import type { GameObject } from "./GameObject";

/**
 * Brique de comportement attachée à un GameObject.
 *
 * Dans cette architecture "GameObject/Component" (façon Unity), le composant
 * porte SA logique (contrairement à un ECS pur où la logique vit dans des
 * systèmes séparés). Cycle de vie : start() une fois, puis update(dt) chaque
 * frame.
 */
export abstract class Component {
  /** Renseigné automatiquement par GameObject.addComponent(). */
  gameObject!: GameObject;

  /** Raccourci pratique vers le Transform du GameObject hôte. */
  get transform() {
    return this.gameObject.transform;
  }

  /** Appelé une fois, avant le premier update. */
  start(): void {}

  /** Appelé chaque frame. dt = temps écoulé en secondes. */
  update(_dt: number): void {}
}

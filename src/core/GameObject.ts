import { Component } from "./Component";
import { Transform } from "./Transform";

type ComponentClass<T extends Component> = new (...args: never[]) => T;

/**
 * Conteneur de la scène. Il ne fait presque rien lui-même : il possède un
 * Transform, une liste de Components (qui portent la logique) et des enfants
 * (pour la hiérarchie). On "compose" un objet de jeu en lui ajoutant des
 * composants, plutôt qu'en héritant de classes.
 */
export class GameObject {
  readonly transform: Transform = new Transform(this);
  readonly components: Component[] = [];
  readonly children: GameObject[] = [];
  parent: GameObject | null = null;

  constructor(public name: string = "GameObject") {}

  /** Attache un composant et renvoie l'instance (pour le configurer). */
  addComponent<T extends Component>(component: T): T {
    component.gameObject = this;
    this.components.push(component);
    return component;
  }

  /** Récupère le premier composant d'un type donné. */
  getComponent<T extends Component>(type: ComponentClass<T>): T | undefined {
    return this.components.find((c) => c instanceof type) as T | undefined;
  }

  /** Ajoute un enfant et met à jour la relation parent. */
  addChild(child: GameObject): GameObject {
    child.parent = this;
    this.children.push(child);
    return child;
  }
}

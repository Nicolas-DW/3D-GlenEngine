/**
 * Cœur ECS : un World possède des entités (de simples ID) et des « stores » de
 * composants (données pures), un store par type de composant.
 *
 * Les Systèmes portent la logique : ils balaient les entités ayant tel(s)
 * composant(s) via view()/get(). C'est l'inverse de GameObject/Component, où
 * chaque composant portait sa propre logique.
 */
export type Entity = number;

export type ComponentClass<T> = new (...args: never[]) => T;

export interface System {
  update(world: World, dt: number): void;
}

const EMPTY = new Map<Entity, never>();

export class World {
  private nextId = 1;
  // type de composant -> (entité -> instance du composant)
  private readonly stores = new Map<Function, Map<Entity, object>>();

  /** Crée une nouvelle entité (juste un ID). */
  create(): Entity {
    return this.nextId++;
  }

  /** Attache (ou remplace) un composant sur une entité. */
  add<T extends object>(entity: Entity, component: T): T {
    const key = component.constructor;
    let store = this.stores.get(key);
    if (!store) {
      store = new Map();
      this.stores.set(key, store);
    }
    store.set(entity, component);
    return component;
  }

  /** Retire un composant d'une entité. */
  remove<T>(entity: Entity, type: ComponentClass<T>): void {
    this.stores.get(type)?.delete(entity);
  }

  get<T>(entity: Entity, type: ComponentClass<T>): T | undefined {
    return this.stores.get(type)?.get(entity) as T | undefined;
  }

  has<T>(entity: Entity, type: ComponentClass<T>): boolean {
    return this.stores.get(type)?.has(entity) ?? false;
  }

  /** Détruit une entité et tous ses composants. */
  destroy(entity: Entity): void {
    for (const store of this.stores.values()) store.delete(entity);
  }

  /** Itère sur (entité, composant) pour un type donné. */
  view<T>(type: ComponentClass<T>): IterableIterator<[Entity, T]> {
    const store = (this.stores.get(type) ?? EMPTY) as Map<Entity, T>;
    return store.entries();
  }

  /** Première entité possédant ce composant (ex. la caméra). */
  first<T>(type: ComponentClass<T>): [Entity, T] | undefined {
    const store = this.stores.get(type) as Map<Entity, T> | undefined;
    if (!store) return undefined;
    const next = store.entries().next();
    return next.done ? undefined : next.value;
  }
}

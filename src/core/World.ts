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

/**
 * Store packé d'un type de composant (« sparse-set »).
 *
 * - `dense` / `entities` : tableaux PARALLÈLES et compactés (aucun trou) — l'un
 *   les composants, l'autre l'ID de l'entité en regard. L'itération est donc un
 *   simple `for` contigu.
 * - `index` : entité -> position dans `dense` (la partie « sparse »).
 *
 * Retrait en O(1) par **swap-remove** : on bouche le trou avec le dernier
 * élément puis on `pop()` (l'ordre n'est pas préservé, mais nos systèmes n'en
 * dépendent pas).
 */
class ComponentStore<T extends object> {
  readonly dense: T[] = [];
  readonly entities: Entity[] = [];
  private readonly index = new Map<Entity, number>();

  set(entity: Entity, component: T): T {
    const i = this.index.get(entity);
    if (i !== undefined) {
      this.dense[i] = component; // remplacement en place
      return component;
    }
    this.index.set(entity, this.dense.length);
    this.dense.push(component);
    this.entities.push(entity);
    return component;
  }

  get(entity: Entity): T | undefined {
    const i = this.index.get(entity);
    return i === undefined ? undefined : this.dense[i];
  }

  has(entity: Entity): boolean {
    return this.index.has(entity);
  }

  delete(entity: Entity): void {
    const i = this.index.get(entity);
    if (i === undefined) return;
    const last = this.dense.length - 1;
    if (i !== last) {
      const moved = this.entities[last];
      this.dense[i] = this.dense[last];
      this.entities[i] = moved;
      this.index.set(moved, i); // l'élément déplacé pointe vers le trou comblé
    }
    this.dense.pop();
    this.entities.pop();
    this.index.delete(entity);
  }

  get size(): number {
    return this.dense.length;
  }
}

export class World {
  private nextId = 1;
  // type de composant -> store packé
  private readonly stores = new Map<Function, ComponentStore<object>>();

  /** Crée une nouvelle entité (juste un ID). */
  create(): Entity {
    return this.nextId++;
  }

  /** Attache (ou remplace) un composant sur une entité. */
  add<T extends object>(entity: Entity, component: T): T {
    return this.store(component.constructor).set(entity, component) as T;
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

  /**
   * Itère sur (entité, composant) pour un type donné, en parcourant les tableaux
   * packés. Ne pas ajouter/retirer ce MÊME composant pendant l'itération.
   */
  *view<T>(type: ComponentClass<T>): IterableIterator<[Entity, T]> {
    const store = this.stores.get(type);
    if (!store) return;
    const { dense, entities } = store;
    for (let i = 0; i < dense.length; i++) yield [entities[i], dense[i] as T];
  }

  /** Première entité possédant ce composant (ex. la caméra). */
  first<T>(type: ComponentClass<T>): [Entity, T] | undefined {
    const store = this.stores.get(type);
    if (!store || store.size === 0) return undefined;
    return [store.entities[0], store.dense[0] as T];
  }

  private store(key: Function): ComponentStore<object> {
    let store = this.stores.get(key);
    if (!store) {
      store = new ComponentStore();
      this.stores.set(key, store);
    }
    return store;
  }
}

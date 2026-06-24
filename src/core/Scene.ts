import type { Component } from "./Component";
import { GameObject } from "./GameObject";

/**
 * Racine de la hiérarchie. Fournit des parcours utilitaires pour que le moteur
 * et le renderer puissent itérer sur tous les objets / composants.
 */
export class Scene {
  readonly roots: GameObject[] = [];

  add(go: GameObject): GameObject {
    this.roots.push(go);
    return go;
  }

  /** Retire un objet racine (utilisé pour décharger une expérience). */
  remove(go: GameObject): boolean {
    const i = this.roots.indexOf(go);
    if (i < 0) return false;
    this.roots.splice(i, 1);
    return true;
  }

  /** Itère sur tous les GameObjects de l'arbre (profondeur d'abord). */
  *traverse(): Generator<GameObject> {
    const stack = [...this.roots];
    while (stack.length) {
      const go = stack.pop()!;
      yield go;
      for (const child of go.children) stack.push(child);
    }
  }

  /** Collecte tous les composants d'un type donné dans la scène. */
  getComponents<T extends Component>(type: new (...args: never[]) => T): T[] {
    const out: T[] = [];
    for (const go of this.traverse()) {
      for (const c of go.components) {
        if (c instanceof type) out.push(c as T);
      }
    }
    return out;
  }
}

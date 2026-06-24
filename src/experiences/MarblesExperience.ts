import { MeshRenderer } from "../components/MeshRenderer";
import type { Engine } from "../core/Engine";
import { GameObject } from "../core/GameObject";
import { createCube } from "../geometry/cube";
import { Material } from "../render/Material";
import type { Experience } from "./Experience";

/**
 * Réceptacle de billes — VERSION 0 (étape 1 du plan).
 *
 * Pour l'instant, on monte seulement le RÉCEPTACLE : une boîte à ciel ouvert
 * faite de 5 « murs » (sol + 4 côtés), chacun un cube unité mis à l'échelle.
 * Les billes, la gravité et les collisions sont les étapes suivantes (cf. plan).
 *
 * On partage un seul Mesh et un seul Material entre les murs : le backend ne
 * téléverse la géométrie qu'une fois (cache), c'est gratuit côté GPU.
 */
export class MarblesExperience implements Experience {
  readonly name = "Réceptacle de billes";
  private readonly objects: GameObject[] = [];

  start(engine: Engine): void {
    if (this.objects.length) return; // déjà lancée

    const mesh = createCube();
    const material = new Material([0.55, 0.6, 0.72]);

    const wall = (
      name: string,
      position: [number, number, number],
      scale: [number, number, number],
    ): void => {
      const go = new GameObject(name);
      go.transform.position.set(...position);
      go.transform.scale.set(...scale);
      go.addComponent(new MeshRenderer(mesh, material));
      this.objects.push(go);
      engine.scene.add(go);
    };

    const size = 6; // largeur interne
    const height = 4; // hauteur des parois
    const thick = 0.25; // épaisseur des murs

    wall("sol", [0, -height / 2, 0], [size, thick, size]);
    wall("mur +X", [size / 2, 0, 0], [thick, height, size]);
    wall("mur -X", [-size / 2, 0, 0], [thick, height, size]);
    wall("mur +Z", [0, 0, size / 2], [size, height, thick]);
    wall("mur -Z", [0, 0, -size / 2], [size, height, thick]);
  }

  stop(engine: Engine): void {
    for (const go of this.objects) engine.scene.remove(go);
    this.objects.length = 0;
  }
}

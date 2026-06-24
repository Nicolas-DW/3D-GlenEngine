import { MeshRenderer } from "../components/MeshRenderer";
import { RigidBody } from "../components/RigidBody";
import type { Engine } from "../core/Engine";
import { GameObject } from "../core/GameObject";
import { createCube } from "../geometry/cube";
import { createSphere } from "../geometry/sphere";
import { PhysicsWorld, type Bounds } from "../physics/PhysicsWorld";
import { Material } from "../render/Material";
import { Texture } from "../render/Texture";
import type { Experience } from "./Experience";

const COUNT = 500; // nombre de billes lâchées (rendu instancié : 1 seul draw call)

/**
 * Réceptacle de billes : une boîte ouverte dans laquelle tombent des billes
 * gérées par le PhysicsWorld (gravité + collisions parois + collisions
 * bille-bille). Étapes 1-7 du plan.
 *
 * Reste pour passer à des milliers de billes : broad phase (grille spatiale)
 * et rendu instancié — cf. plan.
 */
export class MarblesExperience implements Experience {
  readonly name = "Réceptacle de billes";
  private readonly objects: GameObject[] = [];

  start(engine: Engine): void {
    if (this.objects.length) return; // déjà lancée

    const size = 6;
    const height = 4;
    const thick = 0.25;
    this.buildContainer(engine, size, height, thick);

    // Limites internes (faces intérieures des murs) ; sommet ouvert.
    const inner = size / 2 - thick / 2;
    const bounds: Bounds = {
      minX: -inner,
      maxX: inner,
      minY: -height / 2 + thick / 2,
      minZ: -inner,
      maxZ: inner,
    };

    const physicsGO = new GameObject("Physics");
    const world = new PhysicsWorld(bounds);
    physicsGO.addComponent(world);
    this.add(engine, physicsGO);

    this.spawnMarbles(engine, world, inner, height / 2);
  }

  stop(engine: Engine): void {
    for (const go of this.objects) engine.scene.remove(go);
    this.objects.length = 0;
  }

  // --- Construction. ----------------------------------------------------------

  private buildContainer(engine: Engine, size: number, height: number, thick: number): void {
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
      this.add(engine, go);
    };

    wall("sol", [0, -height / 2, 0], [size, thick, size]);
    wall("mur +X", [size / 2, 0, 0], [thick, height, size]);
    wall("mur -X", [-size / 2, 0, 0], [thick, height, size]);
    wall("mur +Z", [0, 0, size / 2], [size, height, thick]);
    wall("mur -Z", [0, 0, -size / 2], [size, height, thick]);
  }

  private spawnMarbles(engine: Engine, world: PhysicsWorld, inner: number, top: number): void {
    const radius = 0.3;
    const mesh = createSphere(radius, 16, 12); // une seule géométrie, partagée
    const texture = makeMarbleTexture(); // motif partagé : rend le roulement visible
    const cols = 7;
    const margin = 0.5;
    const spacing = (inner * 2 - margin * 2) / (cols - 1);

    for (let i = 0; i < COUNT; i++) {
      const layer = Math.floor(i / (cols * cols));
      const cell = i % (cols * cols);
      const gx = cell % cols;
      const gz = Math.floor(cell / cols);

      const x = -inner + margin + gx * spacing + jitter();
      const z = -inner + margin + gz * spacing + jitter();
      const y = top + 0.6 + layer * (radius * 2 + 0.3); // empilées au-dessus

      const go = new GameObject(`bille ${i}`);
      go.transform.position.set(x, y, z);
      const color = hslToRgb(((i * 47) % 360) / 360, 0.6, 0.6);
      go.addComponent(new MeshRenderer(mesh, new Material(color, texture)));

      const body = new RigidBody(radius);
      body.velocity.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      go.addComponent(body);
      world.add(body);

      this.add(engine, go);
    }
  }

  private add(engine: Engine, go: GameObject): void {
    this.objects.push(go);
    engine.scene.add(go);
  }
}

// --- Utilitaires. ------------------------------------------------------------

function jitter(): number {
  return (Math.random() - 0.5) * 0.15;
}

/**
 * Damier gris (4×4 cellules) appliqué à toutes les billes. En niveaux de gris,
 * il MODULE la couleur d'instance (gris clair = couleur pleine, gris foncé =
 * couleur assombrie) → le motif révèle la rotation sans masquer la couleur.
 * Mipmappé : exerce la génération de mipmaps du backend WebGPU.
 */
function makeMarbleTexture(): Texture {
  const size = 32;
  const cell = size / 4;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const g = on ? 255 : 150;
      const i = (y * size + x) * 4;
      pixels[i] = g;
      pixels[i + 1] = g;
      pixels[i + 2] = g;
      pixels[i + 3] = 255;
    }
  }
  return Texture.fromPixels(size, size, pixels, { filter: "linear", mipmap: true });
}

/** HSL -> RGB (composantes 0..1), pour varier la couleur des billes. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

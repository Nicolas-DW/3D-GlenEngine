import { MeshRenderer } from "../components/MeshRenderer";
import { RigidBody } from "../components/RigidBody";
import type { Engine } from "../core/Engine";
import { Transform } from "../core/Transform";
import type { Entity, World } from "../core/World";
import { createCube } from "../geometry/cube";
import { createSphere } from "../geometry/sphere";
import { defaultPhysicsParams, PhysicsSystem } from "../systems/PhysicsSystem";
import { Material } from "../render/Material";
import { Texture } from "../render/Texture";
import type { Experience } from "./Experience";

const COUNT = 500; // nombre de billes lâchées (rendu instancié : 1 seul draw call)

/**
 * Réceptacle de billes : une boîte ouverte dans laquelle tombent des billes
 * gérées par un PhysicsSystem (gravité, collisions paroi/bille-bille, frottement
 * + roulement, broad phase).
 */
export class MarblesExperience implements Experience {
  readonly name = "Réceptacle de billes";
  /** Paramètres physiques partagés : réglables en direct depuis la barre d'outils. */
  readonly params = defaultPhysicsParams();
  private readonly entities: Entity[] = [];
  private physics: PhysicsSystem | null = null;

  start(engine: Engine): void {
    if (this.entities.length) return; // déjà lancée
    const world = engine.world;

    const size = 6;
    const height = 4;
    const thick = 0.25;
    this.buildContainer(world, size, height, thick);

    const inner = size / 2 - thick / 2;
    this.physics = new PhysicsSystem(
      {
        minX: -inner,
        maxX: inner,
        minY: -height / 2 + thick / 2,
        minZ: -inner,
        maxZ: inner,
      },
      this.params, // objet partagé -> les sliders agissent en direct
    );
    engine.add(this.physics);

    this.spawnMarbles(world, inner, height / 2);
  }

  stop(engine: Engine): void {
    if (this.physics) {
      engine.remove(this.physics);
      this.physics = null;
    }
    for (const entity of this.entities) engine.world.destroy(entity);
    this.entities.length = 0;
  }

  // --- Construction. ----------------------------------------------------------

  private buildContainer(world: World, size: number, height: number, thick: number): void {
    const mesh = createCube();
    const material = new Material([0.55, 0.6, 0.72]);

    const wall = (position: [number, number, number], scale: [number, number, number]): void => {
      const entity = world.create();
      const transform = world.add(entity, new Transform());
      transform.position.set(...position);
      transform.scale.set(...scale);
      world.add(entity, new MeshRenderer(mesh, material));
      this.entities.push(entity);
    };

    wall([0, -height / 2, 0], [size, thick, size]);
    wall([size / 2, 0, 0], [thick, height, size]);
    wall([-size / 2, 0, 0], [thick, height, size]);
    wall([0, 0, size / 2], [size, height, thick]);
    wall([0, 0, -size / 2], [size, height, thick]);
  }

  private spawnMarbles(world: World, inner: number, top: number): void {
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
      const y = top + 0.6 + layer * (radius * 2 + 0.3);

      const entity = world.create();
      const transform = world.add(entity, new Transform());
      transform.position.set(x, y, z);

      const color = hslToRgb(((i * 47) % 360) / 360, 0.6, 0.6);
      world.add(entity, new MeshRenderer(mesh, new Material(color, texture)));

      const body = new RigidBody(radius);
      body.velocity.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      world.add(entity, body);

      this.entities.push(entity);
    }
  }
}

// --- Utilitaires. ------------------------------------------------------------

function jitter(): number {
  return (Math.random() - 0.5) * 0.15;
}

/**
 * Damier gris (4×4 cellules) partagé par toutes les billes. En niveaux de gris,
 * il module la couleur d'instance → le motif révèle la rotation sans masquer la
 * couleur. Mipmappé. Partagé = l'instancing tient (1 draw call).
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

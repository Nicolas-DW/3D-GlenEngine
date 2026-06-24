import { Camera } from "./components/Camera";
import { MeshRenderer } from "./components/MeshRenderer";
import { Rotator } from "./components/Rotator";
import { Engine } from "./core/Engine";
import { Transform } from "./core/Transform";
import type { Entity } from "./core/World";
import { MarblesExperience } from "./experiences/MarblesExperience";
import { createCube } from "./geometry/cube";
import { buildGltf, type GltfJson } from "./loaders/GltfLoader";
import { Vec3 } from "./math/Vec3";
import { Material } from "./render/Material";
import { Texture } from "./render/Texture";
import { OrbitSystem } from "./systems/OrbitSystem";
import { RotatorSystem } from "./systems/RotatorSystem";
import { StatsSystem } from "./systems/StatsSystem";
import { createSidebar } from "./ui/Sidebar";
import { StatsOverlay } from "./ui/StatsOverlay";

// --- Bootstrap : moteur ECS + caméra. ---
const canvas = document.getElementById("app") as HTMLCanvasElement;
const engine = new Engine(canvas);
const world = engine.world;

const cameraEntity = world.create();
world.add(cameraEntity, new Transform());
world.add(cameraEntity, new Camera());
const orbit = new OrbitSystem(canvas, cameraEntity, { radius: 7, polar: 0.25 });
engine.add(orbit);
engine.add(new RotatorSystem());

// HUD de diagnostic (FPS / objets / triangles / draw calls), masqué par défaut.
const stats = new StatsOverlay();
engine.add(new StatsSystem(engine.render.backend, stats));

// --- Scène de démo (cubes + quad glTF), reconstruite/déchargée à la demande. ---
let demoEntities: Entity[] = [];
let demoGen = 0;

function buildDemo(): void {
  const gen = ++demoGen;

  // (1) Cube texturé (damier procédural).
  const checker = Texture.fromPixels(64, 64, makeCheckerboard(64), { filter: "nearest", mipmap: false });
  demoEntities.push(
    spawnCube(new Vec3(0, 0, 0), new Material([1, 1, 1], checker), new Vec3(0.4, 0.8, 0)),
  );

  // (2) Cube à matériau uni distinct.
  demoEntities.push(
    spawnCube(new Vec3(2.2, 0, 0), new Material([0.95, 0.35, 0.3]), new Vec3(0, -0.6, 0.3)),
  );

  // (3) Modèle chargé via le GltfLoader (un quad orange).
  buildGltf(world, inlineQuadGltf(), [inlineQuadBuffer()]).then((entities) => {
    if (gen !== demoGen) {
      for (const e of entities) world.destroy(e); // démo rechargée entre-temps
      return;
    }
    const root = entities[0];
    world.add(root, new Rotator(new Vec3(0, 0.7, 0)));
    world.get(root, Transform)?.position.set(-2.2, 0, 0);
    demoEntities.push(...entities);
  });
}

function clearDemo(): void {
  demoGen++; // invalide un chargement glTF encore en cours
  for (const e of demoEntities) world.destroy(e);
  demoEntities = [];
}

function spawnCube(position: Vec3, material: Material, spin: Vec3): Entity {
  const entity = world.create();
  const transform = world.add(entity, new Transform());
  transform.position.copy(position);
  world.add(entity, new MeshRenderer(createCube(), material));
  world.add(entity, new Rotator(spin));
  return entity;
}

buildDemo();
engine.start();

// --- Barre d'outils : expériences + réglages (physique / caméra / affichage). ---
const marbles = new MarblesExperience();
const phys = marbles.params; // objet partagé : les sliders agissent en direct

const sensitivity = (label: string, set: (v: number) => void) => ({
  label,
  min: 0.1,
  max: 3,
  step: 0.1,
  value: 1,
  format: (v: number) => `${v.toFixed(1)}×`,
  onInput: set,
});

createSidebar({
  experiences: [
    {
      label: marbles.name,
      launch: () => {
        clearDemo();
        marbles.start(engine);
      },
      stop: () => {
        marbles.stop(engine);
        buildDemo();
      },
    },
  ],
  settings: [
    {
      title: "Physique",
      sliders: [
        // Gravité affichée en magnitude positive (stockée négative = vers le bas).
        { label: "Gravité", min: 0, max: 25, step: 0.1, value: -phys.gravity, format: (v) => `${v.toFixed(2)} m/s²`, onInput: (v) => (phys.gravity = -v) },
        { label: "Rebond", min: 0, max: 0.9, step: 0.05, value: phys.restitution, format: (v) => v.toFixed(2), onInput: (v) => (phys.restitution = v) },
        { label: "Frottement", min: 0, max: 1, step: 0.05, value: phys.friction, format: (v) => `${Math.round(v * 100)} %`, onInput: (v) => (phys.friction = v) },
        { label: "Amortissement linéaire", min: 0.9, max: 1, step: 0.005, value: phys.damping, format: (v) => v.toFixed(3), onInput: (v) => (phys.damping = v) },
        { label: "Amortissement rotation", min: 0.9, max: 1, step: 0.005, value: phys.angularDamping, format: (v) => v.toFixed(3), onInput: (v) => (phys.angularDamping = v) },
      ],
    },
    {
      title: "Caméra",
      sliders: [
        sensitivity("Sensibilité zoom", (v) => (orbit.zoomSensitivity = v)),
        sensitivity("Sensibilité déplacement", (v) => (orbit.panSensitivity = v)),
        sensitivity("Sensibilité rotation", (v) => (orbit.rotateSensitivity = v)),
      ],
    },
    {
      title: "Affichage",
      toggles: [{ label: "Statistiques (HUD)", value: stats.isVisible, onChange: (on) => stats.setVisible(on) }],
    },
  ],
});

// --- Helpers de démo. --------------------------------------------------------

/** Génère une texture damier RGBA (8×8 cellules) sous forme d'octets bruts. */
function makeCheckerboard(size: number): Uint8Array<ArrayBuffer> {
  const cell = size / 8;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const i = (y * size + x) * 4;
      pixels[i] = on ? 235 : 40;
      pixels[i + 1] = on ? 235 : 60;
      pixels[i + 2] = on ? 245 : 95;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

/** Buffer binaire d'un quad : positions | normales | uv | indices. */
function inlineQuadBuffer(): ArrayBuffer {
  const positions = [-0.7, -0.7, 0, 0.7, -0.7, 0, 0.7, 0.7, 0, -0.7, 0.7, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  const indices = [0, 1, 2, 0, 2, 3];
  const buffer = new ArrayBuffer(48 + 48 + 32 + 12);
  new Float32Array(buffer, 0, 12).set(positions);
  new Float32Array(buffer, 48, 12).set(normals);
  new Float32Array(buffer, 96, 8).set(uvs);
  new Uint16Array(buffer, 128, 6).set(indices);
  return buffer;
}

/** glTF minimal décrivant le quad ci-dessus (pour exercer le loader). */
function inlineQuadGltf(): GltfJson {
  return {
    buffers: [{ byteLength: 140 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 48 },
      { buffer: 0, byteOffset: 96, byteLength: 32 },
      { buffer: 0, byteOffset: 128, byteLength: 12 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1.0, 0.55, 0.15, 1] } }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] },
    ],
    nodes: [{ mesh: 0, name: "QuadGltf" }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
}

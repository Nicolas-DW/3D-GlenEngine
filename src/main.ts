import { Camera } from "./components/Camera";
import { MeshRenderer } from "./components/MeshRenderer";
import { Rotator } from "./components/Rotator";
import { Engine } from "./core/Engine";
import { GameObject } from "./core/GameObject";
import { createCube } from "./geometry/cube";
import { buildGltf, type GltfJson } from "./loaders/GltfLoader";
import { Material } from "./render/Material";
import { Texture } from "./render/Texture";
import { Vec3 } from "./math/Vec3";

// --- Bootstrap : on monte le moteur sur le canvas. ---
const canvas = document.getElementById("app") as HTMLCanvasElement;
const engine = new Engine(canvas);

// --- Caméra : reculée pour voir les trois objets alignés. ---
const cameraObject = new GameObject("Camera");
cameraObject.transform.position.set(0, 1.5, 7);
cameraObject.addComponent(new Camera());
engine.scene.add(cameraObject);

// --- (1) Cube TEXTURÉ : damier généré en mémoire (démontre textures). ---
const checker = Texture.fromPixels(64, 64, makeCheckerboard(64), {
  filter: "nearest",
  mipmap: false,
});
const texturedCube = new GameObject("CubeTexturé");
texturedCube.addComponent(new MeshRenderer(createCube(), new Material([1, 1, 1], checker)));
texturedCube.addComponent(new Rotator());
engine.scene.add(texturedCube);

// --- (2) Cube à MATÉRIAU uni distinct (démontre plusieurs matériaux). ---
const solidCube = new GameObject("CubeUni");
solidCube.transform.position.set(2.2, 0, 0);
solidCube.addComponent(new MeshRenderer(createCube(), new Material([0.95, 0.35, 0.3])));
solidCube.addComponent(new Rotator(new Vec3(0, -0.6, 0.3)));
engine.scene.add(solidCube);

// --- (3) Modèle chargé via le GltfLoader (démontre le pipeline glTF). ---
loadInlineGltfQuad().then((gltfRoot) => {
  gltfRoot.transform.position.set(-2.2, 0, 0);
  gltfRoot.addComponent(new Rotator(new Vec3(0, 0.7, 0)));
  engine.scene.add(gltfRoot);
});

engine.start();

// --- Helpers de démo. --------------------------------------------------------

/** Génère une texture damier RGBA (8×8 cellules) sous forme d'octets bruts. */
function makeCheckerboard(size: number): Uint8Array {
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

/**
 * Construit un glTF minimal (un quad orange) EN MÉMOIRE et le passe au loader.
 * But pédagogique : exercer pour de vrai buffers/bufferViews/accessors/material
 * du GltfLoader, sans dépendre d'un fichier externe.
 */
function loadInlineGltfQuad(): Promise<GameObject> {
  const positions = [-0.7, -0.7, 0, 0.7, -0.7, 0, 0.7, 0.7, 0, -0.7, 0.7, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  const indices = [0, 1, 2, 0, 2, 3];

  // Un seul buffer binaire : positions | normales | uv | indices.
  const buffer = new ArrayBuffer(48 + 48 + 32 + 12);
  new Float32Array(buffer, 0, 12).set(positions);
  new Float32Array(buffer, 48, 12).set(normals);
  new Float32Array(buffer, 96, 8).set(uvs);
  new Uint16Array(buffer, 128, 6).set(indices);

  const gltf: GltfJson = {
    buffers: [{ byteLength: buffer.byteLength }],
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
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0, name: "QuadGltf" }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };

  return buildGltf(gltf, [buffer]);
}

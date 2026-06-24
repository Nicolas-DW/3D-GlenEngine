import { GameObject } from "../core/GameObject";
import { MeshRenderer } from "../components/MeshRenderer";
import { Material } from "../render/Material";
import { Mesh } from "../render/Mesh";
import { Texture } from "../render/Texture";

/**
 * Chargeur glTF 2.0 (sous-ensemble courant, sans dépendance).
 *
 * glTF est le "JPEG de la 3D" : un fichier décrit géométries, matériaux,
 * textures et une hiérarchie de nodes. Notre travail = TRADUIRE ce fichier vers
 * nos propres briques : des GameObjects portant un (ou plusieurs) MeshRenderer,
 * chacun avec son Mesh et son Material. Le reste du moteur ne voit aucune
 * différence avec un objet construit à la main.
 *
 * Couvert : POSITION / NORMAL / TEXCOORD_0, indices 16/32 bits, matériaux
 * pbrMetallicRoughness (baseColorFactor + baseColorTexture), transform TRS des
 * nodes (la rotation glTF EST déjà un quaternion). Non couvert : animations,
 * skinning, node.matrix, extensions.
 */

// --- Tables glTF : code numérique -> sens. -----------------------------------

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
};

// --- Types du JSON glTF (sous-ensemble utilisé). -----------------------------

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
}
interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface GltfBuffer { uri?: string; byteLength: number }
interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
}
interface GltfMesh { primitives: GltfPrimitive[]; name?: string }
interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: { index: number };
  };
}
interface GltfTexture { source?: number }
interface GltfImage { uri?: string; bufferView?: number; mimeType?: string }
interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}
interface GltfScene { nodes: number[] }

export interface GltfJson {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  meshes?: GltfMesh[];
  materials?: GltfMaterial[];
  textures?: GltfTexture[];
  images?: GltfImage[];
  nodes?: GltfNode[];
  scenes?: GltfScene[];
  scene?: number;
}

// --- API publique. -----------------------------------------------------------

/** Charge un modèle .gltf ou .glb depuis une URL et renvoie son GameObject racine. */
export async function loadGltf(url: string): Promise<GameObject> {
  const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`glTF introuvable : ${url} (${res.status})`);

  if (url.toLowerCase().endsWith(".glb")) {
    const { json, bin } = parseGlb(await res.arrayBuffer());
    const buffers = await resolveBuffers(json, baseUrl, bin);
    return buildGltf(json, buffers, baseUrl);
  }

  const json = (await res.json()) as GltfJson;
  const buffers = await resolveBuffers(json, baseUrl, null);
  return buildGltf(json, buffers, baseUrl);
}

/**
 * Construit le GameObject racine à partir d'un glTF DÉJÀ parsé et de ses buffers.
 * Séparé de loadGltf pour pouvoir alimenter le loader sans réseau (tests, démo).
 */
export async function buildGltf(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  baseUrl = "",
): Promise<GameObject> {
  // 1) Matériaux (peut charger des images -> async).
  const materials: Material[] = [];
  for (let i = 0; i < (gltf.materials?.length ?? 0); i++) {
    materials[i] = await buildMaterial(gltf, buffers, baseUrl, i);
  }
  const defaultMaterial = new Material();

  // 2) Un GameObject par node, en recréant la hiérarchie.
  const nodeToGameObject = (nodeIndex: number): GameObject => {
    const node = required(gltf.nodes, "nodes")[nodeIndex];
    const go = new GameObject(node.name ?? `node${nodeIndex}`);

    if (node.translation) go.transform.position.set(...vec3(node.translation));
    // La rotation glTF est un quaternion [x, y, z, w] : branchement direct.
    if (node.rotation) {
      const [x, y, z, w] = node.rotation;
      go.transform.rotation.set(x, y, z, w);
    }
    if (node.scale) go.transform.scale.set(...vec3(node.scale));
    if (node.matrix) {
      console.warn("glTF: node.matrix non décomposé (TRS attendu) —", node.name);
    }

    if (node.mesh != null) {
      const mesh = required(gltf.meshes, "meshes")[node.mesh];
      // Plusieurs primitives = plusieurs MeshRenderer sur le MÊME GameObject :
      // c'est ainsi qu'un objet porte plusieurs matériaux.
      for (const prim of mesh.primitives) {
        const geom = buildPrimitive(gltf, buffers, prim);
        const mat = prim.material != null ? materials[prim.material] : defaultMaterial;
        go.addComponent(new MeshRenderer(geom, mat));
      }
    }

    for (const childIndex of node.children ?? []) {
      go.addChild(nodeToGameObject(childIndex));
    }
    return go;
  };

  const root = new GameObject("glTF");
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const rootNodes = scene?.nodes ?? gltf.nodes?.map((_, i) => i) ?? [];
  for (const nodeIndex of rootNodes) root.addChild(nodeToGameObject(nodeIndex));
  return root;
}

// --- Géométrie. --------------------------------------------------------------

function buildPrimitive(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  prim: GltfPrimitive,
): Mesh {
  const positions = readFloats(gltf, buffers, prim.attributes.POSITION);

  const indices =
    prim.indices != null
      ? readIndices(gltf, buffers, prim.indices)
      : sequentialIndices(positions.length / 3);

  const normals =
    prim.attributes.NORMAL != null
      ? readFloats(gltf, buffers, prim.attributes.NORMAL)
      : computeNormals(positions, indices);

  const uvs =
    prim.attributes.TEXCOORD_0 != null
      ? readFloats(gltf, buffers, prim.attributes.TEXCOORD_0)
      : undefined;

  return new Mesh(positions, normals, indices, uvs);
}

/** Lit un accesseur en Float32Array (POSITION / NORMAL / TEXCOORD). */
function readFloats(gltf: GltfJson, buffers: ArrayBuffer[], index: number): Float32Array {
  const acc = required(gltf.accessors, "accessors")[index];
  const numComp = TYPE_COMPONENTS[acc.type];
  const out = new Float32Array(acc.count * numComp);
  forEachComponent(gltf, buffers, acc, numComp, (i, value) => {
    out[i] = value;
  });
  return out;
}

/** Lit les indices (16 ou 32 bits selon le type stocké). */
function readIndices(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  index: number,
): Uint16Array | Uint32Array {
  const acc = required(gltf.accessors, "accessors")[index];
  const out =
    acc.componentType === 5125
      ? new Uint32Array(acc.count)
      : new Uint16Array(acc.count);
  forEachComponent(gltf, buffers, acc, 1, (i, value) => {
    out[i] = value;
  });
  return out;
}

/**
 * Parcourt chaque composante d'un accesseur (en gérant byteOffset et byteStride,
 * c.-à-d. les données entrelacées) et appelle `emit(indexAplati, valeur)`.
 */
function forEachComponent(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  acc: GltfAccessor,
  numComp: number,
  emit: (flatIndex: number, value: number) => void,
): void {
  const view = required(gltf.bufferViews, "bufferViews")[acc.bufferView ?? 0];
  const dv = new DataView(buffers[view.buffer]);
  const compBytes = COMPONENT_BYTES[acc.componentType];
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? compBytes * numComp;
  for (let i = 0; i < acc.count; i++) {
    const elem = base + i * stride;
    for (let c = 0; c < numComp; c++) {
      const raw = readComponent(dv, elem + c * compBytes, acc.componentType);
      emit(i * numComp + c, normalize(raw, acc));
    }
  }
}

function readComponent(dv: DataView, offset: number, componentType: number): number {
  switch (componentType) {
    case 5120: return dv.getInt8(offset);
    case 5121: return dv.getUint8(offset);
    case 5122: return dv.getInt16(offset, true);
    case 5123: return dv.getUint16(offset, true);
    case 5125: return dv.getUint32(offset, true);
    case 5126: return dv.getFloat32(offset, true);
    default: throw new Error(`componentType glTF inconnu : ${componentType}`);
  }
}

/** Convertit les entiers "normalized" en [0,1] ou [-1,1] (cas UV/couleurs compressées). */
function normalize(value: number, acc: GltfAccessor): number {
  if (!acc.normalized) return value;
  switch (acc.componentType) {
    case 5121: return value / 255;
    case 5123: return value / 65535;
    case 5120: return Math.max(value / 127, -1);
    case 5122: return Math.max(value / 32767, -1);
    default: return value;
  }
}

function sequentialIndices(vertexCount: number): Uint16Array | Uint32Array {
  const out = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) out[i] = i;
  return out;
}

/** Normales de secours (par triangle) si le modèle n'en fournit pas. */
function computeNormals(positions: Float32Array, indices: Uint16Array | Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const idx of [a, b, c]) {
      normals[idx] += nx; normals[idx + 1] += ny; normals[idx + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }
  return normals;
}

// --- Matériaux & textures. ---------------------------------------------------

async function buildMaterial(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  baseUrl: string,
  index: number,
): Promise<Material> {
  const mat = required(gltf.materials, "materials")[index];
  const pbr = mat.pbrMetallicRoughness ?? {};
  const factor = pbr.baseColorFactor ?? [0.8, 0.8, 0.8, 1];
  const color: [number, number, number] = [factor[0], factor[1], factor[2]];

  let texture: Texture | null = null;
  if (pbr.baseColorTexture) {
    const image = await resolveImage(gltf, buffers, baseUrl, pbr.baseColorTexture.index);
    texture = Texture.fromImage(image, { flipY: true });
  }
  return new Material(color, texture);
}

async function resolveImage(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  baseUrl: string,
  textureIndex: number,
): Promise<TexImageSource> {
  const tex = required(gltf.textures, "textures")[textureIndex];
  const img = required(gltf.images, "images")[tex.source ?? 0];

  if (img.uri) {
    return loadImageElement(img.uri.startsWith("data:") ? img.uri : baseUrl + img.uri);
  }
  if (img.bufferView != null) {
    const view = required(gltf.bufferViews, "bufferViews")[img.bufferView];
    const bytes = new Uint8Array(
      buffers[view.buffer], view.byteOffset ?? 0, view.byteLength,
    );
    const blob = new Blob([bytes], { type: img.mimeType ?? "image/png" });
    const url = URL.createObjectURL(blob);
    try {
      return await loadImageElement(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error("Image glTF sans uri ni bufferView.");
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Échec de chargement d'image : ${url}`));
    img.src = url;
  });
}

// --- Buffers (.gltf externes/data-URI et conteneur .glb). --------------------

async function resolveBuffers(
  gltf: GltfJson,
  baseUrl: string,
  glbBin: ArrayBuffer | null,
): Promise<ArrayBuffer[]> {
  const out: ArrayBuffer[] = [];
  const list = gltf.buffers ?? [];
  for (const buffer of list) {
    if (!buffer.uri) {
      if (!glbBin) throw new Error("Buffer glTF sans uri hors conteneur .glb.");
      out.push(glbBin); // buffer binaire embarqué du .glb
    } else if (buffer.uri.startsWith("data:")) {
      out.push(dataUriToArrayBuffer(buffer.uri));
    } else {
      const res = await fetch(baseUrl + buffer.uri);
      out.push(await res.arrayBuffer());
    }
  }
  return out;
}

function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const comma = uri.indexOf(",");
  const meta = uri.substring(5, comma); // entre "data:" et ","
  const payload = uri.substring(comma + 1);
  if (meta.endsWith(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
}

/** Déballe le conteneur binaire .glb : en-tête + chunk JSON + chunk BIN. */
function parseGlb(buf: ArrayBuffer): { json: GltfJson; bin: ArrayBuffer | null } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("En-tête .glb invalide.");
  const total = dv.getUint32(8, true);

  let json: GltfJson | null = null;
  let bin: ArrayBuffer | null = null;
  let offset = 12;
  while (offset < total) {
    const chunkLength = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    offset += 8;
    const chunk = buf.slice(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (chunkType === 0x004e4942) bin = chunk;
  }
  if (!json) throw new Error(".glb sans chunk JSON.");
  return { json, bin };
}

// --- Petits utilitaires. -----------------------------------------------------

function vec3(a: number[]): [number, number, number] {
  return [a[0], a[1], a[2]];
}

/** Garde-fou : renvoie le tableau ou lève une erreur claire s'il manque. */
function required<T>(arr: T[] | undefined, name: string): T[] {
  if (!arr) throw new Error(`glTF: section "${name}" manquante.`);
  return arr;
}

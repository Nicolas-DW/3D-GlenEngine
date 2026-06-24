import { Mesh } from "../render/Mesh";

/**
 * Crée un cube unité (centré, arêtes de longueur 1). Chaque face a ses propres
 * sommets pour porter une normale plane correcte (d'où 24 sommets, 36 indices).
 * Renvoie de la DONNÉE pure : le backend de rendu la téléversera au GPU.
 */
export function createCube(): Mesh {
  // 6 faces × 4 sommets. Pour chaque face : 4 positions puis sa normale.
  const positions = new Float32Array([
    // +X
    0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
    // -X
    -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
    // +Y
    -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // -Y
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5,
    // +Z
    -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
    // -Z
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5,
  ]);

  const faceNormals = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const normals = new Float32Array(72);
  for (let f = 0; f < 6; f++) {
    const [nx, ny, nz] = faceNormals[f];
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      normals[i] = nx;
      normals[i + 1] = ny;
      normals[i + 2] = nz;
    }
  }

  // UV : chaque face couvre tout le carré [0,1]² (4 coins, dans l'ordre des sommets).
  const faceUv = [0, 0, 1, 0, 1, 1, 0, 1];
  const uvs = new Float32Array(6 * 8);
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 8; k++) uvs[f * 8 + k] = faceUv[k];
  }

  // 2 triangles par face, en sens ANTI-HORAIRE vu de l'extérieur (winding
  // 0,2,1 / 0,3,2). Ainsi la normale géométrique pointe dehors et correspond aux
  // normales assignées : les faces extérieures sont rendues, pas culées.
  const indices = new Uint16Array(36);
  for (let f = 0; f < 6; f++) {
    const o = f * 4;
    const i = f * 6;
    indices[i] = o; indices[i + 1] = o + 2; indices[i + 2] = o + 1;
    indices[i + 3] = o; indices[i + 4] = o + 3; indices[i + 5] = o + 2;
  }

  return new Mesh(positions, normals, indices, uvs);
}

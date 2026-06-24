import { Mesh } from "../render/Mesh";

/**
 * Sphère UV (étape 2 du plan billes). On échantillonne la surface en anneaux
 * (latitude) × secteurs (longitude). La normale d'un point d'une sphère centrée
 * est simplement sa direction (position normalisée) — gratuit.
 *
 * Winding choisi pour des faces orientées vers l'EXTÉRIEUR (cohérent avec le
 * back-face culling, comme le cube).
 */
export function createSphere(radius = 0.5, segments = 16, rings = 12): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i <= rings; i++) {
    const theta = (i / rings) * Math.PI; // 0 (pôle nord) -> PI (pôle sud)
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      const x = sinT * Math.cos(phi);
      const y = cosT;
      const z = sinT * Math.sin(phi);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z); // direction = normale (sphère unité)
      uvs.push(j / segments, i / rings);
    }
  }

  const indices: number[] = [];
  const stride = segments + 1; // sommets par anneau (couture dupliquée)
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  return new Mesh(
    new Float32Array(positions),
    new Float32Array(normals),
    new Uint16Array(indices),
    new Float32Array(uvs),
  );
}

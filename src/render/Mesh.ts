/**
 * Géométrie CÔTÉ CPU : juste des tableaux de données, sans aucune ressource GPU.
 *
 * Auparavant, Mesh créait directement un VAO WebGL. En vue du backend abstrait
 * (WebGL2 / WebGPU), on sépare la DONNÉE (ici) de la RESSOURCE GPU (créée et
 * mise en cache par chaque backend). Un même Mesh peut ainsi être téléversé par
 * n'importe quel backend.
 *
 * Convention d'attributs : 0 = position, 1 = normale, 2 = UV (optionnel).
 */
export class Mesh {
  constructor(
    readonly positions: Float32Array,
    readonly normals: Float32Array,
    readonly indices: Uint16Array | Uint32Array,
    readonly uvs?: Float32Array,
  ) {}

  get indexCount(): number {
    return this.indices.length;
  }

  /** true si les indices sont en 32 bits (gros maillages). */
  get uint32Indices(): boolean {
    return this.indices instanceof Uint32Array;
  }
}

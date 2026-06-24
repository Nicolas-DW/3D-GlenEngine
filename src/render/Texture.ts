/**
 * Description d'une texture CÔTÉ CPU, neutre vis-à-vis du backend.
 *
 * Comme Mesh, Texture ne contient plus de ressource GPU : juste de quoi en
 * fabriquer une (une image décodée, ou des octets RGBA bruts) plus des options
 * exprimées de façon abstraite ("nearest"/"linear" plutôt que des constantes
 * WebGL). Chaque backend traduit ces options dans son API.
 */
export interface TextureOptions {
  filter?: "nearest" | "linear";
  wrap?: "repeat" | "clamp";
  /** glTF a son origine UV en haut : on retourne verticalement à l'upload. */
  flipY?: boolean;
  mipmap?: boolean;
}

export type TextureSource =
  | { kind: "image"; image: TexImageSource }
  | { kind: "pixels"; width: number; height: number; data: Uint8Array };

export class Texture {
  constructor(
    readonly source: TextureSource,
    readonly options: TextureOptions = {},
  ) {}

  static fromImage(image: TexImageSource, options: TextureOptions = {}): Texture {
    return new Texture({ kind: "image", image }, options);
  }

  static fromPixels(
    width: number,
    height: number,
    data: Uint8Array,
    options: TextureOptions = {},
  ): Texture {
    return new Texture({ kind: "pixels", width, height, data }, options);
  }
}

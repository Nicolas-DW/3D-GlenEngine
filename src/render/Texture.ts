/**
 * Texture 2D GPU. Deux fabriques :
 *  - `fromImage` : à partir d'une image décodée (cas glTF / fichiers).
 *  - `fromPixels` : à partir d'octets RGBA bruts (textures procédurales).
 *
 * Une texture, c'est une image que le fragment shader vient "échantillonner"
 * via les coordonnées UV de chaque sommet, au lieu d'une couleur unie.
 */
export interface TextureOptions {
  /** gl.NEAREST (pixelisé) ou gl.LINEAR (lissé). Défaut : LINEAR. */
  filter?: number;
  /** gl.REPEAT ou gl.CLAMP_TO_EDGE. Défaut : REPEAT. */
  wrap?: number;
  /** Retourne verticalement (glTF a son origine UV en haut). Défaut : false. */
  flipY?: boolean;
  /** Génère les mipmaps (meilleur rendu à distance). Défaut : true. */
  mipmap?: boolean;
}

export class Texture {
  private constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly handle: WebGLTexture,
  ) {}

  static fromImage(
    gl: WebGL2RenderingContext,
    image: TexImageSource,
    opts: TextureOptions = {},
  ): Texture {
    const tex = Texture.create(gl);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ? 1 : 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    Texture.configure(gl, opts);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return new Texture(gl, tex);
  }

  static fromPixels(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    pixels: Uint8Array,
    opts: TextureOptions = {},
  ): Texture {
    const tex = Texture.create(gl);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels,
    );
    Texture.configure(gl, opts);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return new Texture(gl, tex);
  }

  /** Active la texture sur une unité (slot) puis la lie, pour le shader. */
  bind(unit = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
  }

  private static create(gl: WebGL2RenderingContext): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error("Impossible de créer la texture.");
    return tex;
  }

  private static configure(gl: WebGL2RenderingContext, opts: TextureOptions): void {
    const filter = opts.filter ?? gl.LINEAR;
    const wrap = opts.wrap ?? gl.REPEAT;
    const useMipmap = opts.mipmap ?? true;
    if (useMipmap) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      useMipmap ? gl.LINEAR_MIPMAP_LINEAR : filter,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }
}

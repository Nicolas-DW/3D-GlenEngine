import type { FrameData, RenderBackend } from "./RenderBackend";
import { Mesh } from "./Mesh";
import { Shader } from "./Shader";
import { Texture } from "./Texture";
import { DEFAULT_FRAGMENT_SRC, DEFAULT_VERTEX_SRC } from "./shaders";

interface GlMesh {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  indexType: number;
}

/**
 * Backend WebGL2. Implémente RenderBackend en téléversant Mesh/Texture à la
 * demande (caches WeakMap : la ressource GPU est créée une fois par objet et
 * libérée automatiquement si l'objet disparaît).
 */
export class WebGL2Backend implements RenderBackend {
  readonly name = "WebGL2";
  private readonly gl: WebGL2RenderingContext;
  private readonly shader: Shader;
  private readonly meshes = new WeakMap<Mesh, GlMesh>();
  private readonly textures = new WeakMap<Texture, WebGLTexture>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 non supporté par ce navigateur.");
    this.gl = gl;

    gl.clearColor(0.043, 0.051, 0.071, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    this.shader = new Shader(gl, DEFAULT_VERTEX_SRC, DEFAULT_FRAGMENT_SRC);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  renderFrame(frame: FrameData): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.shader.use();
    this.shader.setMat4("uProjection", frame.projection);
    this.shader.setMat4("uView", frame.view);

    for (const item of frame.items) {
      this.shader.setMat4("uModel", item.model);
      const mat = item.material;
      this.shader.setVec3("uColor", mat.color[0], mat.color[1], mat.color[2]);
      if (mat.texture) {
        this.bindTexture(mat.texture, 0);
        this.shader.setInt("uTexture", 0);
        this.shader.setInt("uHasTexture", 1);
      } else {
        this.shader.setInt("uHasTexture", 0);
      }
      this.drawMesh(item.mesh);
    }
  }

  // --- Upload paresseux + cache. ---------------------------------------------

  private drawMesh(mesh: Mesh): void {
    const gl = this.gl;
    const gpu = this.uploadMesh(mesh);
    gl.bindVertexArray(gpu.vao);
    gl.drawElements(gl.TRIANGLES, gpu.indexCount, gpu.indexType, 0);
    gl.bindVertexArray(null);
  }

  private uploadMesh(mesh: Mesh): GlMesh {
    const cached = this.meshes.get(mesh);
    if (cached) return cached;

    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Impossible de créer le VAO.");
    gl.bindVertexArray(vao);

    this.attrib(0, mesh.positions, 3);
    this.attrib(1, mesh.normals, 3);
    if (mesh.uvs) this.attrib(2, mesh.uvs, 2);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const gpu: GlMesh = {
      vao,
      indexCount: mesh.indexCount,
      indexType: mesh.uint32Indices ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
    this.meshes.set(mesh, gpu);
    return gpu;
  }

  private attrib(location: number, data: Float32Array, size: number): void {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  private bindTexture(texture: Texture, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.uploadTexture(texture));
  }

  private uploadTexture(texture: Texture): WebGLTexture {
    const cached = this.textures.get(texture);
    if (cached) return cached;

    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("Impossible de créer la texture.");
    const opts = texture.options;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ? 1 : 0);

    const src = texture.source;
    if (src.kind === "image") {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.image);
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, src.width, src.height, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, src.data,
      );
    }

    const useMipmap = opts.mipmap ?? true;
    const filter = opts.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    const wrap = opts.wrap === "clamp" ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    if (useMipmap) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      useMipmap ? gl.LINEAR_MIPMAP_LINEAR : filter,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.textures.set(texture, tex);
    return tex;
  }
}

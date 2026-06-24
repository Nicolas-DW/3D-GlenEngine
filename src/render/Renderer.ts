import { Camera } from "../components/Camera";
import { MeshRenderer } from "../components/MeshRenderer";
import type { Scene } from "../core/Scene";
import { Shader } from "./Shader";
import { DEFAULT_FRAGMENT_SRC, DEFAULT_VERTEX_SRC } from "./shaders";

/**
 * Couche de rendu WebGL2. Possède le contexte GL et le shader par défaut.
 * À chaque frame : trouve la caméra, configure projection + vue, puis dessine
 * tous les MeshRenderer de la scène.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private readonly shader: Shader;

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

  /** Adapte la taille du canvas à son affichage CSS (gère le DPI écran). */
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

  render(scene: Scene): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const camera = scene.getComponents(Camera)[0];
    if (!camera) return;

    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);

    this.shader.use();
    this.shader.setMat4("uProjection", camera.projectionMatrix(aspect).data);
    this.shader.setMat4("uView", camera.viewMatrix().data);

    for (const mr of scene.getComponents(MeshRenderer)) {
      const mat = mr.material;
      this.shader.setMat4("uModel", mr.transform.worldMatrix().data);
      this.shader.setVec3("uColor", mat.color[0], mat.color[1], mat.color[2]);
      if (mat.texture) {
        mat.texture.bind(0);
        this.shader.setInt("uTexture", 0);
        this.shader.setInt("uHasTexture", 1);
      } else {
        this.shader.setInt("uHasTexture", 0);
      }
      mr.mesh.draw();
    }
  }
}

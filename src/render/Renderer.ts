import { Camera } from "../components/Camera";
import { MeshRenderer } from "../components/MeshRenderer";
import type { Scene } from "../core/Scene";
import type { FrameData, RenderBackend, Renderable } from "./RenderBackend";
import { WebGL2Backend } from "./WebGL2Backend";
import { WebGPUBackend } from "./WebGPUBackend";

/**
 * Pilote de rendu indépendant du backend. Il extrait de la scène ce qui est
 * neutre (matrices caméra + liste d'objets) et délègue le dessin au backend
 * choisi. Tout le code spécifique GPU vit dans WebGL2Backend / WebGPUBackend.
 *
 * Sélection : WebGL2 par défaut (complet et universel). WebGPU est opt-in via
 * l'URL `?backend=webgpu`, avec repli automatique sur WebGL2 en cas d'échec.
 */
export class Renderer {
  readonly backend: RenderBackend;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.backend = createBackend(canvas);
    console.info(`[GlenEngine] backend de rendu : ${this.backend.name}`);
  }

  resize(): void {
    this.backend.resize();
  }

  render(scene: Scene): void {
    const camera = scene.getComponents(Camera)[0];
    if (!camera) return;

    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    const items: Renderable[] = scene.getComponents(MeshRenderer).map((mr) => ({
      model: mr.transform.worldMatrix().data,
      mesh: mr.mesh,
      material: mr.material,
    }));

    const frame: FrameData = {
      view: camera.viewMatrix().data,
      projection: camera.projectionMatrix(aspect).data,
      items,
    };
    this.backend.renderFrame(frame);
  }
}

function createBackend(canvas: HTMLCanvasElement): RenderBackend {
  const wantsWebGPU =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("backend") === "webgpu";

  if (wantsWebGPU && navigator.gpu) {
    try {
      return new WebGPUBackend(canvas);
    } catch (err) {
      console.warn("WebGPU indisponible, repli sur WebGL2.", err);
    }
  }
  return new WebGL2Backend(canvas);
}

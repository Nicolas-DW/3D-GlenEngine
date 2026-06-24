import { Camera } from "../components/Camera";
import { MeshRenderer } from "../components/MeshRenderer";
import type { Scene } from "../core/Scene";
import type { FrameData, RenderBackend, Renderable } from "./RenderBackend";
import { WebGPUBackend } from "./WebGPUBackend";

/**
 * Pilote de rendu indépendant du backend. Il extrait de la scène ce qui est
 * neutre (matrices caméra + liste d'objets) et délègue le dessin au backend.
 *
 * Backend actuel : WebGPU (le backend WebGL2 a été retiré ; il reste dans
 * l'historique git si besoin). L'interface RenderBackend conserve toute sa
 * valeur : un nouveau backend = une nouvelle classe, sans toucher au reste.
 */
export class Renderer {
  readonly backend: RenderBackend;

  constructor(private readonly canvas: HTMLCanvasElement) {
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU est requis : ce navigateur ne le supporte pas. " +
          "Le backend WebGL2 a été retiré (voir l'historique git).",
      );
    }
    this.backend = new WebGPUBackend(canvas);
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

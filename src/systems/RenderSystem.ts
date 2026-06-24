import { Camera } from "../components/Camera";
import { MeshRenderer } from "../components/MeshRenderer";
import { Transform } from "../core/Transform";
import type { System, World } from "../core/World";
import type { FrameData, RenderBackend, Renderable } from "../render/RenderBackend";
import { WebGPUBackend } from "../render/WebGPUBackend";

/**
 * Système de rendu : trouve la caméra, assemble les données neutres de la frame
 * (matrices + liste d'objets) depuis le World, et délègue au backend.
 *
 * Backend : WebGPU (le seul ; WebGL2 a été retiré). Toute la spécificité GPU vit
 * dans le backend.
 */
export class RenderSystem implements System {
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

  update(world: World, _dt: number): void {
    const found = world.first(Camera);
    if (!found) return;
    const [cameraEntity, camera] = found;
    const cameraTransform = world.get(cameraEntity, Transform);
    if (!cameraTransform) return;

    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    const items: Renderable[] = [];
    for (const [entity, mr] of world.view(MeshRenderer)) {
      const transform = world.get(entity, Transform);
      if (!transform) continue;
      items.push({ model: transform.worldMatrix().data, mesh: mr.mesh, material: mr.material });
    }

    const frame: FrameData = {
      view: camera.viewMatrix(cameraTransform.position).data,
      projection: camera.projectionMatrix(aspect).data,
      items,
    };
    this.backend.renderFrame(frame);
  }
}

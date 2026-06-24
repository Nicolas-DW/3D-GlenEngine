import type { System, World } from "../core/World";
import type { RenderBackend } from "../render/RenderBackend";
import type { StatsOverlay } from "../ui/StatsOverlay";

/**
 * Système de diagnostic : calcule un FPS lissé (moyenne mobile exponentielle sur
 * dt) et lit les compteurs de la dernière frame exposés par le backend (objets /
 * triangles / draw calls), puis pousse le tout au HUD.
 *
 * Le HUD décide lui-même de s'afficher ; le système tourne en permanence (coût
 * négligeable) pour garder le FPS lissé continu. Rafraîchissement throttlé pour
 * éviter un texte illisible qui scintille à chaque frame.
 */
export class StatsSystem implements System {
  private fps = 60;
  private elapsed = 0;
  private static readonly REFRESH = 0.2; // s entre deux mises à jour du texte

  constructor(
    private readonly backend: RenderBackend,
    private readonly overlay: StatsOverlay,
  ) {}

  update(_world: World, dt: number): void {
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1; // EMA : lisse les à-coups

    this.elapsed += dt;
    if (this.elapsed < StatsSystem.REFRESH) return;
    this.elapsed = 0;

    const s = this.backend.stats;
    this.overlay.update({
      fps: this.fps,
      objects: s.objects,
      triangles: s.triangles,
      drawCalls: s.drawCalls,
    });
  }
}

import { RenderSystem } from "../systems/RenderSystem";
import type { System } from "./World";
import { World } from "./World";

/**
 * Orchestrateur ECS : possède le World, la liste des systèmes et le système de
 * rendu, et fait tourner la game loop.
 *
 * Chaque frame : update(dt) sur tous les systèmes, puis le rendu en dernier.
 */
export class Engine {
  readonly world = new World();
  readonly render: RenderSystem;

  private readonly systems: System[] = [];
  private lastTime = 0;
  private running = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.render = new RenderSystem(canvas);
    window.addEventListener("resize", () => this.render.resize());
  }

  /** Enregistre un système (exécuté chaque frame, avant le rendu). */
  add(system: System): System {
    this.systems.push(system);
    return system;
  }

  remove(system: System): void {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // clamp anti-saut
    this.lastTime = now;

    for (const system of this.systems) system.update(this.world, dt);
    this.render.update(this.world, dt); // rendu en dernier

    requestAnimationFrame(this.frame);
  };
}

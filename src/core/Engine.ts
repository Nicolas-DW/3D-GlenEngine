import { Renderer } from "../render/Renderer";
import { Scene } from "./Scene";

/**
 * Orchestrateur : possède le canvas, le renderer et la scène, et fait tourner
 * la game loop via requestAnimationFrame.
 *
 * Chaque frame : 1) start() sur les nouveaux composants, 2) update(dt) sur
 * tous, 3) rendu.
 */
export class Engine {
  readonly renderer: Renderer;
  readonly scene = new Scene();

  private readonly started = new WeakSet<object>();
  private lastTime = 0;
  private running = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    window.addEventListener("resize", () => this.renderer.resize());
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

    for (const go of this.scene.traverse()) {
      for (const c of go.components) {
        if (!this.started.has(c)) {
          this.started.add(c);
          c.start();
        }
        c.update(dt);
      }
    }

    this.renderer.render(this.scene);
    requestAnimationFrame(this.frame);
  };
}

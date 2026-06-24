import { Component } from "../core/Component";
import { Vec3 } from "../math/Vec3";
import { Camera } from "./Camera";

/**
 * Caméra orbitale pilotée à la souris / au trackpad.
 *
 * On garde la position de la caméra en coordonnées SPHÉRIQUES autour d'une cible
 * (rayon + azimut + élévation), et on la reconvertit en (x, y, z) chaque frame.
 * Tourner autour de la scène = modifier l'azimut/l'élévation ; zoomer = le rayon.
 *
 * Contrôles (pensés trackpad d'abord) :
 *  - clic-glisser .......... orbite (souris ET trackpad)
 *  - glissement 2 doigts ... orbite (trackpad : évènement wheel sans Ctrl)
 *  - pincer / Ctrl+molette . zoom
 */
export interface OrbitOptions {
  target?: Vec3;
  radius?: number;
  /** Azimut initial (rad) : rotation horizontale autour de la cible. */
  azimuth?: number;
  /** Élévation initiale (rad) : angle au-dessus du plan horizontal. */
  polar?: number;
  /** Sensibilité du clic-glisser (rad par pixel). */
  rotateSpeed?: number;
  /** Sensibilité du glissement 2 doigts (rad par unité de delta). */
  wheelRotateSpeed?: number;
  /** Sensibilité du zoom (facteur exponentiel par unité de delta). */
  zoomSpeed?: number;
  minRadius?: number;
  maxRadius?: number;
}

const HALF_PI = Math.PI / 2;

export class OrbitController extends Component {
  readonly target: Vec3;
  private radius: number;
  private azimuth: number;
  private polar: number;

  private readonly rotateSpeed: number;
  private readonly wheelRotateSpeed: number;
  private readonly zoomSpeed: number;
  private readonly minRadius: number;
  private readonly maxRadius: number;

  private camera: Camera | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly element: HTMLElement,
    opts: OrbitOptions = {},
  ) {
    super();
    this.target = opts.target ?? new Vec3(0, 0, 0);
    this.radius = opts.radius ?? 7;
    this.azimuth = opts.azimuth ?? 0;
    this.polar = opts.polar ?? 0.25;
    this.rotateSpeed = opts.rotateSpeed ?? 0.005;
    this.wheelRotateSpeed = opts.wheelRotateSpeed ?? 0.0045;
    this.zoomSpeed = opts.zoomSpeed ?? 0.0015;
    this.minRadius = opts.minRadius ?? 1.5;
    this.maxRadius = opts.maxRadius ?? 50;
  }

  override start(): void {
    this.camera = this.gameObject.getComponent(Camera) ?? null;
    const el = this.element;
    el.style.touchAction = "none"; // on gère nous-mêmes les gestes
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointercancel", this.onPointerUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  override update(): void {
    // Sphérique -> cartésien : position de la caméra autour de la cible.
    const cosP = Math.cos(this.polar);
    this.transform.position.set(
      this.target.x + this.radius * cosP * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.sin(this.polar),
      this.target.z + this.radius * cosP * Math.cos(this.azimuth),
    );
    if (this.camera) this.camera.target.copy(this.target);
  }

  // --- Entrée. ----------------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.orbit(
      (e.clientX - this.lastX) * this.rotateSpeed,
      (e.clientY - this.lastY) * this.rotateSpeed,
    );
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.dragging = false;
    if (this.element.hasPointerCapture(e.pointerId)) {
      this.element.releasePointerCapture(e.pointerId);
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault(); // empêche scroll/zoom de la page
    if (e.ctrlKey) {
      // Pincer (trackpad) ou Ctrl+molette (souris) -> zoom exponentiel.
      this.radius = clamp(
        this.radius * Math.exp(e.deltaY * this.zoomSpeed),
        this.minRadius,
        this.maxRadius,
      );
    } else {
      // Glissement deux doigts (trackpad) -> orbite.
      this.orbit(e.deltaX * this.wheelRotateSpeed, e.deltaY * this.wheelRotateSpeed);
    }
  };

  /** Applique un déplacement d'azimut/élévation, en bornant l'élévation. */
  private orbit(dAzimuth: number, dPolar: number): void {
    this.azimuth -= dAzimuth;
    // Borne pour ne pas franchir les pôles (sinon la caméra se retourne).
    this.polar = clamp(this.polar + dPolar, -HALF_PI + 0.01, HALF_PI - 0.01);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

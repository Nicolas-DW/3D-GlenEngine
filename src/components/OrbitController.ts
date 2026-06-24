import { Component } from "../core/Component";
import { Vec3 } from "../math/Vec3";
import { Camera } from "./Camera";

/**
 * Caméra orbitale pilotée à la souris / au trackpad.
 *
 * Position gardée en coordonnées SPHÉRIQUES (rayon + azimut + élévation) autour
 * d'une cible, reconverties en (x, y, z) chaque frame. Orbiter = changer les
 * angles ; zoomer = le rayon ; déplacer (pan) = bouger la cible (la caméra suit).
 *
 * Contrôles :
 *  - clic gauche + glisser ........ orbite (pivot)
 *  - molette du milieu + glisser ... pan (style 3ds Max : caméra + cible)
 *  - glissement 2 doigts (trackpad) ... pan
 *  - pincer / Ctrl + molette ........ zoom
 *
 * Sensibilités réglables à chaud (zoomSensitivity / panSensitivity /
 * rotateSensitivity), exposées par la barre d'outils.
 */
export interface OrbitOptions {
  target?: Vec3;
  radius?: number;
  azimuth?: number;
  polar?: number;
  zoomSensitivity?: number;
  panSensitivity?: number;
  rotateSensitivity?: number;
  minRadius?: number;
  maxRadius?: number;
}

const HALF_PI = Math.PI / 2;
// Vitesses "à sensibilité 1" ; les multiplicateurs ci-dessous les modulent.
const BASE_ROTATE = 0.005; // rad / pixel
const BASE_PAN = 0.0022; // (unités / pixel) / rayon
const BASE_ZOOM = 0.0015; // exposant / unité de delta

export class OrbitController extends Component {
  readonly target: Vec3;
  zoomSensitivity: number;
  panSensitivity: number;
  rotateSensitivity: number;

  private radius: number;
  private azimuth: number;
  private polar: number;
  private readonly minRadius: number;
  private readonly maxRadius: number;

  private camera: Camera | null = null;
  private activeButton = -1; // 0 = gauche (orbite), 1 = milieu (pan)
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
    this.zoomSensitivity = opts.zoomSensitivity ?? 1;
    this.panSensitivity = opts.panSensitivity ?? 1;
    this.rotateSensitivity = opts.rotateSensitivity ?? 1;
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
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  override update(): void {
    const off = this.offset();
    this.transform.position.set(
      this.target.x + off.x,
      this.target.y + off.y,
      this.target.z + off.z,
    );
    if (this.camera) this.camera.target.copy(this.target);
  }

  // --- Entrée. ----------------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.activeButton = e.button;
    if (e.button === 1) e.preventDefault(); // évite l'auto-scroll du clic milieu
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.activeButton < 0) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.activeButton === 1) {
      this.pan(dx, dy); // molette du milieu -> déplacement
    } else if (this.activeButton === 0) {
      const k = BASE_ROTATE * this.rotateSensitivity; // clic gauche -> orbite
      this.orbit(dx * k, dy * k);
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.activeButton = -1;
    if (this.element.hasPointerCapture(e.pointerId)) {
      this.element.releasePointerCapture(e.pointerId);
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault(); // empêche scroll/zoom de la page
    if (e.ctrlKey) {
      // Pincer (trackpad) ou Ctrl + molette (souris) -> zoom.
      const k = BASE_ZOOM * this.zoomSensitivity;
      this.radius = clamp(this.radius * Math.exp(e.deltaY * k), this.minRadius, this.maxRadius);
    } else {
      // Glissement deux doigts (trackpad) -> déplacement.
      this.pan(e.deltaX, e.deltaY);
    }
  };

  /** Orbite : décale azimut/élévation (élévation bornée pour ne pas se retourner). */
  private orbit(dAzimuth: number, dPolar: number): void {
    this.azimuth -= dAzimuth;
    this.polar = clamp(this.polar + dPolar, -HALF_PI + 0.01, HALF_PI - 0.01);
  }

  /**
   * Pan : déplace la CIBLE dans le plan de la caméra (droite/haut), la caméra
   * suit puisque sa position dérive de la cible. Échelle proportionnelle au
   * rayon pour un ressenti constant quel que soit le zoom.
   */
  private pan(dx: number, dy: number): void {
    const forward = this.offset().scale(-1).normalized(); // caméra -> cible
    const right = forward.cross(new Vec3(0, 1, 0)).normalized();
    const up = right.cross(forward).normalized();
    const s = BASE_PAN * this.panSensitivity * this.radius;
    // "Grab" : glisser à droite déplace la scène à droite (cible vers la gauche).
    this.target.x += (-dx * right.x + dy * up.x) * s;
    this.target.y += (-dx * right.y + dy * up.y) * s;
    this.target.z += (-dx * right.z + dy * up.z) * s;
  }

  /** Décalage caméra par rapport à la cible (sphérique -> cartésien). */
  private offset(): Vec3 {
    const cosP = Math.cos(this.polar);
    return new Vec3(
      this.radius * cosP * Math.sin(this.azimuth),
      this.radius * Math.sin(this.polar),
      this.radius * cosP * Math.cos(this.azimuth),
    );
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

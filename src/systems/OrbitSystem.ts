import { Camera } from "../components/Camera";
import { Transform } from "../core/Transform";
import type { Entity, System, World } from "../core/World";
import { Vec3 } from "../math/Vec3";

/**
 * Caméra orbitale (système). Garde la position en coordonnées sphériques autour
 * d'une cible et écrit, à chaque frame, le Transform de l'entité caméra.
 *
 * Contrôles :
 *  - clic gauche + glisser ........ orbite
 *  - molette du milieu + glisser ... pan (style 3ds Max)
 *  - glissement 2 doigts (trackpad) ... pan
 *  - pincer / Ctrl + molette ........ zoom
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
const BASE_ROTATE = 0.005;
const BASE_PAN = 0.0022;
const BASE_ZOOM = 0.0015;

export class OrbitSystem implements System {
  readonly target: Vec3;
  zoomSensitivity: number;
  panSensitivity: number;
  rotateSensitivity: number;

  private radius: number;
  private azimuth: number;
  private polar: number;
  private readonly minRadius: number;
  private readonly maxRadius: number;

  private activeButton = -1;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: Entity,
    opts: OrbitOptions = {},
  ) {
    this.target = opts.target ?? new Vec3(0, 0, 0);
    this.radius = opts.radius ?? 7;
    this.azimuth = opts.azimuth ?? 0;
    this.polar = opts.polar ?? 0.25;
    this.zoomSensitivity = opts.zoomSensitivity ?? 1;
    this.panSensitivity = opts.panSensitivity ?? 1;
    this.rotateSensitivity = opts.rotateSensitivity ?? 1;
    this.minRadius = opts.minRadius ?? 1.5;
    this.maxRadius = opts.maxRadius ?? 50;

    const el = this.element;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointercancel", this.onPointerUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  update(world: World, _dt: number): void {
    const transform = world.get(this.camera, Transform);
    if (!transform) return;
    const off = this.offset();
    transform.position.set(this.target.x + off.x, this.target.y + off.y, this.target.z + off.z);
    const cam = world.get(this.camera, Camera);
    if (cam) cam.target.copy(this.target);
  }

  // --- Entrée. ----------------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.activeButton = e.button;
    if (e.button === 1) e.preventDefault();
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
      this.pan(dx, dy);
    } else if (this.activeButton === 0) {
      const k = BASE_ROTATE * this.rotateSensitivity;
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
    e.preventDefault();
    if (e.ctrlKey) {
      const k = BASE_ZOOM * this.zoomSensitivity;
      this.radius = clamp(this.radius * Math.exp(e.deltaY * k), this.minRadius, this.maxRadius);
    } else {
      this.pan(e.deltaX, e.deltaY);
    }
  };

  private orbit(dAzimuth: number, dPolar: number): void {
    this.azimuth -= dAzimuth;
    this.polar = clamp(this.polar + dPolar, -HALF_PI + 0.01, HALF_PI - 0.01);
  }

  private pan(dx: number, dy: number): void {
    const forward = this.offset().scale(-1).normalized();
    const right = forward.cross(new Vec3(0, 1, 0)).normalized();
    const up = right.cross(forward).normalized();
    const s = BASE_PAN * this.panSensitivity * this.radius;
    this.target.x += (-dx * right.x + dy * up.x) * s;
    this.target.y += (-dx * right.y + dy * up.y) * s;
    this.target.z += (-dx * right.z + dy * up.z) * s;
  }

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

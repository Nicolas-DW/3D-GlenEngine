import type { Material } from "./Material";
import type { Mesh } from "./Mesh";

/**
 * Un objet à dessiner : sa matrice monde, sa géométrie, son matériau.
 * (Données pures : aucun backend n'est supposé.)
 */
export interface Renderable {
  model: Float32Array;
  mesh: Mesh;
  material: Material;
}

/** Tout ce dont un backend a besoin pour dessiner une frame. */
export interface FrameData {
  view: Float32Array;
  projection: Float32Array;
  items: Renderable[];
}

/**
 * Contrat commun à WebGL2 et WebGPU. Le moteur ne connaît QUE cette interface :
 * il lui passe des FrameData, le backend se débrouille avec son API GPU.
 *
 * C'est le point d'extension : ajouter un backend = implémenter cette interface,
 * sans toucher au reste du moteur.
 */
export interface RenderBackend {
  /** Nom lisible (diagnostic). */
  readonly name: string;
  /** Adapte la résolution au canvas (DPI, redimensionnement). */
  resize(): void;
  /** Dessine une frame. Peut être un no-op tant qu'un backend async s'initialise. */
  renderFrame(frame: FrameData): void;
}

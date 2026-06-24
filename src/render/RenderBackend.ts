import type { Material } from "./Material";
import type { Mesh } from "./Mesh";

/**
 * Un objet à dessiner : sa matrice monde, sa géométrie, son matériau.
 * (Données pures : aucun backend n'est supposé.)
 */
export interface Renderable {
  model: Float32Array<ArrayBuffer>;
  mesh: Mesh;
  material: Material;
}

/** Tout ce dont un backend a besoin pour dessiner une frame. */
export interface FrameData {
  view: Float32Array<ArrayBuffer>;
  projection: Float32Array<ArrayBuffer>;
  items: Renderable[];
}

/** Compteurs de la dernière frame dessinée (pour le HUD de diagnostic). */
export interface RenderStats {
  objects: number; // objets soumis (instances)
  triangles: number; // triangles effectivement dessinés
  drawCalls: number; // appels de dessin (groupes instanciés)
}

/**
 * Contrat d'un backend de rendu (WebGPU aujourd'hui). Le moteur ne connaît QUE
 * cette interface : il lui passe des FrameData, le backend se débrouille avec
 * son API GPU.
 *
 * C'est le point d'extension : ajouter un backend = implémenter cette interface,
 * sans toucher au reste du moteur.
 */
export interface RenderBackend {
  /** Nom lisible (diagnostic). */
  readonly name: string;
  /** Compteurs de la dernière frame (objets / triangles / draw calls). */
  readonly stats: RenderStats;
  /** Adapte la résolution au canvas (DPI, redimensionnement). */
  resize(): void;
  /** Dessine une frame. Peut être un no-op tant qu'un backend async s'initialise. */
  renderFrame(frame: FrameData): void;
}

import { Component } from "../core/Component";
import { Mesh } from "../render/Mesh";

/**
 * Marque un GameObject comme dessinable : associe une géométrie (Mesh) et une
 * couleur. Le Renderer collecte tous les MeshRenderer de la scène et les dessine.
 */
export class MeshRenderer extends Component {
  constructor(
    public mesh: Mesh,
    public color: [number, number, number] = [0.8, 0.8, 0.8],
  ) {
    super();
  }
}

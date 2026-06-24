import { Component } from "../core/Component";
import type { Material } from "../render/Material";
import type { Mesh } from "../render/Mesh";

/**
 * Marque un GameObject comme dessinable : associe une géométrie (Mesh) et un
 * matériau (couleur + texture éventuelle). Le Renderer collecte tous les
 * MeshRenderer de la scène et les dessine.
 *
 * Un même GameObject peut porter PLUSIEURS MeshRenderer (cas d'un node glTF aux
 * primitives multiples) : autant de couples géométrie/matériau partageant le
 * même Transform.
 */
export class MeshRenderer extends Component {
  constructor(
    public mesh: Mesh,
    public material: Material,
  ) {
    super();
  }
}

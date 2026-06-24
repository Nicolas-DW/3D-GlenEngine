import type { Material } from "../render/Material";
import type { Mesh } from "../render/Mesh";

/**
 * Composant « dessinable » (données) : une géométrie + un matériau. Le
 * RenderSystem balaie toutes les entités qui en ont un.
 */
export class MeshRenderer {
  constructor(
    public mesh: Mesh,
    public material: Material,
  ) {}
}

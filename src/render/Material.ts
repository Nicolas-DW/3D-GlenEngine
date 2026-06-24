import type { Texture } from "./Texture";

/**
 * "Recette d'apparence" d'une surface : une couleur de base, et optionnellement
 * une texture qui la module. C'est ce qui permet d'avoir des matériaux
 * MULTIPLES dans une scène (chaque MeshRenderer pointe vers son Material).
 *
 * Volontairement minimal pour l'instant : la couleur correspond au
 * `baseColorFactor` de glTF, la texture au `baseColorTexture`. On pourra y
 * ajouter plus tard métal/rugosité, normal map, etc.
 */
export class Material {
  constructor(
    public color: [number, number, number] = [0.8, 0.8, 0.8],
    public texture: Texture | null = null,
  ) {}
}

# GlenEngine

Moteur 3D web minimal, écrit **from scratch** : rendu WebGL2 (backend WebGPU
expérimental en option), maths maison, **aucune dépendance runtime**.
Architecture **GameObject / Component** (style Unity) en TypeScript, servi par
Vite.

## Démarrer

```bash
npm install
npm run dev        # serveur de dev (ouvre le navigateur)
npm run build      # typecheck + bundle de prod
npm run typecheck  # vérifie les types sans builder
```

Au lancement : trois objets qui tournent — un cube texturé (damier), un cube à
matériau uni, et un quad chargé via le loader glTF.

Pour essayer le backend WebGPU (navigateur compatible requis) : ouvrir avec
`?backend=webgpu` dans l'URL. À défaut, le moteur utilise WebGL2.

## Architecture

Le moteur ne « sait » rien faire par lui-même : on compose des **GameObjects**
en leur attachant des **Components** qui portent la logique.

```
src/
├── main.ts                 # bootstrap : monte la caméra + la scène de démo
├── math/
│   ├── Vec3.ts             # vecteurs 3D
│   ├── Quaternion.ts       # rotations (sans gimbal lock)
│   └── Mat4.ts             # matrices 4x4 (column-major, prêtes pour le GPU)
├── core/
│   ├── Engine.ts           # game loop (requestAnimationFrame)
│   ├── Scene.ts            # racine + parcours de la hiérarchie
│   ├── GameObject.ts       # conteneur : transform + components + enfants
│   ├── Component.ts        # base : start() / update(dt)
│   └── Transform.ts        # position / rotation (quaternion) / échelle
├── render/
│   ├── Renderer.ts         # pilote neutre : choisit un backend, lui passe la frame
│   ├── RenderBackend.ts    # interface commune WebGL2 / WebGPU
│   ├── WebGL2Backend.ts    # implémentation WebGL2 (par défaut)
│   ├── WebGPUBackend.ts    # implémentation WebGPU (opt-in, WGSL)
│   ├── Shader.ts           # compilation/link d'un programme GLSL (WebGL2)
│   ├── Mesh.ts             # données de géométrie (positions/normales/uv/indices)
│   ├── Material.ts         # couleur + texture
│   ├── Texture.ts          # description de texture (image ou pixels)
│   └── shaders.ts          # GLSL du shader par défaut (lumière + texture)
├── components/
│   ├── Camera.ts           # caméra perspective (projection + vue)
│   ├── MeshRenderer.ts     # rend un objet dessinable (mesh + material)
│   └── Rotator.ts          # démo : fait tourner l'objet
├── loaders/
│   └── GltfLoader.ts       # importe des modèles glTF 2.0 (.gltf / .glb)
└── geometry/
    └── cube.ts             # génère un cube unité
```

### Boucle de jeu (Engine)

Chaque frame : `start()` sur les composants neufs → `update(dt)` sur tous →
`Renderer.render(scene)`.

### Rendu

Le `Renderer` est **indépendant du backend** : il cherche la première `Camera`,
assemble les données neutres de la frame (matrices + liste d'objets) et délègue
le dessin à un `RenderBackend`. `Mesh` et `Texture` ne portent que des données ;
chaque backend les téléverse et les met en cache. WebGL2 est le backend complet
par défaut ; WebGPU (opt-in) couvre géométrie + couleur + éclairage.

## Étendre

- **Nouvel objet** : `new GameObject()` + `addComponent(...)` + `scene.add(...)`.
- **Nouveau comportement** : crée une classe qui étend `Component` et
  implémente `update(dt)`.
- **Nouvelle géométrie** : renvoie un `Mesh` (positions, normales, indices, uv),
  comme `geometry/cube.ts`.
- **Charger un modèle** : `await loadGltf(url)` renvoie un `GameObject` prêt à
  ajouter à la scène.

## Pistes d'évolution

Faites : quaternions, glTF + textures + matériaux multiples, backend de rendu
abstrait (WebGL2 + WebGPU opt-in).

Restent :

- Caméra orbitale contrôlée à la souris.
- Texturing dans le backend WebGPU (bind group texture + sampler).
- Migration vers un ECS si le nombre d'entités explose.

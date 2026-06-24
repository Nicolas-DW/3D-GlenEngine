# GlenEngine

Moteur 3D web minimal, écrit **from scratch** : WebGL2 brut, maths maison,
**aucune dépendance runtime**. Architecture **GameObject / Component** (style
Unity) en TypeScript, servi par Vite.

## Démarrer

```bash
npm install
npm run dev        # serveur de dev (ouvre le navigateur)
npm run build      # typecheck + bundle de prod
npm run typecheck  # vérifie les types sans builder
```

Au lancement : un cube bleu éclairé qui tourne sur lui-même.

## Architecture

Le moteur ne « sait » rien faire par lui-même : on compose des **GameObjects**
en leur attachant des **Components** qui portent la logique.

```
src/
├── main.ts                 # bootstrap : monte la caméra + le cube
├── math/
│   ├── Vec3.ts             # vecteurs 3D
│   └── Mat4.ts             # matrices 4x4 (column-major, prêtes pour le GPU)
├── core/
│   ├── Engine.ts           # game loop (requestAnimationFrame)
│   ├── Scene.ts            # racine + parcours de la hiérarchie
│   ├── GameObject.ts       # conteneur : transform + components + enfants
│   ├── Component.ts        # base : start() / update(dt)
│   └── Transform.ts        # position / rotation / échelle + matrice monde
├── render/
│   ├── Renderer.ts         # contexte WebGL2, boucle de dessin
│   ├── Shader.ts           # compilation/link d'un programme GPU
│   ├── Mesh.ts             # VAO (positions + normales + indices)
│   └── shaders.ts          # GLSL du shader par défaut (lumière directionnelle)
├── components/
│   ├── Camera.ts           # caméra perspective (projection + vue)
│   ├── MeshRenderer.ts     # rend un objet dessinable (mesh + couleur)
│   └── Rotator.ts          # démo : fait tourner l'objet
└── geometry/
    └── cube.ts             # génère un cube unité
```

### Boucle de jeu (Engine)

Chaque frame : `start()` sur les composants neufs → `update(dt)` sur tous →
`Renderer.render(scene)`.

### Rendu

Le `Renderer` cherche la première `Camera` de la scène, configure les matrices
projection/vue, puis dessine chaque `MeshRenderer` avec sa matrice monde et sa
couleur.

## Étendre

- **Nouvel objet** : `new GameObject()` + `addComponent(...)` + `scene.add(...)`.
- **Nouveau comportement** : crée une classe qui étend `Component` et
  implémente `update(dt)`.
- **Nouvelle géométrie** : renvoie un `Mesh` (positions, normales, indices),
  comme `geometry/cube.ts`.

## Pistes d'évolution

- Quaternions (remplacer les angles d'Euler dans `Transform`).
- Chargement de modèles (glTF), textures, matériaux multiples.
- Caméra orbitale contrôlée à la souris.
- Backend de rendu abstrait pour brancher WebGPU à côté de WebGL2.
- Migration vers un ECS si le nombre d'entités explose.

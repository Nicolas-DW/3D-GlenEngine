# GlenEngine

Moteur 3D web minimal, écrit **from scratch** : rendu **WebGPU** (WGSL), maths
maison, **aucune dépendance runtime**. Architecture **GameObject / Component**
(style Unity) en TypeScript, servi par Vite.

> Un navigateur compatible **WebGPU** est requis. Le backend WebGL2 historique a
> été retiré ; il reste disponible dans l'historique git.

## Démarrer

```bash
npm install
npm run dev        # serveur de dev (ouvre le navigateur)
npm run build      # typecheck + bundle de prod
npm run typecheck  # vérifie les types sans builder
```

Au lancement : trois objets qui tournent — un cube texturé (damier), un cube à
matériau uni, et un quad chargé via le loader glTF.

**Contrôles caméra** (souris / trackpad) :

- clic gauche + glisser → orbite (pivot) ;
- molette du milieu + glisser, ou glissement deux doigts (trackpad) → déplacement (pan) ;
- pincer (trackpad) ou Ctrl + molette → zoom.

Sensibilités zoom / déplacement / rotation réglables dans la barre d'outils
(section « Caméra »).

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
│   ├── Renderer.ts         # pilote neutre : assemble la frame, la passe au backend
│   ├── RenderBackend.ts    # interface d'un backend de rendu
│   ├── WebGPUBackend.ts    # implémentation WebGPU (WGSL : lumière + texture)
│   ├── Mesh.ts             # données de géométrie (positions/normales/uv/indices)
│   ├── Material.ts         # couleur + texture
│   └── Texture.ts          # description de texture (image ou pixels)
├── components/
│   ├── Camera.ts           # caméra perspective (projection + vue)
│   ├── OrbitController.ts  # caméra orbitale souris / trackpad
│   ├── MeshRenderer.ts     # rend un objet dessinable (mesh + material)
│   ├── RigidBody.ts        # corps physique d'une bille (vitesse + rayon)
│   └── Rotator.ts          # démo : fait tourner l'objet
├── physics/
│   └── PhysicsWorld.ts     # pas global : gravité + collisions (paroi, bille-bille)
├── loaders/
│   └── GltfLoader.ts       # importe des modèles glTF 2.0 (.gltf / .glb)
├── experiences/
│   ├── Experience.ts       # interface : start() / stop() une scène jouable
│   └── MarblesExperience.ts# réceptacle + ~120 billes physiques
├── ui/
│   └── Sidebar.ts          # barre d'outils : expériences + réglages
└── geometry/
    ├── cube.ts             # génère un cube unité
    └── sphere.ts           # génère une sphère UV (les billes)
```

### Boucle de jeu (Engine)

Chaque frame : `start()` sur les composants neufs → `update(dt)` sur tous →
`Renderer.render(scene)`.

### Rendu

Le `Renderer` est **indépendant du backend** : il cherche la première `Camera`,
assemble les données neutres de la frame (matrices + liste d'objets) et délègue
le dessin à un `RenderBackend`. `Mesh` et `Texture` ne portent que des données ;
le backend les téléverse et les met en cache. Backend actuel : **WebGPU**
(géométrie + couleur + éclairage + texture). Le backend WebGL2 a été retiré
mais reste dans l'historique git, et l'interface `RenderBackend` permet d'en
rebrancher un sans toucher au reste.

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
abstrait, migration sur WebGPU (WebGL2 retiré, conservé dans l'historique),
caméra orbitale + pan + sensibilités, barre d'outils, réceptacle de billes
(physique : gravité + collisions paroi/bille-bille, broad phase par grille spatiale).

Restent :

- Billes par milliers : rendu instancié (un seul draw pour toutes les billes) —
  le mur des draw calls une fois la broad phase en place côté CPU.
- Mipmaps côté WebGPU (non générés actuellement).
- Migration vers un ECS si le nombre d'entités explose.

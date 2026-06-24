# GlenEngine

Moteur 3D web minimal, écrit **from scratch** : rendu **WebGPU** (WGSL), maths
maison, **aucune dépendance runtime**. Architecture **ECS** (Entity-Component-
System) en TypeScript, servi par Vite.

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

## Architecture (ECS)

- Une **entité** est un simple ID.
- Un **composant** est de la **donnée pure** (Transform, MeshRenderer, RigidBody…),
  stockée par type dans le `World`.
- Un **système** porte la logique : il balaie les entités ayant les composants
  qui l'intéressent et agit dessus.

```
src/
├── main.ts                 # bootstrap : entité caméra + systèmes + scène de démo
├── math/
│   ├── Vec3.ts             # vecteurs 3D
│   ├── Quaternion.ts       # rotations (sans gimbal lock)
│   └── Mat4.ts             # matrices 4x4 (column-major, prêtes pour le GPU)
├── core/
│   ├── World.ts            # ECS : entités + stores de composants
│   ├── Engine.ts           # game loop : update() des systèmes puis rendu
│   └── Transform.ts        # composant position / rotation / échelle (+ hiérarchie)
├── components/             # COMPOSANTS = données pures
│   ├── Camera.ts           # caméra perspective (projection + vue)
│   ├── MeshRenderer.ts     # dessinable : mesh + material
│   ├── RigidBody.ts        # corps physique : vitesse, vitesse angulaire, rayon
│   └── Rotator.ts          # vitesse de rotation (démo)
├── systems/                # SYSTÈMES = logique
│   ├── RenderSystem.ts     # assemble la frame depuis le World, délègue au backend
│   ├── PhysicsSystem.ts    # gravité, collisions, frottement, roulement, broad phase
│   ├── OrbitSystem.ts      # caméra orbitale souris / trackpad
│   └── RotatorSystem.ts    # fait tourner les entités avec un Rotator
├── render/
│   ├── RenderBackend.ts    # interface d'un backend de rendu
│   ├── WebGPUBackend.ts    # implémentation WebGPU (WGSL, rendu instancié)
│   ├── Mesh.ts             # données de géométrie (positions/normales/uv/indices)
│   ├── Material.ts         # couleur + texture
│   └── Texture.ts          # description de texture (image ou pixels)
├── loaders/
│   └── GltfLoader.ts       # importe des modèles glTF 2.0 (crée des entités)
├── experiences/
│   ├── Experience.ts       # interface : start() / stop() une scène jouable
│   └── MarblesExperience.ts# réceptacle + ~500 billes physiques
├── ui/
│   └── Sidebar.ts          # barre d'outils : expériences + réglages
└── geometry/
    ├── cube.ts             # génère un cube unité
    └── sphere.ts           # génère une sphère UV (les billes)
```

### Boucle de jeu (Engine)

Chaque frame : `update(world, dt)` sur tous les systèmes enregistrés, puis le
`RenderSystem` en dernier.

### Rendu

Le `RenderSystem` est **indépendant du backend** : il cherche la caméra, assemble
les données neutres de la frame (matrices + liste d'objets) depuis le `World`, et
délègue à un `RenderBackend`. `Mesh` et `Texture` ne portent que des données ; le
backend les téléverse, met en cache, et **instancie** les objets partageant un
mesh (1 draw call). Backend actuel : **WebGPU** ; WebGL2 retiré (historique git).

## Étendre

- **Nouvelle entité** : `world.create()` + `world.add(entity, new Transform())` +
  les composants voulus.
- **Nouveau comportement** : écris un système (`implements System`) qui balaie
  `world.view(MonComposant)` et l'enregistre via `engine.add(...)`.
- **Nouvelle géométrie** : renvoie un `Mesh` (positions, normales, indices, uv),
  comme `geometry/cube.ts`.
- **Charger un modèle** : `await loadGltf(world, url)` crée les entités et renvoie
  leur liste (la racine en premier).

## Pistes d'évolution

Faites : quaternions, glTF + textures + matériaux multiples, backend de rendu
abstrait, migration sur WebGPU (WebGL2 retiré, conservé dans l'historique),
caméra orbitale + pan + sensibilités, barre d'outils, réceptacle de billes
(physique : gravité, collisions paroi/bille-bille, frottement + roulement,
broad phase par grille spatiale, rendu instancié), mipmaps WebGPU, **migration
ECS complète**.

Restent :

- Stores ECS contigus (typed arrays) pour pousser le data-oriented plus loin.
- Frottement plus physique (vrai modèle d'impulsion avec inertie).

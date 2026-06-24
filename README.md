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

**Barre d'outils** (à droite) :

- **Physique** : gravité, rebond, frottement, amortissements linéaire/angulaire —
  réglables **en direct** pendant la simulation (et conservés entre deux lancements) ;
  plus le **nombre de billes** (50–1500), appliqué au relâchement du curseur.
- **Caméra** : sensibilités zoom / déplacement / rotation.
- **Affichage** : interrupteur du **HUD** de diagnostic (coin haut-gauche) — FPS,
  nombre d'objets, de triangles dessinés et de draw calls.

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
│   ├── World.ts            # ECS : entités + stores packés (sparse-set)
│   ├── Engine.ts           # game loop : update() des systèmes puis rendu
│   └── Transform.ts        # composant position / rotation / échelle (+ hiérarchie)
├── components/             # COMPOSANTS = données pures
│   ├── Camera.ts           # caméra perspective (projection + vue)
│   ├── MeshRenderer.ts     # dessinable : mesh + material
│   ├── RigidBody.ts        # corps physique : vitesse, vitesse angulaire, rayon
│   └── Rotator.ts          # vitesse de rotation (démo)
├── systems/                # SYSTÈMES = logique
│   ├── RenderSystem.ts     # assemble la frame depuis le World, délègue au backend
│   ├── PhysicsSystem.ts    # solveur d'impulsions itéré (split impulse) + sommeil, broad phase
│   ├── OrbitSystem.ts      # caméra orbitale souris / trackpad
│   ├── RotatorSystem.ts    # fait tourner les entités avec un Rotator
│   └── StatsSystem.ts      # FPS lissé + compteurs de rendu -> HUD
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
│   ├── Sidebar.ts          # barre d'outils : expériences + réglages
│   └── StatsOverlay.ts     # HUD diagnostic (FPS, objets, triangles, draw calls)
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
(physique : **solveur d'impulsions séquentiel itéré (Gauss-Seidel) + correction
de position douce (Baumgarte) + mise en sommeil**, frottement avec inertie —
glissement/roulement, pivotement, dissipation de la rotation —, collisions
paroi/bille-bille, broad phase par grille spatiale, rendu instancié), mipmaps WebGPU,
**migration ECS complète**, **stores packés (sparse-set, retrait O(1), itération
dense)**, **réglages physiques live + HUD de diagnostic (FPS / objets / triangles
/ draw calls)**.

Restent :

- Stockage SoA en *typed arrays* bruts (données contiguës en mémoire, pas
  seulement les références) — un cran plus loin que le sparse-set, au prix de
  composants réduits à des champs primitifs (plus de composants-classes).
- Friction de Coulomb bornée (impulsion tangentielle plafonnée par `µ·jₙ`) plutôt
  que la fraction de vitesse de surface dissipée actuelle.

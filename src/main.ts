import { Camera } from "./components/Camera";
import { MeshRenderer } from "./components/MeshRenderer";
import { Rotator } from "./components/Rotator";
import { Engine } from "./core/Engine";
import { GameObject } from "./core/GameObject";
import { createCube } from "./geometry/cube";

// --- Bootstrap : on monte le moteur sur le canvas. ---
const canvas = document.getElementById("app") as HTMLCanvasElement;
const engine = new Engine(canvas);

// --- Caméra : un GameObject reculé sur +Z, qui regarde l'origine. ---
const cameraObject = new GameObject("Camera");
cameraObject.transform.position.set(0, 1.5, 4);
cameraObject.addComponent(new Camera());
engine.scene.add(cameraObject);

// --- Le cube : géométrie + couleur + rotation continue. ---
const cube = new GameObject("Cube");
cube.addComponent(new MeshRenderer(createCube(engine.renderer.gl), [0.35, 0.65, 1.0]));
cube.addComponent(new Rotator());
engine.scene.add(cube);

engine.start();

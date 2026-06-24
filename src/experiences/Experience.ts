import type { Engine } from "../core/Engine";

/**
 * Une « expérience » est une scène jouable que l'on charge/décharge à la demande
 * depuis la barre d'outils (réceptacle de billes, etc.).
 *
 * Contrat minimal : start() peuple la scène (GameObjects + composants),
 * stop() les retire. L'expérience est responsable de ses propres objets.
 */
export interface Experience {
  readonly name: string;
  start(engine: Engine): void;
  stop(engine: Engine): void;
}

/**
 * HUD de diagnostic (coin haut-gauche) : FPS, nb d'objets, triangles, draw calls.
 *
 * DOM brut, comme la barre d'outils. `position: fixed` + `pointer-events: none`
 * pour ne jamais voler les clics/gestes destinés à la caméra. Affiché/masqué via
 * setVisible() (piloté par un toggle de la barre d'outils).
 */
export interface StatsData {
  fps: number;
  objects: number;
  triangles: number;
  drawCalls: number;
}

export class StatsOverlay {
  private readonly root: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly objects: HTMLElement;
  private readonly triangles: HTMLElement;
  private readonly drawCalls: HTMLElement;
  private visible = false;

  constructor() {
    injectStyles();
    this.root = element("div", "ge-stats");
    this.fps = this.addRow("FPS");
    this.objects = this.addRow("Objets");
    this.triangles = this.addRow("Triangles");
    this.drawCalls = this.addRow("Draw calls");
    this.root.style.display = "none";
    document.body.append(this.root);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.style.display = on ? "" : "none";
  }

  /** Met à jour les valeurs (no-op si masqué : pas de reflow inutile). */
  update(data: StatsData): void {
    if (!this.visible) return;
    this.fps.textContent = data.fps.toFixed(0);
    this.objects.textContent = data.objects.toLocaleString("fr-FR");
    this.triangles.textContent = data.triangles.toLocaleString("fr-FR");
    this.drawCalls.textContent = String(data.drawCalls);
  }

  private addRow(label: string): HTMLElement {
    const row = element("div", "ge-stats-row");
    const value = element("span", "ge-stats-val", "—");
    row.append(element("span", "ge-stats-key", label), value);
    this.root.append(row);
    return value;
  }
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyles(): void {
  if (document.getElementById("ge-stats-styles")) return;
  const style = document.createElement("style");
  style.id = "ge-stats-styles";
  style.textContent = STYLES;
  document.head.append(style);
}

const STYLES = `
.ge-stats {
  position: fixed; top: 12px; left: 12px; z-index: 10;
  pointer-events: none; user-select: none;
  min-width: 148px; padding: 10px 12px;
  background: rgba(15, 18, 26, 0.78);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;
  color: #e8ecf4;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ge-stats-row { display: flex; justify-content: space-between; gap: 16px; }
.ge-stats-key { color: #8b93a7; }
.ge-stats-val { font-variant-numeric: tabular-nums; }
`;

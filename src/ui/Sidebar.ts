/**
 * Barre d'outils latérale (à droite). Vouée à accueillir la plupart des
 * interactions avec la vue 3D : outils, paramètres, options...
 *
 * Pour l'instant : une seule section « Expériences » sous forme de menu
 * déroulant. Chaque expérience y est un bouton qui la lance / l'arrête.
 *
 * UI volontairement en DOM brut (pas de framework) : le canvas WebGPU occupe
 * tout l'écran, la barre flotte par-dessus en `position: fixed`. Comme c'est un
 * élément DOM distinct, les clics/gestes sur la barre ne déclenchent PAS la
 * caméra orbitale (qui écoute sur le canvas).
 */
export interface SidebarExperience {
  label: string;
  launch: () => void;
  stop: () => void;
}

export interface SidebarSlider {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Mise en forme de la valeur affichée (défaut : nombre brut). */
  format?: (v: number) => string;
  onInput: (value: number) => void;
}

export interface SidebarSettings {
  title: string;
  sliders: SidebarSlider[];
}

export interface SidebarConfig {
  experiences: SidebarExperience[];
  settings?: SidebarSettings;
}

export function createSidebar(config: SidebarConfig): void {
  injectStyles();

  const aside = element("aside", "ge-sidebar");
  aside.append(element("div", "ge-title", "Outils"));
  aside.append(buildExperiences(config.experiences));
  if (config.settings) aside.append(buildSettings(config.settings));
  document.body.append(aside);
}

function buildExperiences(experiences: SidebarExperience[]): HTMLElement {
  const section = element("div", "ge-section");

  const toggle = element("button", "ge-toggle") as HTMLButtonElement;
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.append(element("span", "", "Expériences"), element("span", "ge-chevron", "▸"));
  toggle.addEventListener("click", () => {
    const open = section.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  const list = element("div", "ge-list");
  for (const exp of experiences) {
    list.append(buildExperienceButton(exp));
  }

  section.append(toggle, list);
  return section;
}

function buildSettings(settings: SidebarSettings): HTMLElement {
  const section = element("div", "ge-section open"); // ouvert par défaut
  const toggle = element("button", "ge-toggle") as HTMLButtonElement;
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "true");
  toggle.append(element("span", "", settings.title), element("span", "ge-chevron", "▸"));
  toggle.addEventListener("click", () => {
    const open = section.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  const list = element("div", "ge-list");
  for (const slider of settings.sliders) list.append(buildSlider(slider));

  section.append(toggle, list);
  return section;
}

function buildSlider(slider: SidebarSlider): HTMLElement {
  const fmt = slider.format ?? ((v: number) => String(v));
  const row = element("div", "ge-slider");

  const head = element("div", "ge-slider-head");
  const value = element("span", "ge-slider-val", fmt(slider.value));
  head.append(element("span", "", slider.label), value);

  const input = element("input", "ge-range") as HTMLInputElement;
  input.type = "range";
  input.min = String(slider.min);
  input.max = String(slider.max);
  input.step = String(slider.step);
  input.value = String(slider.value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    value.textContent = fmt(v);
    slider.onInput(v);
  });

  row.append(head, input);
  return row;
}

function buildExperienceButton(exp: SidebarExperience): HTMLButtonElement {
  const btn = element("button", "ge-item", exp.label) as HTMLButtonElement;
  btn.type = "button";
  let active = false;
  btn.addEventListener("click", () => {
    active = !active;
    btn.classList.toggle("active", active);
    btn.textContent = (active ? "● " : "") + exp.label;
    if (active) exp.launch();
    else exp.stop();
  });
  return btn;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyles(): void {
  if (document.getElementById("ge-sidebar-styles")) return;
  const style = document.createElement("style");
  style.id = "ge-sidebar-styles";
  style.textContent = STYLES;
  document.head.append(style);
}

const STYLES = `
.ge-sidebar {
  position: fixed; top: 0; right: 0; height: 100%; width: 264px;
  box-sizing: border-box; padding: 16px 14px;
  background: rgba(15, 18, 26, 0.82);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  color: #e8ecf4;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  z-index: 10; user-select: none;
}
.ge-title {
  font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  color: #8b93a7; margin-bottom: 14px;
}
.ge-section { display: flex; flex-direction: column; }
.ge-section + .ge-section { margin-top: 14px; }
.ge-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 10px 12px; cursor: pointer; font: inherit; font-weight: 600;
  color: inherit; background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;
}
.ge-toggle:hover { background: rgba(255, 255, 255, 0.09); }
.ge-chevron { transition: transform 0.18s ease; color: #8b93a7; }
.ge-section.open .ge-chevron { transform: rotate(90deg); }
.ge-list {
  overflow: hidden; max-height: 0; transition: max-height 0.22s ease;
}
.ge-section.open .ge-list { max-height: 480px; }
.ge-item {
  display: block; width: 100%; margin-top: 6px; padding: 9px 12px;
  cursor: pointer; text-align: left; font: inherit; color: inherit;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;
}
.ge-item:hover { background: rgba(255, 255, 255, 0.06); }
.ge-item.active {
  background: rgba(90, 140, 255, 0.18); border-color: rgba(90, 140, 255, 0.5);
}
.ge-toggle:focus-visible, .ge-item:focus-visible, .ge-range:focus-visible {
  outline: 2px solid #5a8cff; outline-offset: 2px;
}
.ge-slider { margin-top: 12px; padding: 0 2px; }
.ge-slider-head {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 12px; color: #aeb6c6; margin-bottom: 5px;
}
.ge-slider-val { color: #e8ecf4; font-variant-numeric: tabular-nums; }
.ge-range { width: 100%; accent-color: #5a8cff; cursor: pointer; }
`;

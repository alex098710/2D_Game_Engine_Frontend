import { getSettings, saveSettings, type SettingsDto } from "../api/client";
import { setVolumes } from "../game/audio";
import { byId } from "./dom";
import { applyTheme, storedTheme } from "./theme";
import { toast } from "./toast";

export const DEFAULT_SETTINGS: SettingsDto = {
  theme: "dark",
  language: "es",
  show_grid: true,
  snap_to_grid: true,
  grid_size: 32,
  music_volume: 70,
  sfx_volume: 80,
};

/**
 * The drawer opened by the gear: theme (light, dark, system), grid and sound.
 * Changes apply at once and are saved to the account a moment later.
 */
export class SettingsPanel {
  private settings: SettingsDto = { ...DEFAULT_SETTINGS, theme: storedTheme() };
  private saveTimer: number | undefined;
  private readonly onChange: (settings: SettingsDto) => void;
  private readonly drawer = byId("settings");
  private readonly backdrop = byId("settings-backdrop");
  private readonly gear = byId("btn-settings");
  /** Others that show the settings too (the home screen's quick settings). */
  private readonly listeners: ((settings: SettingsDto) => void)[] = [];

  constructor(onChange: (settings: SettingsDto) => void) {
    this.onChange = onChange;
    applyTheme(this.settings.theme);
    this.gear.addEventListener("click", () => (this.drawer.hidden ? this.open() : this.close()));
    byId("settings-close").addEventListener("click", () => this.close());
    this.backdrop.addEventListener("click", () => this.close());
    this.bindInputs();
  }

  private bindInputs(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-option]")) {
      button.addEventListener("click", () => this.update({ theme: button.dataset.themeOption as SettingsDto["theme"] }));
    }
    byId<HTMLInputElement>("set-grid").addEventListener("change", (e) => this.update({ show_grid: (e.target as HTMLInputElement).checked }));
    byId<HTMLInputElement>("set-snap").addEventListener("change", (e) => this.update({ snap_to_grid: (e.target as HTMLInputElement).checked }));
    byId<HTMLSelectElement>("set-grid-size").addEventListener("change", (e) => this.update({ grid_size: Number((e.target as HTMLSelectElement).value) }));
    byId<HTMLInputElement>("set-music").addEventListener("input", (e) => this.update({ music_volume: Number((e.target as HTMLInputElement).value) }));
    byId<HTMLInputElement>("set-sfx").addEventListener("input", (e) => this.update({ sfx_volume: Number((e.target as HTMLInputElement).value) }));
  }

  open(): void {
    this.render();
    this.drawer.hidden = false;
    this.backdrop.hidden = false;
    this.gear.setAttribute("aria-expanded", "true");
  }

  close(): void {
    this.drawer.hidden = true;
    this.backdrop.hidden = true;
    this.gear.setAttribute("aria-expanded", "false");
  }

  private render(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-option]")) {
      button.classList.toggle("is-active", button.dataset.themeOption === this.settings.theme);
    }
    byId<HTMLInputElement>("set-grid").checked = this.settings.show_grid;
    byId<HTMLInputElement>("set-snap").checked = this.settings.snap_to_grid;
    byId<HTMLSelectElement>("set-grid-size").value = String(this.settings.grid_size);
    byId<HTMLInputElement>("set-music").value = String(this.settings.music_volume);
    byId<HTMLInputElement>("set-sfx").value = String(this.settings.sfx_volume);
  }

  /** Be told every time the settings change (here or elsewhere). */
  listen(listener: (settings: SettingsDto) => void): void {
    this.listeners.push(listener);
  }

  /** Change some settings from outside the drawer (applied, shown and saved like the drawer's own). */
  change(change: Partial<SettingsDto>): void {
    this.update(change);
  }

  private update(change: Partial<SettingsDto>): void {
    this.settings = { ...this.settings, ...change };
    applyTheme(this.settings.theme);
    setVolumes(this.settings.sfx_volume, this.settings.music_volume);
    this.render();
    this.onChange(this.settings);
    for (const listener of this.listeners) listener(this.settings);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      saveSettings(this.settings).catch(() => toast("No se pudieron guardar los ajustes.", "error"));
    }, 500);
  }

  async load(): Promise<SettingsDto> {
    try {
      this.settings = { ...DEFAULT_SETTINGS, ...(await getSettings()) };
    } catch {
      // keep the local defaults if the backend is unreachable
    }
    applyTheme(this.settings.theme);
    setVolumes(this.settings.sfx_volume, this.settings.music_volume);
    this.onChange(this.settings);
    for (const listener of this.listeners) listener(this.settings);
    return this.settings;
  }

  get value(): SettingsDto {
    return this.settings;
  }
}

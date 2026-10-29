import { invoke } from "@tauri-apps/api/core";
import type { AppState, CatalogResult, InstalledGame, Release, Settings } from "./types";

export const api = {
  getState: () => invoke<AppState>("get_state"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  loadCatalog: () => invoke<CatalogResult>("load_catalog"),
  latestRelease: (repo: string) => invoke<Release>("latest_release", { repo }),
  installGame: (id: string, repo: string, asset?: string) =>
    invoke<InstalledGame>("install_game", { id, repo, asset: asset ?? null }),
  uninstallGame: (id: string) => invoke<void>("uninstall_game", { id }),
  setGameFiles: (id: string, source: string, copyTo?: string) =>
    invoke<InstalledGame>("set_game_files", { id, source, copyTo: copyTo ?? null }),
  buildGame: (id: string, command: string, args: string[], produces?: string) =>
    invoke<void>("build_game", { id, command, args, produces: produces ?? null }),
  launchGame: (id: string, exe: string, args: string[]) => invoke<void>("launch_game", { id, exe, args }),
  openGameDir: (id: string, sub?: string) => invoke<void>("open_game_dir", { id, sub: sub ?? null }),
  listConfigFiles: (id: string) => invoke<string[]>("list_config_files", { id }),
  readGameFile: (id: string, path: string) => invoke<string | null>("read_game_file", { id, path }),
  writeGameFile: (id: string, path: string, contents: string) =>
    invoke<void>("write_game_file", { id, path, contents }),
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}

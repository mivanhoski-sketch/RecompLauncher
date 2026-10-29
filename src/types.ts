export interface Platform {
  name: string;
  color: string;
}

export interface GameFilesSpec {
  label: string;
  /** "file" (ISO/ROM), "folder" (dump extraído) ou "any" (ambos). */
  kind: "file" | "folder" | "any";
  extensions?: string[];
  /** Pasta (relativa à instalação) para onde copiar os arquivos. Sem ela, só o caminho é guardado. */
  copyTo?: string;
}

export interface BuildSpec {
  label?: string;
  command: string;
  args?: string[];
  /** Arquivo que existe quando a compilação deu certo. */
  produces?: string;
  note?: string;
}

export interface Game {
  id: string;
  title: string;
  platform: string;
  year?: number;
  repo: string;
  asset?: string;
  exe: string;
  args?: string[];
  cover?: string;
  description?: string;
  gameFiles?: GameFilesSpec;
  build?: BuildSpec;
  requirements?: string[];
  notes?: string[];
}

export interface Catalog {
  version: number;
  platforms: Record<string, Platform>;
  games: Game[];
}

export interface CatalogResult {
  catalog: Catalog;
  source: "remote" | "cache" | "bundled";
  error?: string | null;
}

export interface InstalledGame {
  version: string;
  asset: string;
  installedAt: number;
  gameFiles?: string | null;
  builtVersion?: string | null;
}

export interface Settings {
  catalogUrl: string;
  libraryDir?: string | null;
}

export interface AppState {
  installed: Record<string, InstalledGame>;
  settings: Settings;
  gamesDir: string;
}

export interface Release {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url: string;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

export interface Progress {
  id: string;
  stage: "release" | "download" | "extract" | "copy" | "done";
  done: number;
  total: number;
}

export interface BuildFinished {
  id: string;
  success: boolean;
  message: string;
}

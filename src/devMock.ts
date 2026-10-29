// Backend falso para abrir a interface no navegador (`npm run dev`) sem o Tauri/Rust.
// Só é carregado em desenvolvimento e quando a página não está rodando dentro do app.
import { mockIPC } from "@tauri-apps/api/mocks";
import catalog from "../catalog/catalog.json";

const installed: Record<string, unknown> = {
  "black-xbe": { version: "V1", asset: "BLACK-XBERecomp.zip", installedAt: 0, gameFiles: "D:\\Jogos\\Black (USA).iso" },
  "totk-ultratears": { version: "v0.1.0-beta", asset: "UltraTears-builder.zip", installedAt: 0, gameFiles: null },
};

export function installDevMock() {
  mockIPC(
    async (cmd, args) => {
      const a = args as Record<string, string>;
      switch (cmd) {
        case "get_state":
          return { installed, settings: { catalogUrl: "", libraryDir: null }, gamesDir: "C:\\Users\\voce\\AppData\\Roaming\\RecompLauncher\\games" };
        case "load_catalog":
          return { catalog, source: "bundled", error: null };
        case "latest_release": {
          const r = await fetch(`https://api.github.com/repos/${a.repo}/releases?per_page=5`);
          if (!r.ok) throw `GitHub respondeu ${r.status}`;
          const list = await r.json();
          return list.find((x: { prerelease: boolean }) => !x.prerelease) ?? list[0];
        }
        case "list_config_files":
          return ["config.toml", "userdata/settings.ini"];
        case "read_game_file":
          return "[display]\nfullscreen = true\nresolution = \"1920x1080\"\n";
        default:
          console.info("[mock]", cmd, args);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}

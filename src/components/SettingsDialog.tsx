import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Ctx } from "../App";
import { api, errorText } from "../api";

const DEFAULT_CATALOG =
  "https://raw.githubusercontent.com/mivanhoski-sketch/RecompLauncher/main/catalog/catalog.json";

export function SettingsDialog({ ctx, onClose, onSaved }: { ctx: Ctx; onClose: () => void; onSaved: () => void }) {
  const [catalogUrl, setCatalogUrl] = useState(ctx.state.settings.catalogUrl);
  const [libraryDir, setLibraryDir] = useState(ctx.state.settings.libraryDir ?? "");

  const pickDir = async () => {
    const dir = await open({ directory: true, title: "Pasta da biblioteca" });
    if (typeof dir === "string") setLibraryDir(dir);
  };

  const save = async () => {
    try {
      await api.saveSettings({ catalogUrl: catalogUrl.trim(), libraryDir: libraryDir.trim() || null });
      onSaved();
    } catch (e) {
      ctx.toast("error", errorText(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Configurações</h2>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        <label className="field">
          <span>URL do catálogo</span>
          <input value={catalogUrl} onChange={(e) => setCatalogUrl(e.target.value)} placeholder="Vazio = catálogo embutido" />
          <small className="muted">
            Lista de jogos baixada ao abrir o launcher. Para incluir um jogo novo, edite o catalog.json no GitHub.{" "}
            <button className="link" onClick={() => setCatalogUrl(DEFAULT_CATALOG)}>
              Restaurar padrão
            </button>
          </small>
        </label>

        <label className="field">
          <span>Pasta da biblioteca</span>
          <div className="row">
            <input value={libraryDir} onChange={(e) => setLibraryDir(e.target.value)} placeholder={ctx.state.gamesDir} />
            <button className="btn" onClick={pickDir}>
              Escolher…
            </button>
          </div>
          <small className="muted">
            Onde os jogos são instalados. Jogos já instalados não são movidos. Atual: {ctx.state.gamesDir}
          </small>
        </label>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

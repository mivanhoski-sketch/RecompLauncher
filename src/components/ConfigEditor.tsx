import { useEffect, useState } from "react";
import type { Ctx } from "../App";
import type { Game } from "../types";
import { api, errorText } from "../api";

/** Editor simples para os arquivos de configuração (ini, toml, json...) que o port cria na pasta dele. */
export function ConfigEditor({ game, ctx, onClose }: { game: Game; ctx: Ctx; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");

  useEffect(() => {
    api
      .listConfigFiles(game.id)
      .then((f) => {
        setFiles(f);
        if (f.length) select(f[0]);
      })
      .catch((e) => ctx.toast("error", errorText(e)));
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = async (path: string) => {
    try {
      const contents = (await api.readGameFile(game.id, path)) ?? "";
      setCurrent(path);
      setText(contents);
      setOriginal(contents);
    } catch (e) {
      ctx.toast("error", errorText(e));
    }
  };

  const save = async () => {
    if (!current) return;
    try {
      await api.writeGameFile(game.id, current, text);
      setOriginal(text);
      ctx.toast("success", `${current} salvo.`);
    } catch (e) {
      ctx.toast("error", errorText(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Configurações · {game.title}</h2>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </header>
        {files === null ? (
          <div className="muted">Procurando arquivos…</div>
        ) : files.length === 0 ? (
          <div className="muted">
            Nenhum arquivo de configuração encontrado. Muitos ports só criam esse arquivo depois da primeira execução,
            e alguns guardam as opções no menu do próprio jogo.
          </div>
        ) : (
          <div className="config-layout">
            <div className="config-files">
              {files.map((f) => (
                <button key={f} className={`nav-item ${f === current ? "active" : ""}`} onClick={() => select(f)}>
                  <span className="nav-label">{f}</span>
                </button>
              ))}
            </div>
            <div className="config-editor">
              <textarea spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="modal-actions">
                <span className="muted small">Feche o jogo antes de salvar, senão ele pode sobrescrever o arquivo.</span>
                <button className="btn" disabled={text === original} onClick={() => setText(original)}>
                  Desfazer
                </button>
                <button className="btn primary" disabled={text === original} onClick={save}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

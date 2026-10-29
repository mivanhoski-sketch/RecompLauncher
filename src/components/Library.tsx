import type { Ctx } from "../App";
import type { Game } from "../types";
import { gameStatus } from "../status";
import { Cover } from "./Cover";

interface Props {
  title: string;
  games: Game[];
  ctx: Ctx;
  search: string;
  onSearch: (q: string) => void;
  onOpen: (id: string) => void;
  onReload: () => void;
  reloading: boolean;
}

const SOURCE_LABEL = { remote: "catálogo online", cache: "catálogo salvo (offline)", bundled: "catálogo embutido" };

export function Library({ title, games, ctx, search, onSearch, onOpen, onReload, reloading }: Props) {
  const platforms = ctx.catalog.catalog.platforms;
  return (
    <div className="library">
      <header className="topbar">
        <div>
          <h1>{title}</h1>
          <span className="muted small">
            {games.length} {games.length === 1 ? "jogo" : "jogos"} · {SOURCE_LABEL[ctx.catalog.source]}
          </span>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder="Buscar jogo…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <button className="btn" onClick={onReload} disabled={reloading} title="Baixar o catálogo de novo">
            {reloading ? "Atualizando…" : "↻ Atualizar catálogo"}
          </button>
        </div>
      </header>

      {games.length === 0 ? (
        <div className="empty">Nenhum jogo encontrado.</div>
      ) : (
        <div className="grid">
          {games.map((g) => {
            const s = gameStatus(g, ctx);
            const platform = platforms[g.platform];
            return (
              <button key={g.id} className="card" onClick={() => onOpen(g.id)}>
                <Cover game={g} platform={platform} />
                <div className="card-badges">
                  {s.busy || s.building ? (
                    <span className="badge busy">{s.building ? "Compilando" : "Instalando"}</span>
                  ) : s.updateAvailable ? (
                    <span className="badge update">Atualização</span>
                  ) : s.installed && s.next !== "play" ? (
                    <span className="badge warn">Configurar</span>
                  ) : s.installed ? (
                    <span className="badge ok">Instalado</span>
                  ) : null}
                </div>
                {s.busy && s.progressRatio !== undefined && (
                  <div className="card-progress">
                    <div style={{ width: `${Math.round(s.progressRatio * 100)}%` }} />
                  </div>
                )}
                <div className="card-info">
                  <div className="card-title">{g.title}</div>
                  <div className="card-meta">
                    <span className="dot" style={{ background: platform?.color }} />
                    {platform?.name ?? g.platform}
                    {g.year ? ` · ${g.year}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

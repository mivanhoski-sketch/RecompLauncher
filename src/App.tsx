import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, errorText } from "./api";
import type { AppState, BuildFinished, CatalogResult, Game, Progress, Release } from "./types";
import { Library } from "./components/Library";
import { GameDetail } from "./components/GameDetail";
import { SettingsDialog } from "./components/SettingsDialog";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

/** Tudo que as telas precisam para ler e alterar o estado do launcher. */
export interface Ctx {
  state: AppState;
  catalog: CatalogResult;
  releases: Record<string, Release | { error: string }>;
  progress: Record<string, Progress>;
  building: Set<string>;
  busy: Set<string>;
  fetchRelease: (game: Game, force?: boolean) => void;
  install: (game: Game) => void;
  uninstall: (game: Game) => void;
  chooseGameFiles: (game: Game, source: string) => void;
  build: (game: Game) => void;
  play: (game: Game) => void;
  refresh: () => Promise<void>;
  toast: (kind: Toast["kind"], text: string) => void;
}

export type Filter = { platform: string | null; installedOnly: boolean };

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [releases, setReleases] = useState<Ctx["releases"]>({});
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [building, setBuilding] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ platform: null, installedOnly: false });
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const releaseRequests = useRef(new Set<string>());

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4500);
  }, []);

  const refresh = useCallback(async () => setState(await api.getState()), []);

  const fetchRelease = useCallback((game: Game, force = false) => {
    if (!force && releaseRequests.current.has(game.id)) return;
    releaseRequests.current.add(game.id);
    api
      .latestRelease(game.repo)
      .then((r) => setReleases((all) => ({ ...all, [game.id]: r })))
      .catch((e) => setReleases((all) => ({ ...all, [game.id]: { error: errorText(e) } })));
  }, []);

  const loadAll = useCallback(async () => {
    setReloading(true);
    try {
      const [s, c] = await Promise.all([api.getState(), api.loadCatalog()]);
      setState(s);
      setCatalog(c);
      setLoadError(null);
      if (c.error) toast("error", `Não foi possível baixar o catálogo (${c.error}). Usando a cópia local.`);
      // Só consulta o GitHub para os jogos instalados, por causa do limite de 60 consultas/hora.
      for (const g of c.catalog.games) if (s.installed[g.id]) fetchRelease(g, true);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setReloading(false);
    }
  }, [fetchRelease, toast]);

  useEffect(() => {
    loadAll();
    const unlisten = [
      listen<Progress>("progress", (e) => setProgress((p) => ({ ...p, [e.payload.id]: e.payload }))),
      listen<BuildFinished>("build-finished", (e) => {
        setBuilding((b) => {
          const n = new Set(b);
          n.delete(e.payload.id);
          return n;
        });
        toast(e.payload.success ? "success" : "error", e.payload.message);
        refresh();
      }),
    ];
    return () => unlisten.forEach((p) => p.then((f) => f()));
  }, [loadAll, refresh, toast]);

  /** Marca o jogo como ocupado enquanto a tarefa roda e mostra o erro, se houver. */
  const withBusy = useCallback(
    async (id: string, task: () => Promise<unknown>, success?: string) => {
      setBusy((b) => new Set(b).add(id));
      try {
        await task();
        if (success) toast("success", success);
      } catch (e) {
        toast("error", errorText(e));
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(id);
          return n;
        });
        setProgress((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
        await refresh();
      }
    },
    [refresh, toast],
  );

  const ctx: Ctx | null =
    state && catalog
      ? {
          state,
          catalog,
          releases,
          progress,
          building,
          busy,
          fetchRelease,
          refresh,
          toast,
          install: (g) =>
            withBusy(
              g.id,
              async () => {
                await api.installGame(g.id, g.repo, g.asset);
                fetchRelease(g, true);
              },
              state.installed[g.id] ? `${g.title} atualizado!` : `${g.title} instalado!`,
            ),
          uninstall: (g) => withBusy(g.id, () => api.uninstallGame(g.id), `${g.title} desinstalado.`),
          chooseGameFiles: (g, source) =>
            withBusy(g.id, () => api.setGameFiles(g.id, source, g.gameFiles?.copyTo), "Arquivos do jogo configurados."),
          build: (g) => {
            if (!g.build) return;
            const b = g.build;
            api
              .buildGame(g.id, b.command, b.args ?? [], b.produces)
              .then(() => {
                setBuilding((s) => new Set(s).add(g.id));
                toast("info", "Compilação iniciada na janela do console. Não feche aquela janela.");
              })
              .catch((e) => toast("error", errorText(e)));
          },
          play: (g) => api.launchGame(g.id, g.exe, g.args ?? []).catch((e) => toast("error", errorText(e))),
        }
      : null;

  const games = useMemo(() => {
    if (!catalog || !state) return [];
    const q = search.trim().toLowerCase();
    return catalog.catalog.games
      .filter((g) => !filter.platform || g.platform === filter.platform)
      .filter((g) => !filter.installedOnly || state.installed[g.id])
      .filter((g) => !q || g.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [catalog, state, filter, search]);

  if (loadError)
    return (
      <div className="splash">
        <p>Não foi possível carregar o launcher.</p>
        <code>{loadError}</code>
        <button className="btn primary" onClick={loadAll}>
          Tentar de novo
        </button>
      </div>
    );
  if (!ctx) return <div className="splash">Carregando…</div>;

  const selectedGame = ctx.catalog.catalog.games.find((g) => g.id === selected);
  const platforms = ctx.catalog.catalog.platforms;
  const allGames = ctx.catalog.catalog.games;
  const installedCount = allGames.filter((g) => ctx.state.installed[g.id]).length;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-name">Recomp Launcher</div>
            <div className="brand-sub">ports nativos para PC</div>
          </div>
        </div>

        <nav>
          <div className="nav-title">Biblioteca</div>
          <NavItem
            label="Todos os jogos"
            count={allGames.length}
            active={!filter.platform && !filter.installedOnly}
            onClick={() => {
              setFilter({ platform: null, installedOnly: false });
              setSelected(null);
            }}
          />
          <NavItem
            label="Instalados"
            count={installedCount}
            active={filter.installedOnly}
            onClick={() => {
              setFilter({ platform: null, installedOnly: true });
              setSelected(null);
            }}
          />
          <div className="nav-title">Plataformas</div>
          {Object.entries(platforms).map(([key, p]) => {
            const count = allGames.filter((g) => g.platform === key).length;
            if (!count) return null;
            return (
              <NavItem
                key={key}
                label={p.name}
                color={p.color}
                count={count}
                active={filter.platform === key}
                onClick={() => {
                  setFilter({ platform: key, installedOnly: false });
                  setSelected(null);
                }}
              />
            );
          })}
        </nav>

        <button className="nav-item settings-link" onClick={() => setSettingsOpen(true)}>
          <span className="nav-label">⚙ Configurações</span>
        </button>
      </aside>

      <main className="main">
        {selectedGame ? (
          <GameDetail game={selectedGame} ctx={ctx} onBack={() => setSelected(null)} />
        ) : (
          <Library
            games={games}
            ctx={ctx}
            search={search}
            onSearch={setSearch}
            onOpen={setSelected}
            onReload={loadAll}
            reloading={reloading}
            title={
              filter.installedOnly
                ? "Instalados"
                : filter.platform
                  ? platforms[filter.platform]?.name ?? filter.platform
                  : "Todos os jogos"
            }
          />
        )}
      </main>

      {settingsOpen && (
        <SettingsDialog
          ctx={ctx}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            loadAll();
          }}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function NavItem(props: { label: string; count: number; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button className={`nav-item ${props.active ? "active" : ""}`} onClick={props.onClick}>
      {props.color && <span className="dot" style={{ background: props.color }} />}
      <span className="nav-label">{props.label}</span>
      <span className="nav-count">{props.count}</span>
    </button>
  );
}

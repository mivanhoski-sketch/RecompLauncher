import { useEffect, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Ctx } from "../App";
import type { Game } from "../types";
import { api, errorText } from "../api";
import { gameStatus, type Step } from "../status";
import { Cover } from "./Cover";
import { ConfigEditor } from "./ConfigEditor";
import { Markdown } from "./Markdown";

export function GameDetail({ game, ctx, onBack }: { game: Game; ctx: Ctx; onBack: () => void }) {
  const platform = ctx.catalog.catalog.platforms[game.platform];
  const inst = ctx.state.installed[game.id];
  const s = gameStatus(game, ctx);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => ctx.fetchRelease(game), [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFiles = async (as: "file" | "folder") => {
    const spec = game.gameFiles;
    if (!spec) return;
    const selected = await open(
      as === "folder"
        ? { directory: true, title: spec.label }
        : {
            title: spec.label,
            filters: spec.extensions?.length ? [{ name: "Arquivos do jogo", extensions: spec.extensions }] : [],
          },
    );
    if (typeof selected === "string") ctx.chooseGameFiles(game, selected);
  };

  const uninstall = async () => {
    const ok = await ask(
      `Isso apaga a pasta de ${game.title}, incluindo saves e arquivos copiados para dentro dela. Continuar?`,
      { title: "Desinstalar", kind: "warning", okLabel: "Desinstalar", cancelLabel: "Cancelar" },
    );
    if (ok) ctx.uninstall(game);
  };

  const working = s.busy || s.building;
  const primary: Record<Step, { label: string; run: () => void }> = {
    install: { label: "Instalar", run: () => ctx.install(game) },
    files: {
      label: "Selecionar arquivos do jogo",
      run: () => pickFiles(game.gameFiles?.kind === "folder" ? "folder" : "file"),
    },
    build: { label: game.build?.label ?? "Compilar", run: () => ctx.build(game) },
    play: { label: "▶ Jogar", run: () => ctx.play(game) },
  };

  const steps: { key: Step; title: string; done: boolean; detail?: string }[] = [
    { key: "install", title: "Baixar o port", done: s.installed, detail: inst ? `Versão ${inst.version}` : undefined },
  ];
  if (game.gameFiles)
    steps.push({
      key: "files",
      title: game.gameFiles.label,
      done: s.installed && !s.needsFiles,
      detail: inst?.gameFiles ?? undefined,
    });
  if (game.build)
    steps.push({ key: "build", title: game.build.label ?? "Compilar", done: s.installed && !s.needsBuild, detail: game.build.note });

  return (
    <div className="detail">
      <div className="hero" style={{ ["--accent" as string]: platform?.color ?? "#6b7280" }}>
        {game.cover && <div className="hero-bg" style={{ backgroundImage: `url("${game.cover}")` }} />}
        <div className="hero-content">
          <button className="btn ghost back" onClick={onBack}>
            ← Biblioteca
          </button>
          <div className="hero-row">
            <Cover game={game} platform={platform} className="hero-cover" />
            <div className="hero-text">
              <div className="chip" style={{ borderColor: platform?.color, color: platform?.color }}>
                {platform?.name ?? game.platform}
              </div>
              <h1>{game.title}</h1>
              <div className="muted">
                {game.year ? `${game.year} · ` : ""}
                <a onClick={() => openUrl(`https://github.com/${game.repo}`)}>{game.repo}</a>
              </div>
              {game.description && <p className="desc">{game.description}</p>}

              <div className="actions">
                <button className="btn primary big" disabled={working} onClick={primary[s.next].run}>
                  {s.building ? "Compilando…" : s.busy ? "Aguarde…" : primary[s.next].label}
                </button>
                {s.next === "files" && game.gameFiles?.kind === "any" && (
                  <button className="btn" disabled={working} onClick={() => pickFiles("folder")}>
                    Usar uma pasta
                  </button>
                )}
                {s.updateAvailable && (
                  <button className="btn update" disabled={working} onClick={() => ctx.install(game)}>
                    ⬆ Atualizar para {s.latest?.tag_name}
                  </button>
                )}
                {s.installed && (
                  <>
                    <button className="btn" onClick={() => api.openGameDir(game.id).catch((e) => ctx.toast("error", errorText(e)))}>
                      Abrir pasta
                    </button>
                    <button className="btn" onClick={() => setConfigOpen(true)}>
                      Configurações
                    </button>
                    <button className="btn danger" disabled={working} onClick={uninstall}>
                      Desinstalar
                    </button>
                  </>
                )}
              </div>
              {s.progressText && (
                <div className="progress">
                  <div className="progress-bar">
                    <div style={{ width: `${Math.round((s.progressRatio ?? 0) * 100)}%` }} />
                  </div>
                  <span className="muted small">{s.progressText}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <section className="panel">
          <h2>Preparação</h2>
          <ol className="steps">
            {steps.map((st, i) => (
              <li key={st.key} className={st.done ? "done" : s.next === st.key ? "current" : ""}>
                <span className="step-num">{st.done ? "✓" : i + 1}</span>
                <div>
                  <div className="step-title">{st.title}</div>
                  {st.detail && <div className="muted small break">{st.detail}</div>}
                  {st.key === "files" && st.done && (
                    <button className="link" disabled={working} onClick={() => pickFiles(game.gameFiles?.kind === "folder" ? "folder" : "file")}>
                      Trocar arquivos
                    </button>
                  )}
                  {st.key === "build" && st.done && (
                    <button className="link" disabled={working} onClick={() => ctx.build(game)}>
                      Compilar de novo
                    </button>
                  )}
                </div>
              </li>
            ))}
            <li className={s.next === "play" ? "current" : ""}>
              <span className="step-num">▶</span>
              <div className="step-title">Jogar</div>
            </li>
          </ol>
          {game.gameFiles?.copyTo && (
            <p className="muted small">
              Os arquivos escolhidos são copiados para a pasta <code>{game.gameFiles.copyTo}</code> do jogo.
            </p>
          )}
        </section>

        <section className="panel">
          <h2>
            Novidades {s.latest && <span className="muted">· {s.latest.name || s.latest.tag_name}</span>}
            {s.latest?.prerelease && <span className="badge warn inline">beta</span>}
          </h2>
          {s.releaseError ? (
            <div className="muted">
              Não foi possível consultar o GitHub: {s.releaseError}{" "}
              <button className="link" onClick={() => ctx.fetchRelease(game, true)}>
                Tentar de novo
              </button>
            </div>
          ) : !s.latest ? (
            <div className="muted">Carregando…</div>
          ) : (
            <>
              <div className="muted small">
                {s.latest.published_at && `Publicado em ${new Date(s.latest.published_at).toLocaleDateString("pt-BR")} · `}
                {inst ? `Instalado: ${inst.version}` : "Não instalado"}
              </div>
              <div className="changelog">
                <Markdown text={s.latest.body?.trim() || "Sem notas neste release."} />
              </div>
              <button className="link" onClick={() => openUrl(s.latest!.html_url)}>
                Ver no GitHub
              </button>
            </>
          )}
        </section>

        {(game.requirements?.length || game.notes?.length) && (
          <section className="panel">
            {game.requirements?.length ? (
              <>
                <h2>Requisitos</h2>
                <ul className="list">
                  {game.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {game.notes?.length ? (
              <>
                <h2>Observações</h2>
                <ul className="list">
                  {game.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        )}
      </div>

      {configOpen && <ConfigEditor game={game} ctx={ctx} onClose={() => setConfigOpen(false)} />}
    </div>
  );
}

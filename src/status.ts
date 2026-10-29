import type { Ctx } from "./App";
import type { Game, Release } from "./types";
import { formatBytes } from "./api";

export type Step = "install" | "files" | "build" | "play";

export interface GameStatus {
  installed: boolean;
  latest?: Release;
  releaseError?: string;
  updateAvailable: boolean;
  needsFiles: boolean;
  needsBuild: boolean;
  building: boolean;
  busy: boolean;
  /** Próximo passo que falta para o jogo ficar jogável. */
  next: Step;
  progressText?: string;
  progressRatio?: number;
}

const STAGE_LABEL = {
  release: "Consultando o GitHub…",
  download: "Baixando",
  extract: "Extraindo",
  copy: "Copiando arquivos do jogo",
  done: "Concluído",
};

export function gameStatus(game: Game, ctx: Ctx): GameStatus {
  const inst = ctx.state.installed[game.id];
  const rel = ctx.releases[game.id];
  const latest = rel && "tag_name" in rel ? rel : undefined;
  const releaseError = rel && "error" in rel ? rel.error : undefined;
  const installed = !!inst;
  const needsFiles = installed && !!game.gameFiles && !inst.gameFiles;
  const needsBuild = installed && !!game.build && inst.builtVersion !== inst.version;
  const p = ctx.progress[game.id];

  let progressText: string | undefined;
  let progressRatio: number | undefined;
  if (p && ctx.busy.has(game.id)) {
    progressRatio = p.total ? p.done / p.total : undefined;
    progressText =
      p.stage === "download" || p.stage === "copy"
        ? `${STAGE_LABEL[p.stage]} ${formatBytes(p.done)} de ${formatBytes(p.total)}`
        : p.stage === "extract"
          ? `${STAGE_LABEL.extract} ${p.done}/${p.total} arquivos`
          : STAGE_LABEL[p.stage];
  }

  return {
    installed,
    latest,
    releaseError,
    updateAvailable: installed && !!latest && latest.tag_name !== inst.version,
    needsFiles,
    needsBuild,
    building: ctx.building.has(game.id),
    busy: ctx.busy.has(game.id),
    next: !installed ? "install" : needsFiles ? "files" : needsBuild ? "build" : "play",
    progressText,
    progressRatio,
  };
}

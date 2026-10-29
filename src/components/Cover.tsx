import { useState } from "react";
import type { Game, Platform } from "../types";

/** Capa do jogo; sem imagem (ou se ela falhar), desenha uma capa com o título e a cor da plataforma. */
export function Cover({ game, platform, className }: { game: Game; platform?: Platform; className?: string }) {
  const [failed, setFailed] = useState(false);
  const color = platform?.color ?? "#6b7280";

  if (game.cover && !failed) {
    return (
      <div className={`cover ${className ?? ""}`}>
        <img src={game.cover} alt={game.title} loading="lazy" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div
      className={`cover cover-fallback ${className ?? ""}`}
      style={{ background: `linear-gradient(160deg, ${color} 0%, #15161c 75%)` }}
    >
      <span className="cover-platform">{platform?.name}</span>
      <span className="cover-title">{game.title}</span>
    </div>
  );
}

import type { ReactNode } from "react";

/** Markdown mínimo para notas de release: títulos, listas, **negrito**, `código` e links. Sem HTML cru. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list}</ul>);
    list = [];
  };

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(/^#{1,6}\s+(.*)/);
    const item = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)/);
    if (heading) {
      flush();
      blocks.push(<h4 key={blocks.length}>{inline(heading[1])}</h4>);
    } else if (item) {
      list.push(<li key={list.length}>{inline(item[1])}</li>);
    } else if (line.trim()) {
      flush();
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    } else {
      flush();
    }
  }
  flush();
  return <div className="markdown">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:[^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={m.index}>{m[2]}</code>);
    else out.push(<span key={m.index} className="md-link">{m[3]}</span>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

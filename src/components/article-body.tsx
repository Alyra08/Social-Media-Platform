import type { ReactNode } from "react";

/**
 * Renders article text written in the studio as safe React elements (never raw HTML).
 * Supported: "## " and "### " headings, "- " lists, "> " quotes, blank-line paragraphs,
 * [link text](https://…), **bold** and *italic*.
 */
type Block = { kind: "h2" | "h3" | "p" | "quote"; text: string } | { kind: "ul"; items: string[] };

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith("### ")) {
        flush();
        blocks.push({ kind: "h3", text: l.slice(4) });
      } else if (l.startsWith("## ")) {
        flush();
        blocks.push({ kind: "h2", text: l.slice(3) });
      } else if (/^[-*•] /.test(l)) {
        flush();
        const items = [l.slice(2)];
        while (i + 1 < lines.length && /^[-*•] /.test(lines[i + 1].trim())) items.push(lines[++i].trim().slice(2));
        blocks.push({ kind: "ul", items });
      } else if (l.startsWith("> ")) {
        flush();
        blocks.push({ kind: "quote", text: l.slice(2) });
      } else {
        para.push(l);
      }
    }
    flush();
  }
  return blocks;
}

const INLINE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(
        <a key={n++} href={m[2]} target="_blank" rel="noopener noreferrer nofollow">
          {m[1]}
        </a>,
      );
    } else if (m[3]) out.push(<strong key={n++}>{m[3]}</strong>);
    else if (m[4]) out.push(<em key={n++}>{m[4]}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="article-body">
      {parseBlocks(body).map((b, i) => {
        switch (b.kind) {
          case "h2":
            return (
              <h2 key={i}>
                <Inline text={b.text} />
              </h2>
            );
          case "h3":
            return (
              <h3 key={i}>
                <Inline text={b.text} />
              </h3>
            );
          case "quote":
            return (
              <blockquote key={i}>
                <Inline text={b.text} />
              </blockquote>
            );
          case "ul":
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

/** Plain-text version (for search snippets and meta descriptions). */
export const plainText = (body: string) =>
  body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*•-]+\s/g, "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();

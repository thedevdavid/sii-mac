import { Fragment, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

/**
 * Steam-flavored BBCode renderer.
 *
 * Supports the tag set Steam Workshop descriptions actually use (per
 * https://steamcommunity.com/comment/ForumTopic/formattinghelp): `b`, `i`, `u`,
 * `strike`, `code`, `noparse`, `spoiler`, `quote`, `url`, `h1`/`h2`/`h3`,
 * `list`/`olist`/`*`, `hr`, `img`. Unknown tags pass through verbatim so we
 * don't silently swallow content. URLs open in the user's default browser via
 * the Tauri opener plugin (target=_blank doesn't work in webviews).
 *
 * Implementation note: a hand-rolled recursive parser, not a regex pass —
 * BBCode allows arbitrary nesting and recovery from unmatched tags. We tokenize
 * the input once into `[tag]` / `[/tag]` / text segments, then walk the token
 * stream emitting React nodes. Newlines outside of `code`/`noparse` collapse
 * the same way Steam renders them: blank line = paragraph break, single line =
 * `<br>`.
 */
export function BBCode({ source }: { source: string }) {
  return <Fragment>{renderBBCode(source)}</Fragment>;
}

// --- Parser ---

type Token =
  | { kind: "open"; name: string; arg: string | null; raw: string }
  | { kind: "close"; name: string; raw: string }
  | { kind: "text"; value: string };

const TAG_RE = /\[(\/?)([a-zA-Z][a-zA-Z0-9]*|\*)(?:=("[^"]*"|[^\]]*))?\]/g;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let lastEnd = 0;
  for (const match of input.matchAll(TAG_RE)) {
    const start = match.index ?? 0;
    if (start > lastEnd) {
      tokens.push({ kind: "text", value: input.slice(lastEnd, start) });
    }
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const arg = match[3] ?? null;
    if (closing) {
      tokens.push({ kind: "close", name, raw: match[0] });
    } else {
      tokens.push({ kind: "open", name, arg: stripQuotes(arg), raw: match[0] });
    }
    lastEnd = start + match[0].length;
  }
  if (lastEnd < input.length) {
    tokens.push({ kind: "text", value: input.slice(lastEnd) });
  }
  return tokens;
}

function stripQuotes(s: string | null): string | null {
  if (s == null) return null;
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

const VOID_TAGS = new Set(["hr", "*", "img"]);
const RAW_TAGS = new Set(["code", "noparse"]);
const BLOCK_TAGS = new Set(["h1", "h2", "h3", "quote", "list", "olist", "hr"]);

interface Node {
  type: "text" | "tag";
  // tag fields
  name?: string;
  arg?: string | null;
  children?: Node[];
  // text fields
  value?: string;
}

function parse(tokens: Token[], stop?: string): { nodes: Node[]; consumed: number } {
  const out: Node[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "close") {
      if (stop && t.name === stop) {
        return { nodes: out, consumed: i + 1 };
      }
      // Stray close tag — emit verbatim.
      out.push({ type: "text", value: t.raw });
      i++;
      continue;
    }
    if (t.kind === "text") {
      out.push({ type: "text", value: t.value });
      i++;
      continue;
    }
    // open tag
    if (VOID_TAGS.has(t.name)) {
      out.push({ type: "tag", name: t.name, arg: t.arg, children: [] });
      i++;
      continue;
    }
    if (RAW_TAGS.has(t.name)) {
      // Read raw text until matching close, no nested tag interpretation.
      let raw = "";
      let j = i + 1;
      let found = false;
      while (j < tokens.length) {
        const tj = tokens[j];
        if (tj.kind === "close" && tj.name === t.name) {
          found = true;
          break;
        }
        raw += tj.kind === "text" ? tj.value : tj.raw;
        j++;
      }
      out.push({
        type: "tag",
        name: t.name,
        arg: t.arg,
        children: [{ type: "text", value: raw }],
      });
      i = found ? j + 1 : j;
      continue;
    }
    // Generic open: recurse until matching close
    const sub = parse(tokens.slice(i + 1), t.name);
    out.push({
      type: "tag",
      name: t.name,
      arg: t.arg,
      children: sub.nodes,
    });
    i += 1 + sub.consumed;
  }
  return { nodes: out, consumed: i };
}

// --- Renderer ---

function renderBBCode(source: string): ReactNode {
  if (!source) return null;
  const tokens = tokenize(source);
  const { nodes } = parse(tokens);
  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
      {renderNodes(nodes, /* topLevel */ true)}
    </div>
  );
}

function renderNodes(nodes: Node[], topLevel: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer: ReactNode[] = [];

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    if (topLevel) {
      out.push(
        <p key={`p-${out.length}`} className="whitespace-pre-wrap break-words">
          {buffer}
        </p>,
      );
    } else {
      out.push(
        <Fragment key={`f-${out.length}`}>{buffer}</Fragment>,
      );
    }
    buffer = [];
  };

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "text") {
      const text = n.value ?? "";
      if (topLevel) {
        // Split on blank-line boundaries → separate <p> elements.
        const parts = text.split(/\n[ \t]*\n+/);
        for (let j = 0; j < parts.length; j++) {
          if (parts[j]) buffer.push(<Fragment key={`t-${i}-${j}`}>{parts[j]}</Fragment>);
          if (j < parts.length - 1) flushParagraph();
        }
      } else {
        buffer.push(<Fragment key={`t-${i}`}>{text}</Fragment>);
      }
      continue;
    }
    // tag
    if (n.name && BLOCK_TAGS.has(n.name) && topLevel) {
      flushParagraph();
      out.push(
        <Fragment key={`b-${out.length}`}>
          {renderTag(n, /* topLevel */ false)}
        </Fragment>,
      );
      continue;
    }
    buffer.push(<Fragment key={`x-${i}`}>{renderTag(n, false)}</Fragment>);
  }
  flushParagraph();
  return out;
}

function renderTag(n: Node, _innerTopLevel: boolean): ReactNode {
  const children = renderNodes(n.children ?? [], false);
  switch (n.name) {
    case "b":
      return <strong className="font-semibold text-foreground">{children}</strong>;
    case "i":
      return <em className="italic">{children}</em>;
    case "u":
      return <span className="underline">{children}</span>;
    case "strike":
    case "s":
      return <span className="line-through">{children}</span>;
    case "code":
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
          {children}
        </code>
      );
    case "noparse":
      return <Fragment>{children}</Fragment>;
    case "spoiler":
      // macOS-style: muted box, click-to-reveal would be nice but `<details>`
      // is simpler. Default: render as muted text since most descriptions use
      // it as flavor, not interactive.
      return (
        <span className="rounded bg-foreground/10 px-1 text-foreground/40 hover:text-foreground">
          {children}
        </span>
      );
    case "url": {
      const href = n.arg ?? extractUrlFromText(n.children ?? []);
      if (!href) return <Fragment>{children}</Fragment>;
      return (
        <button
          type="button"
          className="text-info underline-offset-2 hover:underline"
          onClick={async (e) => {
            e.preventDefault();
            try {
              await openUrl(href);
            } catch (err) {
              toast.error(`Could not open link: ${formatError(err)}`);
            }
          }}
        >
          {children}
        </button>
      );
    }
    case "img": {
      const src = extractUrlFromText(n.children ?? []) || n.arg;
      if (!src) return null;
      return (
        <img
          src={src}
          alt=""
          className="my-1 max-h-48 max-w-full rounded border border-border object-contain"
        />
      );
    }
    case "quote":
      return (
        <blockquote className="my-1 rounded-md border-l-2 border-border bg-muted/30 px-2.5 py-1.5 text-foreground/80">
          {n.arg && (
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {n.arg}
            </div>
          )}
          {children}
        </blockquote>
      );
    case "h1":
      return (
        <h2 className="mt-2 mb-1 text-sm font-semibold text-foreground">
          {children}
        </h2>
      );
    case "h2":
      return (
        <h3 className="mt-2 mb-1 text-xs font-semibold text-foreground">
          {children}
        </h3>
      );
    case "h3":
      return (
        <h4 className="mt-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {children}
        </h4>
      );
    case "list":
      return (
        <ul className="my-1 list-disc space-y-0.5 pl-4">
          {renderListItems(n.children ?? [])}
        </ul>
      );
    case "olist":
      return (
        <ol className="my-1 list-decimal space-y-0.5 pl-4">
          {renderListItems(n.children ?? [])}
        </ol>
      );
    case "hr":
      return <hr className="my-2 border-border" />;
    default:
      // Unknown tag — emit verbatim so nothing is silently dropped.
      return (
        <Fragment>
          {`[${n.name}${n.arg ? `=${n.arg}` : ""}]`}
          {children}
          {`[/${n.name}]`}
        </Fragment>
      );
  }
}

function renderListItems(nodes: Node[]): ReactNode[] {
  // BBCode `[*]item` items are siblings, not nested. Split on `[*]` open tags
  // and bundle each run into an `<li>`.
  const items: Node[][] = [];
  let current: Node[] = [];
  for (const n of nodes) {
    if (n.type === "tag" && n.name === "*") {
      if (current.length > 0) items.push(current);
      current = [];
    } else {
      current.push(n);
    }
  }
  if (current.length > 0) items.push(current);
  return items.map((children, i) => (
    <li key={`li-${i}`}>{renderNodes(children, false)}</li>
  ));
}

function extractUrlFromText(nodes: Node[]): string | undefined {
  for (const n of nodes) {
    if (n.type === "text" && n.value) {
      const t = n.value.trim();
      if (/^https?:\/\//.test(t)) return t;
    }
  }
  return undefined;
}

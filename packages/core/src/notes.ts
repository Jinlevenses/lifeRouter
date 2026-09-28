import {
  DOCUMENT_MARK_TYPES,
  DOCUMENT_NODE_TYPES,
  ImageAttrsSchema,
  NOTE_DOCUMENT_MAX_BYTES,
  NoteLinkAttrsSchema,
  type DocumentMark,
  type DocumentNode,
  type LinkTargetType,
  type NoteLink,
} from "@liferoute/contracts";

/**
 * Notes (FR-006, docs/08_notes, review D-28/D-29).
 * - Documents are Tiptap JSON limited to an allowlist of nodes/marks; anything else is rejected.
 * - Backlinks are inline atom nodes: { type: "noteLink", attrs: { targetType, targetId, label } }.
 *   The server re-extracts them on every save and replaces the NoteLink rows.
 * - Search text is derived on the server; clients never send it.
 * - Markdown export renders note links as [label](liferoute://<type>/<id>).
 */
export interface DocIssue {
  path: string;
  message: string;
}

const NODE_TYPES = new Set<string>(DOCUMENT_NODE_TYPES);
const MARK_TYPES = new Set<string>(DOCUMENT_MARK_TYPES);
const SAFE_LINK = /^(https?:\/\/|mailto:|liferoute:\/\/)/i;
const MAX_DEPTH = 40;
const TEXTBLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

export function emptyDocument(): DocumentNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Plain text → document with one paragraph per line (used by Inbox → note conversion). */
export function textToDocument(text: string): DocumentNode {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
}

export function documentByteSize(doc: DocumentNode): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}

/** Structural checks beyond the zod shape: allowlist, attrs, safe hrefs, depth and size. */
export function validateDocument(doc: DocumentNode): DocIssue[] {
  const issues: DocIssue[] = [];
  if (doc.type !== "doc") issues.push({ path: "document", message: "루트 노드는 doc이어야 합니다" });
  if (documentByteSize(doc) > NOTE_DOCUMENT_MAX_BYTES) {
    issues.push({ path: "document", message: "노트가 너무 큽니다 (최대 1MB)" });
    return issues;
  }
  const walk = (node: DocumentNode, path: string, depth: number) => {
    if (depth > MAX_DEPTH) {
      issues.push({ path, message: "문서 중첩이 너무 깊습니다" });
      return;
    }
    if (!NODE_TYPES.has(node.type)) issues.push({ path, message: `허용되지 않는 노드: ${node.type}` });
    if (node.type === "text") {
      if (typeof node.text !== "string" || node.text.length === 0) issues.push({ path, message: "빈 text 노드" });
      for (const [i, mark] of (node.marks ?? []).entries()) checkMark(mark, `${path}.marks[${i}]`, issues);
    } else if (node.marks?.length) {
      issues.push({ path, message: "mark는 text 노드에만 붙을 수 있습니다" });
    }
    if (node.type === "noteLink" && !NoteLinkAttrsSchema.safeParse(node.attrs).success) {
      issues.push({ path, message: "noteLink 속성이 올바르지 않습니다" });
    }
    if (node.type === "image" && !ImageAttrsSchema.safeParse(node.attrs).success) {
      issues.push({ path, message: "image는 attachmentId가 필요합니다" });
    }
    if (node.type === "heading") {
      const level = node.attrs?.level;
      if (typeof level !== "number" || level < 1 || level > 6) issues.push({ path, message: "heading level 1~6" });
    }
    for (const [i, child] of (node.content ?? []).entries()) walk(child, `${path}.content[${i}]`, depth + 1);
  };
  walk(doc, "document", 0);
  return issues;
}

function checkMark(mark: DocumentMark, path: string, issues: DocIssue[]) {
  if (!MARK_TYPES.has(mark.type)) {
    issues.push({ path, message: `허용되지 않는 mark: ${mark.type}` });
    return;
  }
  if (mark.type === "link") {
    const href = mark.attrs?.href;
    if (typeof href !== "string" || !SAFE_LINK.test(href.trim())) {
      issues.push({ path, message: "링크는 http(s)/mailto 주소만 허용됩니다" });
    }
  }
}

function inlineText(node: DocumentNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "noteLink") return String(node.attrs?.label ?? "");
  if (node.type === "image") return "";
  return (node.content ?? []).map(inlineText).join("");
}

/** Search text: one line per text block, joined with newlines. */
export function deriveText(doc: DocumentNode): string {
  const lines: string[] = [];
  const walk = (node: DocumentNode) => {
    if (TEXTBLOCKS.has(node.type)) {
      lines.push(inlineText(node));
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function excerpt(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** Outgoing links of a document, unique by (targetType, targetId); the first label wins. */
export function extractLinks(doc: DocumentNode, sourceNoteId: string): NoteLink[] {
  const seen = new Map<string, NoteLink>();
  const walk = (node: DocumentNode) => {
    if (node.type === "noteLink") {
      const parsed = NoteLinkAttrsSchema.safeParse(node.attrs);
      if (parsed.success) {
        const key = `${parsed.data.targetType}:${parsed.data.targetId}`;
        if (!seen.has(key) && !(parsed.data.targetType === "note" && parsed.data.targetId === sourceNoteId)) {
          seen.set(key, { sourceNoteId, ...parsed.data });
        }
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return [...seen.values()];
}

export function linkHref(targetType: LinkTargetType, targetId: string): string {
  return `liferoute://${targetType}/${targetId}`;
}

/** Normalises tags: trim, drop leading '#', lowercase, dedupe (order kept). */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, "").toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

// ---------------------------------------------------------------- Markdown export

const MD_ESCAPE = /([\\`*_[\]])/g;

function renderInline(nodes: readonly DocumentNode[] | undefined, opts: MarkdownOptions): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type === "noteLink") {
        const a = node.attrs as { targetType: LinkTargetType; targetId: string; label: string };
        return `[${a.label.replace(MD_ESCAPE, "\\$1")}](${linkHref(a.targetType, a.targetId)})`;
      }
      if (node.type === "image") {
        const a = node.attrs as { attachmentId: string; alt?: string };
        return `![${(a.alt ?? "").replace(MD_ESCAPE, "\\$1")}](${opts.attachmentUrl(a.attachmentId)})`;
      }
      if (node.type !== "text") return renderInline(node.content, opts);
      const marks = node.marks ?? [];
      if (marks.length === 0) return (node.text ?? "").replace(MD_ESCAPE, "\\$1");
      // Emphasis markers must hug non-space characters, so keep edge whitespace outside them.
      const [, lead = "", core = "", trail = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text ?? "") ?? [];
      if (core === "") return lead + trail;
      let text = marks.some((m) => m.type === "code") ? `\`${core}\`` : core.replace(MD_ESCAPE, "\\$1");
      if (marks.some((m) => m.type === "bold")) text = `**${text}**`;
      if (marks.some((m) => m.type === "italic")) text = `*${text}*`;
      if (marks.some((m) => m.type === "strike")) text = `~~${text}~~`;
      const link = marks.find((m) => m.type === "link");
      if (link && typeof link.attrs?.href === "string") text = `[${text}](${link.attrs.href})`;
      return lead + text + trail;
    })
    .join("");
}

export interface MarkdownOptions {
  attachmentUrl: (attachmentId: string) => string;
}

function renderBlocks(nodes: readonly DocumentNode[] | undefined, opts: MarkdownOptions, indent = ""): string[] {
  const out: string[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "paragraph":
        out.push(indent + renderInline(node.content, opts));
        break;
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
        out.push(`${indent}${"#".repeat(level)} ${renderInline(node.content, opts)}`);
        break;
      }
      case "bulletList":
      case "orderedList":
      case "taskList":
        (node.content ?? []).forEach((item, i) => {
          const marker =
            node.type === "orderedList"
              ? `${i + 1}.`
              : node.type === "taskList"
                ? `- [${item.attrs?.checked ? "x" : " "}]`
                : "-";
          const [first = "", ...rest] = renderBlocks(item.content, opts, `${indent}  `).filter((l) => l !== "");
          out.push(`${indent}${marker} ${first.trimStart()}`);
          out.push(...rest);
        });
        break;
      case "blockquote":
        out.push(...renderBlocks(node.content, opts).map((l) => `${indent}> ${l}`));
        break;
      case "codeBlock": {
        const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
        out.push(`${indent}\`\`\`${lang}`, ...(node.content ?? []).map((t) => t.text ?? ""), `${indent}\`\`\``);
        break;
      }
      case "horizontalRule":
        out.push(`${indent}---`);
        break;
      case "image":
        out.push(indent + renderInline([node], opts));
        break;
      case "table": {
        const rows = (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) => renderBlocks(cell.content, opts).join(" ").replace(/\|/g, "\\|")),
        );
        if (rows.length === 0) break;
        const width = Math.max(...rows.map((r) => r.length));
        const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
        out.push(`| ${pad(rows[0]!).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`);
        for (const r of rows.slice(1)) out.push(`| ${pad(r).join(" | ")} |`);
        break;
      }
      default:
        out.push(...renderBlocks(node.content, opts, indent));
    }
    if (indent === "") out.push("");
  }
  return out;
}

export function toMarkdown(title: string, doc: DocumentNode, opts: MarkdownOptions): string {
  const body = renderBlocks(doc.content, opts).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return `${title ? `# ${title.replace(/\n/g, " ")}\n\n` : ""}${body}\n`;
}

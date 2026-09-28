import { describe, expect, it } from "vitest";
import type { DocumentNode } from "@liferoute/contracts";
import {
  deriveText,
  extractLinks,
  normalizeTags,
  textToDocument,
  toMarkdown,
  validateDocument,
} from "../src/notes";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ATTACHMENT_ID = "33333333-3333-4333-8333-333333333333";

const doc: DocumentNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "주간 계획" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "관련: " },
        { type: "noteLink", attrs: { targetType: "project", targetId: PROJECT_ID, label: "이사 준비" } },
        { type: "text", text: " 굵게", marks: [{ type: "bold" }] },
      ],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "견적 받기" }] }],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "계약" }] }],
        },
      ],
    },
    { type: "image", attrs: { attachmentId: ATTACHMENT_ID, alt: "영수증" } },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "https://www.nts.go.kr" } }] },
      ],
    },
  ],
};

describe("UNIT-NOTE-001 notes (FR-006)", () => {
  it("accepts allowlisted documents and rejects unsafe or unknown content", () => {
    expect(validateDocument(doc)).toEqual([]);
    const bad: DocumentNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
          ],
        },
        { type: "noteLink", attrs: { targetType: "user", targetId: "nope", label: "" } },
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
      ],
    };
    const issues = validateDocument(bad);
    expect(issues.map((i) => i.message)).toEqual([
      "링크는 http(s)/mailto 주소만 허용됩니다",
      "noteLink 속성이 올바르지 않습니다",
      "image는 attachmentId가 필요합니다",
    ]);
  });

  it("derives search text on the server", () => {
    expect(deriveText(doc)).toBe("주간 계획\n관련: 이사 준비 굵게\n견적 받기\n계약\n링크");
  });

  it("extracts unique note links and ignores self links", () => {
    const withDup: DocumentNode = {
      type: "doc",
      content: [
        ...(doc.content ?? []),
        { type: "noteLink", attrs: { targetType: "project", targetId: PROJECT_ID, label: "다른 라벨" } },
        { type: "noteLink", attrs: { targetType: "note", targetId: NOTE_ID, label: "나 자신" } },
      ],
    };
    expect(extractLinks(withDup, NOTE_ID)).toEqual([
      { sourceNoteId: NOTE_ID, targetType: "project", targetId: PROJECT_ID, label: "이사 준비" },
    ]);
  });

  it("exports portable Markdown", () => {
    const md = toMarkdown("노트", doc, { attachmentUrl: (id) => `attachments/${id}` });
    expect(md).toContain("# 노트");
    expect(md).toContain("## 주간 계획");
    expect(md).toContain(`[이사 준비](liferoute://project/${PROJECT_ID})`);
    expect(md).toContain("**굵게**");
    expect(md).toContain("- [x] 견적 받기");
    expect(md).toContain("- [ ] 계약");
    expect(md).toContain(`![영수증](attachments/${ATTACHMENT_ID})`);
    expect(md).toContain("[링크](https://www.nts.go.kr)");
  });

  it("normalises tags and converts captured text", () => {
    expect(normalizeTags(["#Work", "work", " 가계부 "])).toEqual(["work", "가계부"]);
    expect(deriveText(textToDocument("a\n\nb"))).toBe("a\n\nb");
  });
});

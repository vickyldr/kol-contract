// Word (.docx) engine: template autofill + highlighted modifications.
// Everything runs in the browser — no server, no upload of contract data.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { ContractEdit } from "./types";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ELEMENT_NODE = 1;

function isElement(n: Node): n is Element {
  return n.nodeType === ELEMENT_NODE;
}

// ---------- base64 helpers (for persisting templates) ----------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

// ---------- tag inspection ----------

// Returns the set of {tag} placeholders found in a template's text.
export function inspectTags(bytes: Uint8Array): string[] {
  try {
    const zip = new PizZip(bytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
    });
    const text = doc.getFullText();
    const found = new Set<string>();
    const re = /\{([^{}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.add(m[1].trim());
    }
    return [...found];
  } catch {
    return [];
  }
}

// Plain-text extraction (paragraph per line) for feeding a contract to the AI.
export function extractText(bytes: Uint8Array): string {
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const paras = Array.from(dom.getElementsByTagNameNS(W_NS, "p"));
  return paras
    .map((p) =>
      Array.from(p.getElementsByTagNameNS(W_NS, "t"))
        .map((t) => t.textContent ?? "")
        .join(""),
    )
    .join("\n");
}

// ---------- autofill ----------

// Fills {tag} placeholders. Missing tags render as empty strings rather than
// throwing, so a template that lacks some fields still works.
export function fillTemplate(
  bytes: Uint8Array,
  data: Record<string, string>,
): Uint8Array {
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "uint8array" });
}

// ---------- highlighted modifications ----------

export interface EditResult {
  applied: ContractEdit[];
  unmatched: ContractEdit[];
}

// Applies each edit's find->replace to the contract and highlights the
// replacement text in yellow so it can be screenshotted for the KOL.
export function applyHighlightedEdits(
  bytes: Uint8Array,
  edits: ContractEdit[],
): { out: Uint8Array; result: EditResult } {
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) throw new Error("无法读取 document.xml，文件可能不是有效的 .docx");

  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const applied: ContractEdit[] = [];
  const unmatched: ContractEdit[] = [];

  for (const edit of edits) {
    if (!edit.find.trim()) {
      unmatched.push(edit);
      continue;
    }
    const ok = applyEdit(dom, edit);
    (ok ? applied : unmatched).push(edit);
  }

  const serialized = new XMLSerializer().serializeToString(dom);
  zip.file("word/document.xml", serialized);
  const out = zip.generate({ type: "uint8array" });
  return { out, result: { applied, unmatched } };
}

interface Seg {
  run: Element;
  text: string;
}

// Find `edit.find` inside a single paragraph and rebuild that paragraph's runs
// so the replacement is highlighted. Returns true if a match was applied.
function applyEdit(dom: Document, edit: ContractEdit): boolean {
  const paras = Array.from(dom.getElementsByTagNameNS(W_NS, "p"));
  for (const p of paras) {
    const segs = paragraphSegments(p);
    if (segs.length === 0) continue;
    const full = segs.map((s) => s.text).join("");

    let at = full.indexOf(edit.find);
    let findLen = edit.find.length;
    if (at === -1) {
      // fallback: tolerate differing surrounding whitespace
      const trimmed = edit.find.trim();
      at = trimmed ? full.indexOf(trimmed) : -1;
      findLen = trimmed.length;
      if (at === -1) continue;
    }

    rebuildParagraph(dom, p, segs, at, at + findLen, edit.replace);
    return true;
  }
  return false;
}

// Run-level segments (only runs that carry visible w:t text).
function paragraphSegments(p: Element): Seg[] {
  const segs: Seg[] = [];
  for (const run of Array.from(p.childNodes)) {
    if (!isElement(run)) continue;
    if (run.localName !== "r" || run.namespaceURI !== W_NS) continue;
    const tNodes = Array.from(run.getElementsByTagNameNS(W_NS, "t"));
    if (tNodes.length === 0) continue;
    const text = tNodes.map((t) => t.textContent ?? "").join("");
    segs.push({ run, text });
  }
  return segs;
}

function rebuildParagraph(
  dom: Document,
  p: Element,
  segs: Seg[],
  matchStart: number,
  matchEnd: number,
  replacement: string,
): void {
  // Locate the first and last segments touched by [matchStart, matchEnd).
  let offset = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  const bounds = segs.map((s) => {
    const b = { start: offset, end: offset + s.text.length };
    offset = b.end;
    return b;
  });
  for (let i = 0; i < segs.length; i++) {
    if (firstIdx === -1 && bounds[i].end > matchStart) firstIdx = i;
    if (bounds[i].start < matchEnd) lastIdx = i;
  }
  if (firstIdx === -1) return;

  const firstRun = segs[firstIdx].run;
  const lastRun = segs[lastIdx].run;

  const leadingText = segs[firstIdx].text.slice(0, matchStart - bounds[firstIdx].start);
  const trailingText = segs[lastIdx].text.slice(matchEnd - bounds[lastIdx].start);

  const newNodes: Element[] = [];
  if (leadingText) newNodes.push(makeRun(dom, firstRun, leadingText, false));
  if (replacement) newNodes.push(makeRun(dom, firstRun, replacement, true));
  if (trailingText) newNodes.push(makeRun(dom, lastRun, trailingText, false));

  // Insert new nodes before the first matched run, then drop the matched runs.
  for (const n of newNodes) p.insertBefore(n, firstRun);
  for (let i = firstIdx; i <= lastIdx; i++) {
    const r = segs[i].run;
    if (r.parentNode === p) p.removeChild(r);
  }
}

// Clone a source run, replace its text with `text`, optionally add highlight.
function makeRun(
  dom: Document,
  source: Element,
  text: string,
  highlight: boolean,
): Element {
  const run = source.cloneNode(true) as Element;
  // remove existing text/break children
  for (const child of Array.from(run.childNodes)) {
    if (
      isElement(child) &&
      child.namespaceURI === W_NS &&
      (child.localName === "t" || child.localName === "br" || child.localName === "tab")
    ) {
      run.removeChild(child);
    }
  }

  if (highlight) {
    let rPr = firstChild(run, "rPr");
    if (!rPr) {
      rPr = dom.createElementNS(W_NS, "w:rPr");
      run.insertBefore(rPr, run.firstChild);
    }
    // yellow highlight + red text => very visible in a screenshot
    let hl = firstChild(rPr, "highlight");
    if (!hl) {
      hl = dom.createElementNS(W_NS, "w:highlight");
      rPr.appendChild(hl);
    }
    hl.setAttributeNS(W_NS, "w:val", "yellow");
  }

  const t = dom.createElementNS(W_NS, "w:t");
  t.setAttributeNS(
    "http://www.w3.org/XML/1998/namespace",
    "xml:space",
    "preserve",
  );
  t.textContent = text;
  run.appendChild(t);
  return run;
}

function firstChild(el: Element, local: string): Element | null {
  for (const c of Array.from(el.childNodes)) {
    if (isElement(c) && c.namespaceURI === W_NS && c.localName === local) return c;
  }
  return null;
}

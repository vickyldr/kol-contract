// Word (.docx) engine: label-based autofill + highlighted modifications.
// Everything runs in the browser — no server, no upload of contract data.

import PizZip from "pizzip";
import type { ContractEdit } from "./types";
import {
  COUNT_ANCHORS,
  PAYMENT_LABEL_PREFIXES,
  PAYMENT_MARKERS,
  PRICE_ANCHORS,
  PRODUCT_TOKEN,
  matchKolField,
  normalizeLabel,
  type KolField,
} from "./labels";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const ELEMENT_NODE = 1;

function isElement(n: Node): n is Element {
  return n.nodeType === ELEMENT_NODE;
}

// ---------- base64 / file helpers ----------

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

export function bytesToBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// ---------- low-level doc handling ----------

interface Doc {
  zip: PizZip;
  dom: Document;
}

function parseDoc(bytes: Uint8Array): Doc {
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) throw new Error("无法读取 document.xml，文件可能不是有效的 .docx");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  return { zip, dom };
}

function serializeDoc({ zip, dom }: Doc): Uint8Array {
  zip.file("word/document.xml", new XMLSerializer().serializeToString(dom));
  return zip.generate({ type: "uint8array" });
}

function paragraphs(dom: Document): Element[] {
  return Array.from(dom.getElementsByTagNameNS(W_NS, "p"));
}

function childTags(parent: Element, local: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (c): c is Element => isElement(c) && c.namespaceURI === W_NS && c.localName === local,
  );
}

function cellText(tc: Element): string {
  return Array.from(tc.getElementsByTagNameNS(W_NS, "t"))
    .map((t) => t.textContent ?? "")
    .join("")
    .trim();
}

// ---------- run-level text replacement (handles split runs) ----------

interface Seg {
  run: Element;
  text: string;
}

function paragraphSegments(p: Element): Seg[] {
  const segs: Seg[] = [];
  for (const run of childTags(p, "r")) {
    const tNodes = Array.from(run.getElementsByTagNameNS(W_NS, "t"));
    if (tNodes.length === 0) continue;
    segs.push({ run, text: tNodes.map((t) => t.textContent ?? "").join("") });
  }
  return segs;
}

function firstChild(el: Element, local: string): Element | null {
  for (const c of Array.from(el.childNodes)) {
    if (isElement(c) && c.namespaceURI === W_NS && c.localName === local) return c;
  }
  return null;
}

function makeRun(dom: Document, source: Element, text: string, highlight: boolean): Element {
  const run = source.cloneNode(true) as Element;
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
    let hl = firstChild(rPr, "highlight");
    if (!hl) {
      hl = dom.createElementNS(W_NS, "w:highlight");
      rPr.appendChild(hl);
    }
    hl.setAttributeNS(W_NS, "w:val", "yellow");
  }
  const t = dom.createElementNS(W_NS, "w:t");
  t.setAttributeNS(XML_NS, "xml:space", "preserve");
  t.textContent = text;
  run.appendChild(t);
  return run;
}

function rebuildParagraph(
  dom: Document,
  p: Element,
  segs: Seg[],
  matchStart: number,
  matchEnd: number,
  replacement: string,
  highlight: boolean,
): void {
  let offset = 0;
  const bounds = segs.map((s) => {
    const b = { start: offset, end: offset + s.text.length };
    offset = b.end;
    return b;
  });
  let firstIdx = -1;
  let lastIdx = -1;
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
  if (replacement) newNodes.push(makeRun(dom, firstRun, replacement, highlight));
  if (trailingText) newNodes.push(makeRun(dom, lastRun, trailingText, false));

  for (const n of newNodes) p.insertBefore(n, firstRun);
  for (let i = firstIdx; i <= lastIdx; i++) {
    const r = segs[i].run;
    if (r.parentNode === p) p.removeChild(r);
  }
}

// Replace `find` with `replace` across paragraphs. Returns number of hits.
function replaceText(
  dom: Document,
  find: string,
  replace: string,
  opts: { highlight?: boolean; all?: boolean } = {},
): number {
  if (!find) return 0;
  let count = 0;
  for (const p of paragraphs(dom)) {
    let guard = 0;
    while (guard++ < 100) {
      const segs = paragraphSegments(p);
      const full = segs.map((s) => s.text).join("");
      const at = full.indexOf(find);
      if (at < 0) break;
      rebuildParagraph(dom, p, segs, at, at + find.length, replace, !!opts.highlight);
      count++;
      if (!opts.all) return count;
    }
  }
  return count;
}

// Fill the first empty 【 】 that follows one of `anchors`. Returns true if filled.
function fillBracketAfter(dom: Document, anchors: string[], value: string): boolean {
  if (!value) return false;
  for (const p of paragraphs(dom)) {
    const segs = paragraphSegments(p);
    const full = segs.map((s) => s.text).join("");
    for (const a of anchors) {
      const ai = full.indexOf(a);
      if (ai < 0) continue;
      const open = full.indexOf("【", ai);
      if (open < 0) continue;
      const close = full.indexOf("】", open);
      if (close < 0) continue;
      if (full.slice(open + 1, close).trim() !== "") continue; // already filled
      rebuildParagraph(dom, p, segs, open + 1, close, value, false);
      return true;
    }
  }
  return false;
}

// ---------- field detection ----------

export interface FillableField {
  kind: "kol" | "payment";
  field: KolField | null; // set when kind === "kol"
  label: string; // raw label text from the template (display)
  key: string; // normalized label, used as the value map key for payment fields
}

function isPaymentLabel(rawLabel: string, normalized: string): boolean {
  if (/[:：]\s*$/.test(rawLabel.trim())) return true;
  return PAYMENT_LABEL_PREFIXES.some((p) => normalized.startsWith(p));
}

// Walk two-column table rows; a row whose first cell has text and second cell is
// empty is a fillable field. Deduped by normalized label (first wins).
export function detectFields(bytes: Uint8Array): FillableField[] {
  const { dom } = parseDoc(bytes);
  const seen = new Set<string>();
  const out: FillableField[] = [];
  for (const tr of Array.from(dom.getElementsByTagNameNS(W_NS, "tr"))) {
    const cells = childTags(tr, "tc");
    if (cells.length !== 2) continue;
    const a = cellText(cells[0]);
    const b = cellText(cells[1]);
    if (!a || b) continue;
    if (a.includes("【")) continue; // price/count cell, handled by anchors
    const na = normalizeLabel(a);
    if (seen.has(na)) continue;
    const field = matchKolField(na);
    if (field) {
      seen.add(na);
      out.push({ kind: "kol", field, label: a, key: na });
    } else if (isPaymentLabel(a, na)) {
      seen.add(na);
      out.push({ kind: "payment", field: null, label: a, key: na });
    }
  }
  return out;
}

// ---------- autofill ----------

export interface FillInput {
  productName?: string;
  method?: string; // bank | paypal | payoneer (for the in-body marker)
  unitPrice?: string;
  videoCount?: string;
  // which Party B account block to fill (own = first, third = second occurrence)
  accountBlock?: "own" | "third";
  kol: Partial<Record<KolField, string>>;
  // payment values keyed by normalized label (matches detectFields key)
  payment: Record<string, string>;
}

export interface FillReport {
  filledLabels: string[];
  productReplaced: number;
  priceFilled: boolean;
  countFilled: boolean;
}

export function fillContract(
  bytes: Uint8Array,
  input: FillInput,
): { out: Uint8Array; report: FillReport } {
  const doc = parseDoc(bytes);
  const { dom } = doc;
  const report: FillReport = {
    filledLabels: [],
    productReplaced: 0,
    priceFilled: false,
    countFilled: false,
  };

  // 1) in-body tokens
  if (input.productName) {
    report.productReplaced = replaceText(dom, PRODUCT_TOKEN, input.productName, {
      all: true,
    });
  }
  if (input.method) {
    const display =
      input.method === "paypal" ? "PayPal" : input.method === "payoneer" ? "Payoneer" : "Bank Transfer";
    for (const marker of PAYMENT_MARKERS) {
      if (replaceText(dom, marker, display, { all: true }) > 0) break;
    }
  }

  // 2) Annex price / video count
  report.priceFilled = fillBracketAfter(dom, PRICE_ANCHORS, input.unitPrice ?? "");
  report.countFilled = fillBracketAfter(dom, COUNT_ANCHORS, input.videoCount ?? "");

  // 3) label → value cells. KOL fields fill the first empty match; payment
  // fields fill the chosen account block (own = 1st occurrence, third = 2nd).
  const seen = new Map<string, number>();
  const targetIdx = input.accountBlock === "third" ? 1 : 0;
  for (const tr of Array.from(dom.getElementsByTagNameNS(W_NS, "tr"))) {
    const cells = childTags(tr, "tc");
    if (cells.length !== 2) continue;
    const a = cellText(cells[0]);
    const b = cellText(cells[1]);
    if (!a || b || a.includes("【")) continue;
    const na = normalizeLabel(a);
    const field = matchKolField(na);
    const isPayment = !field && isPaymentLabel(a, na);
    if (!field && !isPayment) continue;

    const idx = seen.get(na) ?? 0;
    seen.set(na, idx + 1);

    const value = field ? input.kol[field] : input.payment[na];
    if (!value) continue;
    if (field && idx !== 0) continue; // KOL field: first occurrence only
    if (isPayment && idx !== targetIdx) continue; // payment: chosen block only

    fillCell(dom, cells[1], cells[0], value);
    report.filledLabels.push(a);
  }

  return { out: serializeDoc(doc), report };
}

// Put `value` into the value cell, mirroring the label cell's run formatting.
function fillCell(dom: Document, valueCell: Element, labelCell: Element, value: string): void {
  const p = valueCell.getElementsByTagNameNS(W_NS, "p")[0];
  if (!p) return;
  const labelRun = labelCell.getElementsByTagNameNS(W_NS, "r")[0];
  const run = labelRun
    ? makeRun(dom, labelRun, value, false)
    : (() => {
        const r = dom.createElementNS(W_NS, "w:r");
        const t = dom.createElementNS(W_NS, "w:t");
        t.setAttributeNS(XML_NS, "xml:space", "preserve");
        t.textContent = value;
        r.appendChild(t);
        return r;
      })();
  p.appendChild(run);
}

// ---------- plain-text extraction (for AI) ----------

export function extractText(bytes: Uint8Array): string {
  const { dom } = parseDoc(bytes);
  return paragraphs(dom)
    .map((p) =>
      Array.from(p.getElementsByTagNameNS(W_NS, "t"))
        .map((t) => t.textContent ?? "")
        .join(""),
    )
    .join("\n");
}

// ---------- highlighted modifications ----------

export interface EditResult {
  applied: ContractEdit[];
  unmatched: ContractEdit[];
}

export function applyHighlightedEdits(
  bytes: Uint8Array,
  edits: ContractEdit[],
): { out: Uint8Array; result: EditResult } {
  const doc = parseDoc(bytes);
  const applied: ContractEdit[] = [];
  const unmatched: ContractEdit[] = [];
  for (const edit of edits) {
    const find = edit.find.trim();
    if (!find) {
      unmatched.push(edit);
      continue;
    }
    let hit = replaceText(doc.dom, edit.find, edit.replace, { highlight: true });
    if (hit === 0) hit = replaceText(doc.dom, find, edit.replace, { highlight: true });
    (hit > 0 ? applied : unmatched).push(edit);
  }
  return { out: serializeDoc(doc), result: { applied, unmatched } };
}

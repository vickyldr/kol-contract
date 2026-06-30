// "Invisible" pre-submission checks & reminders, distilled from the payment FAQ.
// Soft (non-blocking) hints surfaced next to the generate button so a teammate
// notices issues before sending the contract.

import type { FillableField } from "./docx";
import type { AccountBlock, Lang } from "./types";

export type Level = "error" | "warn" | "info";
export interface Check {
  level: Level;
  text: string;
  // optional file (under public/) the teammate can download from this reminder
  download?: { label: string; file: string };
}

export interface CheckContext {
  method: string; // bank | paypal | payoneer | ""
  lang: Lang;
  accountBlock: AccountBlock;
  kolName: string;
  legalName: string;
  kolCountry: string; // 红人国家/地区
  unitPrice: string;
  videoCount: string;
  prepay: boolean;
  corporate: boolean; // 对公账户 (manual toggle)
  paymentFields: FillableField[]; // detected payment labels for the template
  values: Record<string, string>; // resolved label(normalized) -> value
}

// Our company info for the other side to fill the invoice (对公).
export const COMPANY_INFO =
  "Quvideo (Hong Kong) Limited, Suite 6503, 65/F, Central Plaza, 18 Harbour Road, Wan Chai, Hong Kong";

// OFAC sanctioned countries (China mainland & Hong Kong excluded per policy).
// Each entry: latin aliases (matched on word boundary) + CJK aliases (substring).
const SANCTIONED: { name: string; latin: string[]; cjk: string[] }[] = [
  { name: "Afghanistan", latin: ["afghanistan"], cjk: ["阿富汗"] },
  { name: "Belarus", latin: ["belarus"], cjk: ["白俄罗斯", "白俄"] },
  { name: "Myanmar (Burma)", latin: ["myanmar", "burma"], cjk: ["缅甸"] },
  { name: "Central African Republic", latin: ["central african"], cjk: ["中非"] },
  { name: "Cuba", latin: ["cuba"], cjk: ["古巴"] },
  { name: "DR Congo", latin: ["congo", "drc"], cjk: ["刚果"] },
  { name: "Ethiopia", latin: ["ethiopia"], cjk: ["埃塞俄比亚", "埃塞"] },
  { name: "Iran", latin: ["iran"], cjk: ["伊朗"] },
  { name: "Iraq", latin: ["iraq"], cjk: ["伊拉克"] },
  { name: "Lebanon", latin: ["lebanon"], cjk: ["黎巴嫩"] },
  { name: "Libya", latin: ["libya"], cjk: ["利比亚"] },
  { name: "Mali", latin: ["mali"], cjk: ["马里"] },
  { name: "Nicaragua", latin: ["nicaragua"], cjk: ["尼加拉瓜"] },
  { name: "North Korea (DPRK)", latin: ["north korea", "dprk"], cjk: ["朝鲜", "北韩"] },
  { name: "Russia", latin: ["russia"], cjk: ["俄罗斯", "俄国"] },
  { name: "Somalia", latin: ["somalia"], cjk: ["索马里"] },
  { name: "South Sudan", latin: ["south sudan"], cjk: ["南苏丹"] },
  { name: "Sudan", latin: ["sudan"], cjk: ["苏丹"] },
  { name: "Syria", latin: ["syria"], cjk: ["叙利亚"] },
  { name: "Venezuela", latin: ["venezuela"], cjk: ["委内瑞拉"] },
  { name: "Yemen", latin: ["yemen"], cjk: ["也门"] },
  // Western Balkans (Balkans-related sanctions program)
  { name: "Serbia", latin: ["serbia"], cjk: ["塞尔维亚"] },
  { name: "Bosnia and Herzegovina", latin: ["bosnia", "herzegovina"], cjk: ["波斯尼亚", "波黑"] },
  { name: "Kosovo", latin: ["kosovo"], cjk: ["科索沃"] },
  { name: "Montenegro", latin: ["montenegro"], cjk: ["黑山"] },
  { name: "North Macedonia", latin: ["macedonia"], cjk: ["马其顿"] },
  { name: "Albania", latin: ["albania"], cjk: ["阿尔巴尼亚"] },
];

// Currencies PayPal can receive (per FAQ).
const PAYPAL_CURRENCIES = ["USD", "EUR", "GBP", "HKD", "TWD", "JPY"];

// Legal-entity markers used to flag a likely corporate (对公) account.
const COMPANY_KEYWORDS = [
  "ltd",
  "limited",
  "llc",
  "l.l.c",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co.",
  "company",
  "gmbh",
  "s.a",
  "s.l",
  "pte",
  "pty",
  "b.v",
  "有限公司",
  "株式会社",
  "有限会社",
  "주식회사",
  "(주)",
];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CURRENCY_TABLE: { code: string; pats: RegExp }[] = [
  { code: "USD", pats: /\b(usd|us\$|dollar)\b|美金|美元|\$/i },
  { code: "EUR", pats: /\b(eur|euro)\b|欧元|€/i },
  { code: "GBP", pats: /\b(gbp|pound)\b|英镑|£/i },
  { code: "HKD", pats: /\b(hkd|hk\$)\b|港币|港元/i },
  { code: "TWD", pats: /\b(twd|nt\$)\b|台币|新台币|臺幣/i },
  { code: "JPY", pats: /\b(jpy)\b|日元|日圆|円|¥/i },
  { code: "KRW", pats: /\b(krw)\b|韩币|韩元|원|₩/i },
  { code: "CNY", pats: /\b(cny|rmb)\b|人民币/i },
];

function get(ctx: CheckContext, key: string): string {
  return (ctx.values[key] ?? "").trim();
}
function amount(s: string): number | null {
  const m = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}
function hasNonAscii(s: string): boolean {
  return /[^\x00-\x7f]/.test(s);
}
function detectCurrency(s: string): string | null {
  for (const c of CURRENCY_TABLE) if (c.pats.test(s)) return c.code;
  return null;
}
function matchSanctioned(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  for (const c of SANCTIONED) {
    if (c.latin.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(v)))
      return c.name;
    if (c.cjk.some((a) => value.includes(a))) return c.name;
  }
  return null;
}
function looksCorporate(name: string): boolean {
  const v = name.toLowerCase();
  return COMPANY_KEYWORDS.some((k) => v.includes(k));
}

export function runChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  const { method } = ctx;
  const has = (key: string) => ctx.paymentFields.some((f) => f.key === key);

  // ---- OFAC sanctioned country (highest priority) ----
  const countryCandidates = [ctx.kolCountry, get(ctx, "country of bank account")];
  for (const cand of countryCandidates) {
    const hit = matchSanctioned(cand);
    if (hit) {
      out.push({
        level: "error",
        text: `「${hit}」在 OFAC 制裁名单上（仅中国大陆 / 中国香港除外），原则上不能合作。请勿承诺，先与 TL 确认。`,
      });
      break;
    }
  }

  // ---- PayPal ----
  if (method === "paypal") {
    const email = get(ctx, "paypal account email");
    if (email && !EMAIL.test(email))
      out.push({ level: "error", text: "PayPal 账号必须是邮箱格式（不支持 PayPal ID / paypal.me 链接 / 手机号）。" });
    const ccy = detectCurrency(get(ctx, "account type") + " " + ctx.unitPrice);
    if (ccy && !PAYPAL_CURRENCIES.includes(ccy))
      out.push({
        level: "warn",
        text: `PayPal 不支持 ${ccy} 收款（仅支持 美金/欧元/英镑/港币/台币/日元）。请改用银行或确认币种。`,
      });
  }

  // ---- Payoneer ----
  if (method === "payoneer") {
    if (ctx.prepay)
      out.push({ level: "error", text: "Payoneer 不支持追回款项，不能预付款。请取消预付或更换支付方式。" });
    const email = get(ctx, "payponeer account email");
    if (email && !EMAIL.test(email))
      out.push({ level: "error", text: "Payoneer 账号必须是邮箱格式，请确认。" });
    const amt = amount(ctx.unitPrice);
    const vids = amount(ctx.videoCount);
    if (amt !== null && vids !== null && amt * vids < 50)
      out.push({ level: "warn", text: "Payoneer 单笔少于 50 美金不能发（建议合并 2–3 个视频或换方式）。" });
  }

  // ---- Bank ----
  if (method === "bank") {
    if (ctx.prepay)
      out.push({ level: "warn", text: "银行转账不建议预付款（无法追回、且每笔约 15 美金手续费）。" });
    const amt = amount(ctx.unitPrice);
    const vids = amount(ctx.videoCount);
    if (amt !== null && vids !== null && amt * vids < 50)
      out.push({ level: "warn", text: "银行转账单笔金额较小（<50 美金），手续费约 15 美金，容易不划算甚至失败，建议优先 PayPal。" });

    // Taiwan bank can only receive USD
    const region = (ctx.kolCountry + " " + get(ctx, "country of bank account")).toLowerCase();
    if (/taiwan|台湾|臺灣/.test(region)) {
      const ccy = detectCurrency(get(ctx, "account type") + " " + ctx.unitPrice);
      if (ccy && ccy !== "USD")
        out.push({
          level: "warn",
          text: "台湾银行只能收美金（不能收台币）。请把账户币种与合同价格都改成 USD。",
        });
      else if (!ccy)
        out.push({ level: "info", text: "台湾银行只能收美金，请确认账户币种与合同价格为 USD。" });
    }

    // completeness: every detected bank field should be filled (no blanks)
    const missing = ctx.paymentFields
      .filter((f) => !get(ctx, f.key))
      .map((f) => f.label.replace(/\s+/g, " ").trim());
    if (missing.length)
      out.push({
        level: "warn",
        text: "银行信息不完整，每一项都不能空：" + missing.slice(0, 8).join("、") + (missing.length > 8 ? "…" : ""),
      });

    // SWIFT/BIC format
    const swift = get(ctx, "swift code/ bic");
    if (swift && !/^[A-Za-z0-9]{8}$|^[A-Za-z0-9]{11}$/.test(swift.replace(/\s/g, "")))
      out.push({ level: "warn", text: "SWIFT/BIC 通常是 8 或 11 位字母数字，请核对（这是能否跨境打款的关键）。" });

    // English-only name for non JP/KR templates
    const payee = get(ctx, "account holder's name");
    if (payee && hasNonAscii(payee) && ctx.lang !== "ja" && ctx.lang !== "ko")
      out.push({
        level: "warn",
        text: "银行户名建议用标准英文字母（台湾/香港/土耳其等不可用本地或特殊字符，如 Köksal→Koksal），否则可能退回。",
      });

    if (ctx.lang === "ja" && has("branch code") && !get(ctx, "branch code"))
      out.push({ level: "info", text: "日本银行必须补到支行（Branch）信息。" });
  }

  // ---- own vs third-party name match ----
  const payeeName =
    method === "paypal"
      ? get(ctx, "paypal name")
      : method === "payoneer"
        ? get(ctx, "payponeer name")
        : get(ctx, "account holder's name");
  const signer = (ctx.legalName || ctx.kolName).trim();
  if (signer && payeeName && ctx.accountBlock === "own" && method === "bank") {
    const a = nameTokens(signer);
    const b = nameTokens(payeeName);
    if (a.length && b.length && !a.some((t) => b.includes(t)))
      out.push({
        level: "warn",
        text: `收款人姓名「${payeeName}」与签约名「${signer}」看起来不是同一人——可能是亲友账户。请确认并切换为「第三方账户 third-party」。`,
      });
  }

  // ---- currency reminder ----
  if (method === "bank" && has("account type") && !get(ctx, "account type"))
    out.push({ level: "info", text: "请填写银行账户币种（Account Type，如 USD），并确认该账户能接受国际汇款。" });

  // ---- 对公账户 (corporate): one combined reminder ----
  const corporateDetected = looksCorporate(payeeName);
  if (ctx.corporate || corporateDetected) {
    const invoiceTpl =
      method === "paypal" || method === "payoneer" ? "invoice-Ocean Look.xlsx" : "invoice-Quvideo.xlsx";
    const lead = corporateDetected && !ctx.corporate ? `对方收款名「${payeeName}」可能是对公账号。` : "";
    out.push({
      level: "warn",
      text:
        `${lead}建议先问红人求证，并建议改用对私账户（更快更方便）。若红人坚持用对公账号，请对方提供：①公司资质证明 ②发票。` +
        `我方需提供开票信息与发票模板 —— 公司信息：${COMPANY_INFO}；本次为 ${method || "（未指定）"} 支付，请用 ${invoiceTpl}（银行→invoice-Quvideo.xlsx，PayPal/Payoneer→invoice-Ocean Look.xlsx）。` +
        `⚠️ 文件不能通过 Instagram 私信发送，一定要发到红人邮箱。`,
      download: { label: `下载发票模板 ${invoiceTpl}`, file: `invoices/${invoiceTpl}` },
    });
  }

  return out;
}

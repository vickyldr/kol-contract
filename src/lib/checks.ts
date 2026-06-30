// "Invisible" pre-submission checks & reminders, distilled from the payment FAQ.
// These are soft (non-blocking) hints surfaced next to the generate button so a
// teammate notices issues before sending the contract for approval.

import type { FillableField } from "./docx";
import type { AccountBlock, Lang } from "./types";

export type Level = "error" | "warn" | "info";
export interface Check {
  level: Level;
  text: string;
}

export interface CheckContext {
  method: string; // bank | paypal | payoneer | ""
  lang: Lang;
  accountBlock: AccountBlock;
  kolName: string;
  legalName: string;
  unitPrice: string;
  videoCount: string;
  prepay: boolean;
  prepayNote: string;
  prepayClause: string;
  paymentFields: FillableField[]; // detected payment labels for the template
  values: Record<string, string>; // resolved label(normalized) -> value
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function get(ctx: CheckContext, key: string): string {
  return (ctx.values[key] ?? "").trim();
}

// detect a money amount (handles "USD 500", "500", "$50.5")
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

export function runChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  const { method } = ctx;
  const has = (key: string) => ctx.paymentFields.some((f) => f.key === key);

  // ---- PayPal ----
  if (method === "paypal") {
    const email = get(ctx, "paypal account email");
    if (email && !EMAIL.test(email))
      out.push({ level: "error", text: "PayPal 账号必须是邮箱格式（不支持 PayPal ID / paypal.me 链接 / 手机号）。" });
    if (/krw|won|원|韩/i.test(get(ctx, "account type") + ctx.unitPrice))
      out.push({ level: "warn", text: "PayPal 不支持韩币（KRW）收款。韩国红人 PayPal 只能收韩币以外不行——请改用银行或确认币种。" });
    out.push({ level: "info", text: "提醒：PayPal 支付在审批里公司名称要写 Ocean Look（其余支付方式是 Quvideo）。" });
  }

  // ---- Payoneer ----
  if (method === "payoneer") {
    if (ctx.prepay)
      out.push({ level: "error", text: "Payoneer 不支持追回款项，不能预付款。请取消预付或更换支付方式。" });
    const email = get(ctx, "payponeer account email");
    if (email && !EMAIL.test(email))
      out.push({ level: "warn", text: "Payoneer 账号一般是邮箱格式，请确认。" });
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

    // completeness: every detected bank field should be filled (no blanks)
    const missing = ctx.paymentFields
      .filter((f) => !get(ctx, f.key))
      .map((f) => f.label.replace(/\s+/g, " ").trim());
    if (missing.length)
      out.push({
        level: "warn",
        text: "银行信息不完整，审批要求每一项都不能空：" + missing.slice(0, 8).join("、") + (missing.length > 8 ? "…" : ""),
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

    if (ctx.lang === "ja" && !get(ctx, "branch code") && has("branch code"))
      out.push({ level: "info", text: "日本银行必须补到支行（Branch）信息。" });
  }

  // ---- own vs third-party name match ----
  const payee =
    method === "paypal"
      ? get(ctx, "paypal name")
      : method === "payoneer"
        ? get(ctx, "payponeer name")
        : get(ctx, "account holder's name");
  const signer = (ctx.legalName || ctx.kolName).trim();
  if (signer && payee && ctx.accountBlock === "own" && method === "bank") {
    const a = nameTokens(signer);
    const b = nameTokens(payee);
    const shared = a.some((t) => b.includes(t));
    if (a.length && b.length && !shared)
      out.push({
        level: "warn",
        text: `收款人姓名「${payee}」与签约名「${signer}」看起来不是同一人——可能是亲友账户。请确认并切换为「第三方账户 third-party」。`,
      });
  }

  // ---- prepay clarity ----
  if (ctx.prepay) {
    if (!ctx.prepayNote && !ctx.prepayClause)
      out.push({ level: "info", text: "预付备注请写清楚：两次支付的时间节点与各付百分之几（审批不能有模糊）。" });
    out.push({ level: "info", text: "审批备注请注明是「预付/尾款」，若本次只付部分视频的钱也要写明。" });
  }

  // ---- currency reminder ----
  if (method === "bank" && has("account type") && !get(ctx, "account type"))
    out.push({ level: "info", text: "请填写银行账户币种（Account Type，如 USD），并确认该账户能接受国际汇款。" });

  // ---- always ----
  out.push({ level: "info", text: "提交前请核对：合同 / 审批 / 收款信息 三处完全一致。" });

  return out;
}

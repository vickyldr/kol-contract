// Field-label dictionary derived from the real Rythmix templates (EN / JA / KO).
// The fill engine matches table label-cells against these to place values, so
// templates need no placeholder editing.

import type { Lang } from "./types";

// Canonical KOL fields shown as fixed inputs in the form. Each maps to the set
// of (normalized) label texts used across the three language templates.
export type KolField =
  | "legalName"
  | "contactAddress"
  | "identityNumber"
  | "email"
  | "socialAccount"
  | "kolLink"
  | "platform";

export const KOL_LABELS: Record<KolField, string[]> = {
  legalName: ["legal name", "法人名", "법인명"],
  contactAddress: ["contact address", "連絡先住所", "연락처 주소"],
  identityNumber: ["identity number", "身分証明書番号", "신분증 번호"],
  email: ["email", "メールアドレス", "이메일"],
  socialAccount: [
    "[tiktok/instagram/youtube/telegram] account",
    "[tiktok/instagram/youtube/telegram]アカウント",
    "[tiktok/instagram/youtube/telegram] 계정",
  ],
  kolLink: ["specify publishing channel/link", "公開チャンネル/リンク", "게시 채널/링크"],
  platform: ["release platform", "公開プラットフォーム", "게시 플랫폼"],
};

export const KOL_FIELD_LABEL_CN: Record<KolField, string> = {
  legalName: "法人姓名",
  contactAddress: "联系地址（可选）",
  identityNumber: "证件号（可选）",
  email: "邮箱（可选）",
  socialAccount: "社媒账号",
  kolLink: "KOL 链接 / 发布频道",
  platform: "发布平台",
};

// Payment labels that should be treated as fillable even though they don't end
// in a colon.
export const PAYMENT_LABEL_PREFIXES = ["account type"];

// In-body product token replaced by the selected product name.
export const PRODUCT_TOKEN = "【Rythmix】";

// In-body payment-method marker variants (typos in the source templates kept on
// purpose so they still match).
export const PAYMENT_MARKERS = [
  "【bank transfer/ paypal / payoneer】",
  "【Paypal / Payoneer / Bank Transfer】",
  "【Paypal / Payoneer / Bnak transfer】",
];

export const METHOD_DISPLAY: Record<string, string> = {
  bank: "Bank Transfer",
  paypal: "PayPal",
  payoneer: "Payoneer",
};

// Anchors that immediately precede the bracket to fill in Annex II / body.
export const PRICE_ANCHORS = [
  "price of each Video is",
  "各動画の価格は",
  "각 영상의 가격은",
];
export const COUNT_ANCHORS = [
  "number of video of this collaboration is",
  "動画の本数は",
  "영상 개수는",
];

export const ACCOUNT_TYPE_KEY = "account type";

// Anchors identifying the default (pay-after-release) "Time of Payment"
// paragraph, swapped for the prepay clause when prepay is selected.
export const PAYMENT_TIME_ANCHORS = [
  "the requirements of Annex I are met, and the Promotional Video has been released",
  "両当事者の確認後にプロモーション動画が公開された後",
  "양 당사자의 확인 후 홍보 영상이 게시된 후",
];

// Default 50/50 prepay clause per language (editable in the UI).
export const PREPAY_CLAUSE_DEFAULT: Record<Lang, string> = {
  en: "An advance payment of 50% shall be paid after a Video or Video script is approved by Party A. The remaining 50% of the cooperation fee will be paid after the requirements are met. Party B shall check and confirm the bill through email. Payment shall be made within 5 working days after Party B’s confirmation of the bill.",
  ja: "甲方が動画または台本を承認した後、提携報酬の50%を前払いとして支払う。残りの50%は要件が満たされた後に支払う。乙方はメールにより請求書を確認・承認するものとする。乙方の請求書確認後5営業日以内に支払いが行われる。",
  ko: "갑이 영상 또는 스크립트를 승인한 후 제휴 수수료의 50%를 선지급한다. 나머지 50%는 요건이 충족된 후 지급한다. 을은 이메일을 통해 청구서를 확인해야 한다. 을의 청구서 확인 후 5영업일 이내에 지급이 이루어진다.",
};

export function normalizeLabel(s: string): string {
  return s
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[:：]\s*$/, "")
    .toLowerCase();
}

// Resolve a normalized label to a canonical KOL field, if any.
export function matchKolField(normalized: string): KolField | null {
  for (const [field, labels] of Object.entries(KOL_LABELS) as [KolField, string[]][]) {
    if (labels.some((l) => normalizeLabel(l) === normalized)) return field;
  }
  return null;
}

export const LANG_INDEX: Record<Lang, number> = { en: 0, ja: 1, ko: 2 };

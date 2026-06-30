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
export const PAYMENT_LABEL_PREFIXES = ["account holder's registered address"];

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

// Anchors that immediately precede the 【 】 to fill in Annex II / body.
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

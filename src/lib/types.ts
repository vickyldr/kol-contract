// Shared types for the KOL contract assistant.

import type { KolField } from "./labels";

export type Lang = "en" | "ko" | "ja";

export const LANG_LABEL: Record<Lang, string> = {
  en: "English 英语",
  ko: "한국어 韩语",
  ja: "日本語 日语",
};

export type PaymentMethod = "bank" | "paypal" | "payoneer";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  bank: "银行转账 Bank",
  paypal: "PayPal",
  payoneer: "Payoneer",
};

// A product (e.g. Rythmix). `contractName` replaces the 【Rythmix】 token in the
// contract body when this product is selected.
export interface Product {
  id: string;
  name: string;
  contractName: string;
  createdAt: number;
}

// A stored Word template. Built-in templates ship with the app (id "builtin:*"
// and are fetched on demand); uploaded ones keep their bytes here as base64.
export interface Template {
  id: string;
  name: string;
  lang: Lang;
  payment: string; // bank | paypal | payoneer | ""
  fileName: string;
  builtin: boolean;
  data?: string; // base64 (uploaded only)
  createdAt: number;
}

export type AccountBlock = "own" | "third";

// Autofill inputs, saved on the record so the filled contract is reproducible.
export interface ContractFields {
  kol: Partial<Record<KolField, string>>;
  unitPrice: string;
  videoCount: string;
  // which Party B account block to fill: own account vs. third-party account
  accountBlock: AccountBlock;
  // bank registered address, split per the template label (streets/cities/state)
  addrStreet: string;
  addrCity: string;
  addrProvince: string;
  // remaining payment values keyed by the template's normalized payment label
  payment: Record<string, string>;
}

export function emptyFields(): ContractFields {
  return {
    kol: {},
    unitPrice: "",
    videoCount: "",
    accountBlock: "own",
    addrStreet: "",
    addrCity: "",
    addrProvince: "",
    payment: {},
  };
}

// ---- modification workflow ----

export type CaseStatus = "draft" | "tl_review" | "kol_reply" | "done";

export interface ContractEdit {
  find: string;
  replace: string;
  note: string;
}

// One round of modification negotiation attached to a record.
export interface ModCase {
  id: string;
  title: string;
  status: CaseStatus;
  createdAt: number;
  updatedAt: number;
  kolOriginal: string;
  tlBriefing: string; // AI: Chinese summary to paste to TL
  tlReply: string;
  kolReply: string; // AI: message in KOL's language
  edits: ContractEdit[];
}

// One record per (KOL + product): holds autofill inputs and modification rounds.
export interface Record_ {
  id: string;
  kolName: string;
  productId: string;
  templateId: string;
  lang: Lang;
  fields: ContractFields;
  mods: ModCase[];
  createdAt: number;
  updatedAt: number;
}

export function newModCase(now: number): ModCase {
  return {
    id: "",
    title: "修改 " + new Date(now).toLocaleDateString("zh-CN"),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    kolOriginal: "",
    tlBriefing: "",
    tlReply: "",
    kolReply: "",
    edits: [],
  };
}

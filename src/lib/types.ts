// Shared types for the KOL contract assistant.

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

// A stored Word template. The file bytes are kept base64-encoded so the whole
// library survives a page reload via localStorage / IndexedDB.
export interface Template {
  id: string;
  name: string;
  lang: Lang;
  fileName: string;
  // base64 of the .docx bytes
  data: string;
  createdAt: number;
}

// Values collected from the autofill form. Keys here become docxtemplater tags,
// e.g. {legalName}. `paymentInfo` is the assembled, method-specific block.
export interface ContractFields {
  legalName: string;
  kolLink: string;
  unitPrice: string;
  videoCount: string;
  platform: string;
  paymentMethod: PaymentMethod;
  // method-specific raw fields
  bank: BankFields;
  paypal: PaypalFields;
  payoneer: PayoneerFields;
  // free extra tags the user may have added to a template: tag -> value
  extra: Record<string, string>;
}

export interface BankFields {
  accountName: string;
  bankName: string;
  accountNumber: string; // or IBAN
  swift: string;
  bankAddress: string;
}

export interface PaypalFields {
  email: string;
  accountName: string;
}

export interface PayoneerFields {
  email: string;
  accountName: string;
  customerId: string;
}

// ---- Advanced modification workflow ----

export type CaseStatus = "draft" | "tl_review" | "kol_reply" | "done";

// One agreed edit to apply to the contract, surfaced from the AI step.
export interface ContractEdit {
  // text to locate in the contract (verbatim original)
  find: string;
  // replacement text (already the final agreed wording)
  replace: string;
  // short note: why / what changed (shown to TL & KOL)
  note: string;
}

export interface ModCase {
  id: string;
  title: string;
  lang: Lang;
  status: CaseStatus;
  createdAt: number;
  updatedAt: number;

  // Step 1: KOL original message + AI summary for TL
  kolOriginal: string;
  tlBriefing: string; // AI: clean Chinese summary to paste to TL

  // Step 2: TL reply + AI message back to KOL
  tlReply: string;
  kolReply: string; // AI: message in KOL's language to paste to KOL

  // Step 5: agreed edits used to generate the highlighted contract
  edits: ContractEdit[];
}

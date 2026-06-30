// Persistence on localStorage. Built-in templates are NOT stored here (they are
// fetched from /public on demand); only products, records, uploaded templates,
// and settings live in storage.

import type { Product, Record_, Template } from "./types";

const PRODUCT_KEY = "kol.products.v1";
const RECORD_KEY = "kol.records.v1";
const UPLOAD_TPL_KEY = "kol.uploadedTemplates.v1";

// LLM settings
const PROVIDER_KEY = "kol.llm.provider";
const ANTHROPIC_KEY = "kol.anthropic.key";
const ANTHROPIC_MODEL = "kol.anthropic.model";
const QWEN_KEY = "kol.qwen.key";
const QWEN_MODEL = "kol.qwen.model";

export type Provider = "qwen" | "anthropic";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
export const DEFAULT_QWEN_MODEL = "qwen-flash";

// Default product list (users can add/edit/remove on the Products page).
const DEFAULT_PRODUCTS = [
  "Rythmix",
  "VivaVideo",
  "AICatch",
  "VivaCut",
  "WiseMeal",
  "Recco",
  "Inspo",
  "AIFlow",
  "Rymo",
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    alert("保存失败：浏览器存储空间可能已满。" + (e as Error).message);
  }
}

export function genId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function loadProducts(): Product[] {
  const existing = read<Product[] | null>(PRODUCT_KEY, null);
  if (existing) return existing;
  // first run: seed the default products
  const seeded: Product[] = DEFAULT_PRODUCTS.map((name) => ({
    id: genId(),
    name,
    contractName: name,
    createdAt: Date.now(),
  }));
  write(PRODUCT_KEY, seeded);
  return seeded;
}
export const saveProducts = (l: Product[]): void => write(PRODUCT_KEY, l);

export const loadRecords = (): Record_[] => read<Record_[]>(RECORD_KEY, []);
export const saveRecords = (l: Record_[]): void => write(RECORD_KEY, l);

export const loadUploadedTemplates = (): Template[] => read<Template[]>(UPLOAD_TPL_KEY, []);
export const saveUploadedTemplates = (l: Template[]): void => write(UPLOAD_TPL_KEY, l);

export const getProvider = (): Provider =>
  (localStorage.getItem(PROVIDER_KEY) as Provider) || "qwen";
export const setProvider = (p: Provider): void => localStorage.setItem(PROVIDER_KEY, p);

// A key baked in at build time via Vercel env vars (VITE_QWEN_KEY /
// VITE_ANTHROPIC_KEY). Lets an admin preconfigure a shared key so teammates
// don't have to enter one. NOTE: this ships in the browser bundle and is
// visible to anyone who can open the site — use only for internal tools, and
// set a spending cap on the key.
export function builtinApiKey(provider: Provider = getProvider()): string {
  const env = import.meta.env;
  return (provider === "qwen" ? env.VITE_QWEN_KEY : env.VITE_ANTHROPIC_KEY) ?? "";
}
// Only the key the user typed locally (used to prefill the Settings input).
export function getStoredApiKey(provider: Provider = getProvider()): string {
  return localStorage.getItem(provider === "qwen" ? QWEN_KEY : ANTHROPIC_KEY) ?? "";
}
// The key actually used for requests: user's own key wins, else the built-in.
export function getApiKey(provider: Provider = getProvider()): string {
  return getStoredApiKey(provider) || builtinApiKey(provider);
}
export function setApiKey(provider: Provider, k: string): void {
  localStorage.setItem(provider === "qwen" ? QWEN_KEY : ANTHROPIC_KEY, k);
}
export function getModel(provider: Provider = getProvider()): string {
  const stored = localStorage.getItem(provider === "qwen" ? QWEN_MODEL : ANTHROPIC_MODEL);
  return stored || (provider === "qwen" ? DEFAULT_QWEN_MODEL : DEFAULT_ANTHROPIC_MODEL);
}
export function setModel(provider: Provider, m: string): void {
  localStorage.setItem(provider === "qwen" ? QWEN_MODEL : ANTHROPIC_MODEL, m);
}

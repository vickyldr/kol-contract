// Persistence on localStorage. Built-in templates are NOT stored here (they are
// fetched from /public on demand); only products, records, uploaded templates,
// and settings live in storage.

import type { Product, Record_, Template } from "./types";

const PRODUCT_KEY = "kol.products.v1";
const RECORD_KEY = "kol.records.v1";
const UPLOAD_TPL_KEY = "kol.uploadedTemplates.v1";
const APIKEY_KEY = "kol.anthropic.key";
const MODEL_KEY = "kol.anthropic.model";

export const DEFAULT_MODEL = "claude-opus-4-8";

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

export const loadProducts = (): Product[] => read<Product[]>(PRODUCT_KEY, []);
export const saveProducts = (l: Product[]): void => write(PRODUCT_KEY, l);

export const loadRecords = (): Record_[] => read<Record_[]>(RECORD_KEY, []);
export const saveRecords = (l: Record_[]): void => write(RECORD_KEY, l);

export const loadUploadedTemplates = (): Template[] => read<Template[]>(UPLOAD_TPL_KEY, []);
export const saveUploadedTemplates = (l: Template[]): void => write(UPLOAD_TPL_KEY, l);

export const getApiKey = (): string => localStorage.getItem(APIKEY_KEY) ?? "";
export const setApiKey = (k: string): void => localStorage.setItem(APIKEY_KEY, k);
export const getModel = (): string => localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL;
export const setModel = (m: string): void => localStorage.setItem(MODEL_KEY, m);

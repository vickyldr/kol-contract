// Lightweight persistence on top of localStorage. Templates can be large
// (a .docx is tens of KB base64), so they live under their own key and we keep
// the API tiny and synchronous to stay simple.

import type { ModCase, Template } from "./types";

const TEMPLATE_KEY = "kol.templates.v1";
const CASE_KEY = "kol.cases.v1";
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
  localStorage.setItem(key, JSON.stringify(value));
}

export function genId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

// ---- Templates ----

export function loadTemplates(): Template[] {
  return read<Template[]>(TEMPLATE_KEY, []);
}

export function saveTemplates(list: Template[]): void {
  write(TEMPLATE_KEY, list);
}

// ---- Cases ----

export function loadCases(): ModCase[] {
  return read<ModCase[]>(CASE_KEY, []);
}

export function saveCases(list: ModCase[]): void {
  write(CASE_KEY, list);
}

// ---- Settings ----

export function getApiKey(): string {
  return localStorage.getItem(APIKEY_KEY) ?? "";
}

export function setApiKey(key: string): void {
  localStorage.setItem(APIKEY_KEY, key);
}

export function getModel(): string {
  return localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL;
}

export function setModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

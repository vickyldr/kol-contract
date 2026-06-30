// Unified template access: built-in templates (shipped in /public/templates,
// described by manifest.json) plus user-uploaded ones (in localStorage).

import { base64ToBytes } from "./docx";
import { loadUploadedTemplates } from "./storage";
import type { Lang, Template } from "./types";

interface ManifestEntry {
  file: string;
  name: string;
  lang: Lang;
  payment: string;
}

const BASE = import.meta.env.BASE_URL ?? "/";
let builtinCache: Template[] | null = null;

export async function loadBuiltins(): Promise<Template[]> {
  if (builtinCache) return builtinCache;
  try {
    const res = await fetch(`${BASE}templates/manifest.json`);
    if (!res.ok) return (builtinCache = []);
    const entries = (await res.json()) as ManifestEntry[];
    builtinCache = entries.map((e) => ({
      id: "builtin:" + e.file,
      name: e.name,
      lang: e.lang,
      payment: e.payment,
      fileName: e.file,
      builtin: true,
      createdAt: 0,
    }));
    return builtinCache;
  } catch {
    return (builtinCache = []);
  }
}

export async function allTemplates(): Promise<Template[]> {
  const builtins = await loadBuiltins();
  return [...builtins, ...loadUploadedTemplates()];
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  return (await allTemplates()).find((t) => t.id === id);
}

export async function getTemplateBytes(id: string): Promise<Uint8Array> {
  if (id.startsWith("builtin:")) {
    const file = id.slice("builtin:".length);
    const res = await fetch(`${BASE}templates/${file}`);
    if (!res.ok) throw new Error("无法加载内置模板：" + file);
    return new Uint8Array(await res.arrayBuffer());
  }
  const tpl = loadUploadedTemplates().find((t) => t.id === id);
  if (!tpl?.data) throw new Error("找不到该模板。");
  return base64ToBytes(tpl.data);
}

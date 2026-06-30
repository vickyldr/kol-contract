/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional admin-provided default API keys, set in Vercel env vars.
  readonly VITE_QWEN_KEY?: string;
  readonly VITE_ANTHROPIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional admin-provided default API keys, set in Vercel env vars.
  readonly VITE_QWEN_KEY?: string;
  readonly VITE_ANTHROPIC_KEY?: string;
  // DashScope endpoint selection to match the key's account.
  readonly VITE_QWEN_REGION?: "cn" | "intl";
  readonly VITE_QWEN_BASE_URL?: string;
  // Optional model override (e.g. qwen-plus for better extraction accuracy).
  readonly VITE_QWEN_MODEL?: string;
  readonly VITE_ANTHROPIC_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

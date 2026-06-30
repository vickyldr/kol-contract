// Browser-direct LLM client supporting Qwen (Alibaba DashScope, OpenAI-compatible
// endpoint) and Anthropic (Claude). The key is provided by the user in Settings
// and stored locally; requests go straight to the provider — no backend.
//
// Qwen uses the international endpoint, which returns CORS headers, so direct
// browser calls work. qwen-flash is the cheap default and is plenty for the
// translation / summarization / find-replace tasks here.

import { getApiKey, getModel, getProvider } from "./storage";
import type { ContractEdit, Lang } from "./types";
import { LANG_LABEL } from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// DashScope has SEPARATE China and International accounts/keys — a key from one
// is rejected (401 invalid_api_key) on the other's endpoint. Pick the endpoint
// to match your key via env vars (default: China 国内百炼). Both support browser
// CORS. VITE_QWEN_BASE_URL fully overrides; VITE_QWEN_REGION = "cn" | "intl".
const QWEN_BASE =
  import.meta.env.VITE_QWEN_BASE_URL ||
  (import.meta.env.VITE_QWEN_REGION === "intl"
    ? "https://dashscope-intl.aliyuncs.com"
    : "https://dashscope.aliyuncs.com");
const QWEN_URL = `${QWEN_BASE}/compatible-mode/v1/chat/completions`;

const TIMEOUT_MS = 300_000;

// fetch with an abort timeout so a hung request fails clearly instead of forever.
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new Error(`请求超时（${TIMEOUT_MS / 60000} 分钟）。可重试，或改用更快的模型。`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callOnce(system: string, user: string, maxTokens: number): Promise<string> {
  const provider = getProvider();
  const key = getApiKey(provider);
  const model = getModel(provider);
  if (!key) throw new Error("AI 服务未配置（请联系管理员在部署环境中设置 API Key）。");

  if (provider === "anthropic") {
    const res = await fetchWithTimeout(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Claude 请求失败 (${res.status})：${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return ((json.content ?? []) as { type: string; text?: string }[])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  }

  // Qwen (OpenAI-compatible)
  const res = await fetchWithTimeout(QWEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Qwen 请求失败 (${res.status})：${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

// One automatic retry on transient network/timeout failures.
async function callLLM(system: string, user: string, maxTokens = 2000): Promise<string> {
  try {
    return await callOnce(system, user, maxTokens);
  } catch (e) {
    const msg = (e as Error).message;
    if (/超时|Failed to fetch|network/i.test(msg)) {
      return await callOnce(system, user, maxTokens);
    }
    throw e;
  }
}

// Pull the first JSON array/object out of a model response, tolerating fences.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error("模型未返回 JSON。");
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return JSON.parse(body.slice(start, end + 1));
}

// Step 1: KOL original message -> clean Chinese briefing to paste to TL.
export async function summarizeForTL(kolOriginal: string, lang: Lang): Promise<string> {
  const system = [
    "你是一名 KOL 商务助理。红人用外语提出了合同修改诉求。",
    "请把红人的原话翻译并整理成一段【中文】内容，方便同学直接复制粘贴发给 TL 判断。",
    "要求：",
    "1) 先用一句话概括红人整体诉求；",
    "2) 然后用「一点一点」的方式列出红人具体想改什么（每条尽量对应合同中的一个条款，如授权时长 / 排他性 / 付款方式 / gift card / 终止权 / 审批权等）；",
    "3) 如能判断，附上红人原话对应的关键词（如 permanent / exclusive / gift / approval / any time / fee），方便在合同里定位；",
    "4) 只整理，不要替 TL 做决定，也不要承诺任何方案。",
    "直接输出整理结果，不要寒暄。",
  ].join("\n");
  const user = `红人原话（${LANG_LABEL[lang]}）：\n"""\n${kolOriginal}\n"""`;
  return callLLM(system, user);
}

// Step 3: TL's decision -> message in the KOL's language to paste back to KOL.
export async function messageForKOL(
  kolOriginal: string,
  tlReply: string,
  lang: Lang,
): Promise<string> {
  const langName = LANG_LABEL[lang];
  const system = [
    "你是一名 KOL 商务助理。TL 已经针对红人的修改诉求给出了内部判断（哪些能改、改成什么样、哪些不能改）。",
    `请把 TL 的判断，转化成一段礼貌、专业、可以直接发给红人的【${langName}】消息。`,
    "要求：",
    "1) 用红人能接受的语气表达：能改的说明会怎么改，不能改的礼貌解释维持原条款；",
    "2) 不要出现 TL、内部、判断之类的内部用词；",
    "3) 不要泄露任何内部底线或议价空间；",
    `4) 整段消息必须使用 ${langName}。`,
    "直接输出可发送给红人的消息正文。",
  ].join("\n");
  const user = `红人原诉求：\n"""\n${kolOriginal}\n"""\n\nTL 的内部判断：\n"""\n${tlReply}\n"""`;
  return callLLM(system, user);
}

// Decide which template to use from the pasted info: language (Japan→ja,
// Korea→ko, else→en), payment method, and bank format (iban/swift).
export interface TemplateHint {
  lang: Lang;
  method: "bank" | "paypal" | "payoneer";
  bankFormat: "iban" | "swift";
}
export async function detectTemplate(rawText: string): Promise<TemplateHint> {
  const system = [
    "根据红人粘贴的收款/合作信息，判断三件事，只输出一个 JSON 对象：",
    '{"lang":"ja|ko|en","method":"bank|paypal|payoneer","bankFormat":"iban|swift"}',
    "【method 最关键，务必按“实际填了哪种”判断，不要只看标题】：",
    "  · 看红人【真正填了具体账号信息】的是哪种：有 IBAN / SWIFT / 银行账号(銀行帳號) / 银行名(銀行名稱/中國信託等) → bank；明确是 PayPal 且给了邮箱 → paypal；明确是 Payoneer → payoneer。",
    "  · 如果同时出现 PayPal 和 银行 两个标题，但只有一种下面真的填了内容（另一种是空标题）→ 选【填了内容的那种】。标签和值可能换行分开。",
    "lang：日本→ja，韩国→ko，其它一律→en。国家若没明说，按文字语言推断：繁体中文/台湾→en，日文→ja，韩文→ko。",
    "bankFormat：银行账号是 IBAN（欧洲/土耳其等）→iban，否则→swift；非银行填 swift。",
    "只输出 JSON，不要解释。",
  ].join("\n");
  const raw = await callLLM(system, `红人信息：\n"""\n${rawText}\n"""`, 200);
  const j = extractJson(raw) as Partial<TemplateHint>;
  return {
    lang: j?.lang === "ja" ? "ja" : j?.lang === "ko" ? "ko" : "en",
    method: j?.method === "bank" ? "bank" : j?.method === "payoneer" ? "payoneer" : "paypal",
    bankFormat: j?.bankFormat === "iban" ? "iban" : "swift",
  };
}

// Extract structured contract fields from a blob of pasted info. `spec` lists
// the fields to look for (key + Chinese description, including the template's
// payment labels). Returns the recognized values plus the fields it couldn't
// find / is unsure about (each with a question to ask the teammate).
export interface ParseSpecItem {
  key: string;
  desc: string;
}
export interface ParseResult {
  values: Record<string, string>;
  missing: { key: string; question: string }[];
}
export async function parseContractInfo(
  rawText: string,
  spec: ParseSpecItem[],
): Promise<ParseResult> {
  const system = [
    "你是严谨的合同信息抽取助手。用户会一股脑粘贴红人给的杂乱信息（多语言、含付款/银行信息，标签和值常常换行分开）。请仔细逐项分析后抽取。",
    "只输出一个 JSON 对象：",
    '{"values": {"<key>": "<值>"}, "missing": [{"key":"<key>","question":"<用中文问同学的一句话>"}]}',
    "—— 严格规则 ——",
    "1) 绝不编造、绝不张冠李戴。每个值都要符合该字段的格式；不确定或找不到就放进 missing，不要硬塞。",
    "2) 格式校验（重要！）：",
    "   · socialAccount / kolLink 必须是社媒链接或 @用户名（含 tiktok/instagram/youtube/t.me 等）；platform 是平台名。",
    "   · 邮箱（含“@”）一眼就不是链接，【绝对不能】把邮箱、银行账号、姓名、地址填进 socialAccount/kolLink/platform。",
    "   · 没有真正的社媒链接时，把 socialAccount、kolLink、platform 都放进 missing（合并成一条问题：“请提供红人的社媒账号或主页链接”）。",
    "   · 邮箱只填到邮箱类字段；账号只填到账号类字段。",
    "3) 跨语言语义对应（字段 key/描述是英文，但红人信息常是中文/繁体/日文/韩文，按含义对应，不要因为语言不同就当作缺失）：",
    "   收款人姓名 / 户名 / 名義 / 口座名義人 / 예금주 / Paypal Name → 账户名义人(account holder) 这类 key；",
    "   银行账号 / 銀行帳號 / 帐号 / 口座番号 / Account No → account number 这类 key；IBAN → iban；",
    "   SWIFT Code / BIC / SWIFTコード → swift 这类 key；银行名 / 銀行名稱(如 中國信託) → bank name；",
    "   收款人地址 / 住所 → 拆成 addrStreet/addrCity/addrProvince；PayPal 邮箱 → paypal account email 这类 key。",
    "4) 只识别【实际填了值】的那种收款方式；若某种方式只有空标题（如只写了“PayPal：”后面没内容），就【不要】去找它的字段，也【不要】把它列进 missing。",
    "5) PayPal/Payoneer 收款：收款人姓名→账户名义人类 key、收款邮箱→账号/邮箱类 key；不要追问 IBAN/SWIFT/银行名等银行字段，也不要追问 kolCountry。仅银行收款才追问银行字段。",
    "6) unitPrice（单价，带币种如 6000 TWD）和 videoCount（视频数量）很重要：找不到必须放进 missing 提醒。",
    "7) kolCountry：原文没明说国家时按文字语言/字体推断——繁体中文→Taiwan，日文→Japan，韩文→Korea，简体中文→China。",
    "8) accountBlock：收款人姓名与签约人/法人姓名明显不是同一人→third，否则 own。",
    "9) 值用原文原始格式，不要翻译人名/账号/地址。missing 的问题主语一律是“红人”，合并同类、尽量少。",
    "只输出 JSON，不要任何解释。",
  ].join("\n");
  const fieldList = spec.map((s) => `- ${s.key}: ${s.desc}`).join("\n");
  const user = `【要抽取的字段】\n${fieldList}\n\n【红人粘贴的原始信息】\n"""\n${rawText}\n"""`;
  const raw = await callLLM(system, user, 1500);
  const parsed = extractJson(raw) as Partial<ParseResult>;
  const values =
    parsed && typeof parsed.values === "object" && parsed.values ? parsed.values : {};
  const missing = Array.isArray(parsed?.missing) ? parsed.missing : [];
  // keep only string values for known keys
  const cleanValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (typeof v === "string" && v.trim()) cleanValues[k] = v.trim();
  return {
    values: cleanValues,
    missing: missing.filter((m): m is { key: string; question: string } => !!m && typeof m.question === "string"),
  };
}

// Convert a Chinese description of a custom prepay arrangement into a contract
// clause in the target language (replaces the "Time of Payment" sentence).
export async function generatePrepayClause(noteChinese: string, lang: Lang): Promise<string> {
  const langName = LANG_LABEL[lang];
  const system = [
    "你是一名合同条款撰写助手。根据中文描述的「分期付款安排」，写出一句正式的合同「付款时间」条款。",
    `条款必须用 ${langName} 书写，且必须明确：每一笔款项的【时间节点】与【百分比】。`,
    "保持与合同其它条款一致的正式语气；结尾保留「乙方通过邮件确认账单后5个工作日内付款」之类的确认与时限说明。",
    "只输出这一句（或两三句）条款正文，不要任何解释、不要引号。",
  ].join("\n");
  const user = `中文分期付款描述：\n"""\n${noteChinese}\n"""`;
  return callLLM(system, user, 600);
}

// Step 5: produce minimal-change find/replace edits for the contract.
export async function proposeEdits(
  contractText: string,
  kolOriginal: string,
  tlReply: string,
): Promise<ContractEdit[]> {
  const system = [
    "你是一名严谨的合同修改助手，遵循「最小改动原则」。",
    "根据红人诉求与 TL 的明确判断，在尽量不改动合同原文的前提下，给出需要修改的地方。",
    "原则：优先「替换局部词句」或「增加限定语」，不要大幅重写整段，也尽量不要删除大段内容。",
    "对 TL 判断为「不能改」的诉求，不要产生任何修改。",
    "你必须只输出一个 JSON 数组，每个元素形如：",
    '{"find": "合同中需要被替换的原文（必须与合同原文逐字一致，且尽量短、能唯一定位）", "replace": "修改后的完整文本", "note": "用中文简要说明改了什么、为什么"}',
    "注意：find 必须是合同里真实存在的连续文字片段（同一段落内），不要包含你猜测的内容。",
    "如果某个诉求无需改动或无法定位，就不要为它生成条目。只输出 JSON 数组，不要任何额外文字。",
  ].join("\n");
  const user = [
    "【合同全文】",
    contractText,
    "",
    "【红人原话】",
    kolOriginal,
    "",
    "【TL 判断】",
    tlReply,
  ].join("\n");
  const raw = await callLLM(system, user, 3000);
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) throw new Error("模型未返回修改列表。");
  return parsed
    .filter((e) => e && typeof e.find === "string" && typeof e.replace === "string")
    .map((e) => ({
      find: e.find,
      replace: e.replace,
      note: typeof e.note === "string" ? e.note : "",
    }));
}

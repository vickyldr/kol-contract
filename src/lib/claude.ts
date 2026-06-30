// Browser-direct Claude API client. The key is provided by the user in Settings
// and stored locally; requests go straight to api.anthropic.com using the
// direct-browser-access header (no backend involved).

import { getApiKey, getModel } from "./storage";
import type { ContractEdit, Lang } from "./types";
import { LANG_LABEL } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";

async function callClaude(system: string, user: string, maxTokens = 2000): Promise<string> {
  const key = getApiKey();
  if (!key) throw new Error("尚未设置 Anthropic API Key，请在「设置」中填写。");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Claude API 请求失败 (${res.status})：${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  const parts = (json.content ?? []) as Array<{ type: string; text?: string }>;
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

// Pull the first JSON object/array out of a model response, tolerating ```json fences.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error("模型未返回 JSON。");
  // find matching end by scanning from the last } or ]
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
  return callClaude(system, user);
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
  return callClaude(system, user);
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
  const raw = await callClaude(system, user, 3000);
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

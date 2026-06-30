// Feishu / Lark group bot — LONG CONNECTION (WebSocket) mode.
// No public URL / HTTPS / nginx needed: the bot dials out to Feishu, receives
// message events, answers from knowledge.md via Qwen, and replies in the chat.
// Just run `node server.js` anywhere with internet.

import * as Lark from "@larksuiteoapi/node-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  FEISHU_APP_ID,
  FEISHU_APP_SECRET,
  FEISHU_DOMAIN = "feishu", // "feishu"(国内) | "lark"(国际)
  QWEN_KEY,
  QWEN_BASE = "https://dashscope.aliyuncs.com", // intl: https://dashscope-intl.aliyuncs.com
  QWEN_MODEL = "qwen-plus",
  HANDOFF_HINT = "我不太确定这个，建议直接找 TL 确认～",
} = process.env;

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !QWEN_KEY) {
  console.error("缺少环境变量：FEISHU_APP_ID / FEISHU_APP_SECRET / QWEN_KEY");
  process.exit(1);
}

const domain = FEISHU_DOMAIN === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu;
const client = new Lark.Client({ appId: FEISHU_APP_ID, appSecret: FEISHU_APP_SECRET, domain });
const wsClient = new Lark.WSClient({ appId: FEISHU_APP_ID, appSecret: FEISHU_APP_SECRET, domain });

// ---- knowledge base (hot-reloaded so edits take effect without restart) ----
let KNOWLEDGE = "";
function loadKnowledge() {
  try {
    KNOWLEDGE = fs.readFileSync(path.join(__dirname, "knowledge.md"), "utf8");
  } catch {
    KNOWLEDGE = "(知识库文件缺失)";
  }
}
loadKnowledge();
setInterval(loadKnowledge, 60_000);

// ---- the brain: answer grounded in the knowledge base ----
async function answer(question) {
  const system = [
    "你是 KOL 商务团队的入职/答疑助理机器人。",
    "只根据下面【团队知识库】回答新人的问题（付款 SOP、合同修改 SOP、合同助手工具用法、入职流程）。",
    "规则：1) 答案简短、可执行、分点，用中文；2) 知识库没覆盖的，明确说『这个我不确定，建议找 TL 确认』，绝不编造；3) 涉及金额/币种/合规/能不能改条款，提醒以 TL 最终确认为准。",
    "",
    "【团队知识库】",
    KNOWLEDGE,
  ].join("\n");
  const res = await fetch(`${QWEN_BASE}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${QWEN_KEY}` },
    body: JSON.stringify({
      model: QWEN_MODEL,
      max_tokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Qwen ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

async function reply(chatId, text) {
  await client.im.message.create({
    params: { receive_id_type: "chat_id" },
    data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) },
  });
}

const seen = new Set(); // de-dupe by message_id
function once(id) {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 5000) seen.clear();
  return true;
}
const cleanText = (raw) => (raw || "").replace(/@_user_\d+/g, " ").replace(/\s+/g, " ").trim();

async function handleMessage(data) {
  const msg = data?.message;
  if (!msg || !once(msg.message_id)) return;
  if (msg.message_type !== "text") return;

  // only answer in private chats, or when @mentioned in a group
  const mentioned = Array.isArray(msg.mentions) && msg.mentions.length > 0;
  if (msg.chat_type === "group" && !mentioned) return;

  let text = "";
  try {
    text = cleanText(JSON.parse(msg.content || "{}").text);
  } catch {
    text = "";
  }
  if (!text) return;

  if (/转人工|人工|找人|找\s*tl/i.test(text)) {
    await reply(msg.chat_id, HANDOFF_HINT);
    return;
  }
  try {
    const a = await answer(text);
    await reply(msg.chat_id, a || HANDOFF_HINT);
  } catch (e) {
    console.error("answer error:", e);
    await reply(msg.chat_id, "（暂时答不了，稍后再试或找 TL）" + String(e).slice(0, 120));
  }
}

const eventDispatcher = new Lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    handleMessage(data).catch((e) => console.error(e));
  },
});

wsClient.start({ eventDispatcher });
console.log(`feishu-bot 已启动（长连接模式）domain=${FEISHU_DOMAIN} model=${QWEN_MODEL}`);

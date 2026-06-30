// Feishu / Lark group bot for the KOL business team.
// Listens for messages (group @mention or direct), answers from knowledge.md via
// Qwen, and replies in the chat. Wrong answers can be corrected by a human, or by
// editing knowledge.md. No database — knowledge lives in one editable file.

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  FEISHU_APP_ID,
  FEISHU_APP_SECRET,
  FEISHU_VERIFICATION_TOKEN, // "Verification Token" from the event-subscription page
  FEISHU_ENCRYPT_KEY, // optional "Encrypt Key" (if you enabled encryption)
  FEISHU_BASE = "https://open.feishu.cn", // Lark intl: https://open.larksuite.com
  QWEN_KEY,
  QWEN_BASE = "https://dashscope.aliyuncs.com", // intl: https://dashscope-intl.aliyuncs.com
  QWEN_MODEL = "qwen-plus",
  HANDOFF_HINT = "我不太确定这个，建议直接找 TL 确认～",
  PORT = 3000,
} = process.env;

// ---- knowledge base (reloaded from disk so edits take effect without redeploy) ----
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

// ---- Feishu encryption (only if you turned on "Encrypt Key") ----
function decrypt(encrypt) {
  const key = crypto.createHash("sha256").update(FEISHU_ENCRYPT_KEY).digest();
  const data = Buffer.from(encrypt, "base64");
  const iv = data.subarray(0, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let out = decipher.update(data.subarray(16));
  out = Buffer.concat([out, decipher.final()]);
  return JSON.parse(out.toString("utf8"));
}

// ---- Feishu tenant access token (cached) ----
let tokenCache = { token: "", exp: 0 };
async function tenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetch(`${FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  const j = await res.json();
  if (!j.tenant_access_token) throw new Error("拿不到 tenant_access_token：" + JSON.stringify(j));
  tokenCache = { token: j.tenant_access_token, exp: Date.now() + (j.expire - 120) * 1000 };
  return tokenCache.token;
}

async function reply(chatId, text) {
  const token = await tenantToken();
  await fetch(`${FEISHU_BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) }),
  });
}

// ---- the brain: answer grounded in the knowledge base ----
async function answer(question) {
  const system = [
    "你是 KOL 商务团队的入职/答疑助理机器人。",
    "只根据下面【团队知识库】回答新人的问题（付款 SOP、合同修改 SOP、合同助手工具用法、入职流程）。",
    "规则：",
    "1) 答案简短、可执行、分点；用中文。",
    "2) 知识库没覆盖的，明确说『这个我不确定，建议找 TL 确认』，绝不编造。",
    "3) 涉及金额 / 币种 / 合规 / 能不能改条款，提醒以 TL 最终确认为准。",
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

// ---- event handling ----
const seen = new Set(); // de-dupe Feishu retries by event_id
function once(id) {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 5000) seen.clear();
  return true;
}

function cleanText(raw) {
  // strip "@_user_N" mention placeholders and surrounding whitespace
  return (raw || "").replace(/@_user_\d+/g, " ").replace(/\s+/g, " ").trim();
}

async function handleMessage(event) {
  const msg = event.message;
  if (!msg || msg.message_type !== "text") return;
  const chatId = msg.chat_id;
  // only answer in private chats, or when the bot is @mentioned in a group
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
    await reply(chatId, HANDOFF_HINT);
    return;
  }

  try {
    const a = await answer(text);
    await reply(chatId, a || HANDOFF_HINT);
  } catch (e) {
    console.error("answer error:", e);
    await reply(chatId, "（暂时答不了，稍后再试或找 TL）" + String(e).slice(0, 120));
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.send("ok"));

app.post("/feishu/event", (req, res) => {
  let body = req.body;
  if (body?.encrypt) body = decrypt(body.encrypt); // encrypted mode

  // URL verification handshake (when you set the request URL in Feishu console)
  if (body?.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // verify it's really from your app
  const token = body?.header?.token ?? body?.token;
  if (FEISHU_VERIFICATION_TOKEN && token !== FEISHU_VERIFICATION_TOKEN) {
    return res.status(401).end();
  }

  // ack immediately, process async (LLM can take a few seconds)
  res.status(200).end();

  const eventId = body?.header?.event_id;
  if (!once(eventId)) return;
  if (body?.header?.event_type === "im.message.receive_v1") {
    handleMessage(body.event).catch((e) => console.error(e));
  }
});

app.listen(PORT, () => console.log(`feishu-bot listening on :${PORT}  model=${QWEN_MODEL}`));

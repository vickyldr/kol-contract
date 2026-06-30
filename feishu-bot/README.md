# KOL 飞书机器人（长连接版）

群里 @它 或私聊提问，它根据 `knowledge.md`（付款 SOP + 改约 SOP + 合同工具用法 + 入职流程）用千问回答；答不准你直接人工补一句即可。**改答案 = 改 `knowledge.md`**（每分钟自动重载，不用重启）。

> **长连接模式**：机器人主动连飞书，**不需要公网域名 / HTTPS / nginx**，在 VPS 甚至自己电脑上 `node` 跑起来就行。

## 跑起来

```bash
cd feishu-bot
npm install
cp .env.example .env   # 填 App ID / App Secret / 千问 Key
node server.js          # 或 pm2 start server.js --name kol-bot
```

看到 `feishu-bot 已启动（长连接模式）` 就成功了。

## 飞书侧配置（一次性，你自己的组织里做，你就是管理员）

1. [飞书开放平台](https://open.feishu.cn/) → 你的自建应用 → **添加「机器人」能力**（已做）。
2. **凭证与基础信息**：复制 **App ID / App Secret** 填进 `.env`。
3. **权限管理** → 搜"消息"，开通：
   - `im:message:send_as_bot`（以机器人身份发消息）
   - `im:message.p2p_msg:readonly`（收私聊消息）
   - `im:message.group_at_msg:readonly`（收群里 @机器人）
4. **事件与回调 → 事件订阅**：
   - 订阅方式选 **「使用长连接接收事件」**（不用填任何 URL）。
   - 添加事件：**接收消息 `im.message.receive_v1`**。
5. **创建版本 → 申请发布**（你是组织管理员，自己审批通过）。
6. 把机器人**拉进群**（外部群也行），群里 **@机器人** 或私聊提问。

> 顺序无所谓，但 `node server.js` 跑着的时候去做第 4 步最直观（长连接会显示已连接）。

## 行为

- 群里只在 **被 @** 时回答；私聊直接回答（避免刷屏）。
- 有人说「人工 / 转人工 / 找 TL」→ 回一句让其找 TL（`.env` 里可改 `HANDOFF_HINT`）。
- 知识库没覆盖的，会说「不确定，建议找 TL」，不瞎编。

## 让它实时读「你飞书里的文档」当知识库（推荐）

不想每次改 `knowledge.md`？可以让机器人**直接读你飞书里的文档**——你在飞书改 SOP，它下次回答就是最新的。

> ⚠️ **硬前提：文档必须和机器人在同一个飞书组织里。**
> 飞书自建应用读不到「别的组织」的文档（跨组织 / user token 都不行），公司组织要开权限得管理员。
> 所以做法是：**在你自己的个人飞书里建一份带教知识库**（你是管理员，随便开权限），把 SOP 整理进去，机器人读这份。

**步骤：**

1. 在你**个人飞书**里建一个**知识库（Wiki）**或几篇云文档，把带教 SOP 写进去。
2. 开放平台 → 你的应用 → **权限管理**，加：
   - `docx:document:readonly`（读云文档内容）
   - `wiki:wiki:readonly`（读知识库目录）
   - 自己审批发布新版本。
3. 打开那个知识库/文档 → **右上角分享 → 添加协作者 → 搜你的机器人应用名 → 给「可阅读」**。（不分享，应用看不到。）
4. 拿到 ID 填进 `.env`：
   - 知识库：链接 `…/wiki/space/【这串数字就是 space_id】` → `FEISHU_WIKI_SPACE_ID=...`
   - 或单篇文档：链接 `…/docx/【这串就是 document_id】` → `FEISHU_DOC_TOKENS=id1,id2`
5. 重启 `node server.js`，看到日志 `已从飞书拉取 N 篇文档` 就成了。默认每 5 分钟自动拉一次最新（`DOC_REFRESH_SECONDS` 可调）。

填了飞书文档后，机器人会**同时**用 `knowledge.md`（放工具用法等固定内容）+ 飞书文档（放你常改的 SOP）。两边都不填飞书时，就只用 `knowledge.md`。

## 切换 / 维护

- **Lark 国际版**：`.env` 设 `FEISHU_DOMAIN=lark`。
- **用 Claude（国内中转）**：填 `RELAY_URL`(中转的 `/v1/chat/completions` 地址) + `RELAY_KEY` + `RELAY_MODEL=claude-sonnet-4-6`，填了就自动优先走它。带教答疑用 Sonnet 足够且更快；要更强改 `claude-opus-4-8`。
- **千问国际站 Key**：`QWEN_BASE=https://dashscope-intl.aliyuncs.com`；模型 `QWEN_MODEL=qwen-plus`(准) 或 `qwen-flash`(更便宜)。
- **改答案 / 教它新东西**：改飞书文档（5 分钟内生效）或 `knowledge.md`（1 分钟内生效）。

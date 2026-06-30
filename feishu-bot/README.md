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

## 让它实时读飞书文档，**不用维护第二份**（推荐）

核心思路：**只留一份正本**——你在公司飞书里照常改 SOP，机器人去读同一份，不存在"改两遍"。

### 方式一·推荐：文档是「公开互联网可见」的

如果你的 SOP 文档已设成 **「互联网上获得链接的人可阅读」**（公开网页），那机器人可以像读普通网页一样直接读它——**不限组织、不需管理员、不需任何应用授权**。你只改公司那一份，机器人就同步。

```bash
npm install
npx playwright install chromium     # 装无头浏览器
# .env 里填： PUBLIC_DOC_URLS=https://xxx.feishu.cn/docx/aaa,https://xxx.feishu.cn/wiki/bbb
node sync-feishu.mjs                 # 或 pm2 start sync-feishu.mjs --name kol-sync
```

它每 5 分钟（`DOC_REFRESH_SECONDS` 可调）渲染这些公开链接、抓正文写进 `knowledge.feishu.md`，机器人 1 分钟内自动加载。**机器人和同步脚本各跑一个进程**（`pm2 start server.js` + `pm2 start sync-feishu.mjs`），同步崩了也不影响答疑。

> 小贴士：把 SOP 里**几篇核心文档**的公开链接填进去即可，不用全填。文档结构变了也无所谓——抓不到正文容器会兜底抓整页可见文字。

### 方式二：文档在你自己飞书里（同组织，应用授权读取）

文档在**机器人所在的同一个飞书组织**（个人飞书，你是管理员）时可用 API 直读：① 应用开 `docx:document:readonly` + `wiki:wiki:readonly`；② 把文档/知识库分享给机器人应用（可阅读协作者）；③ `.env` 填 `FEISHU_WIKI_SPACE_ID` 或 `FEISHU_DOC_TOKENS`。重启看到 `已从飞书拉取 N 篇文档` 即成。

> ⚠️ 跨组织读不了：个人飞书的机器人**读不到公司飞书**的文档（飞书硬规则）。公司文档要么走**方式一**（公开链接），要么找管理员把应用装进公司组织。

不管哪种方式，机器人都会**同时**用 `knowledge.md`（手写的固定内容：工具用法、入职流程）+ 飞书文档（你常改的 SOP）。

## 切换 / 维护

- **Lark 国际版**：`.env` 设 `FEISHU_DOMAIN=lark`。
- **用 Claude（国内中转）**：填 `RELAY_URL`(中转的 `/v1/chat/completions` 地址) + `RELAY_KEY` + `RELAY_MODEL=claude-sonnet-4-6`，填了就自动优先走它。带教答疑用 Sonnet 足够且更快；要更强改 `claude-opus-4-8`。
- **千问国际站 Key**：`QWEN_BASE=https://dashscope-intl.aliyuncs.com`；模型 `QWEN_MODEL=qwen-plus`(准) 或 `qwen-flash`(更便宜)。
- **改答案 / 教它新东西**：改飞书文档（5 分钟内生效）或 `knowledge.md`（1 分钟内生效）。

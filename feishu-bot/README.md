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

## 切换 / 维护

- **Lark 国际版**：`.env` 设 `FEISHU_DOMAIN=lark`。
- **千问国际站 Key**：`QWEN_BASE=https://dashscope-intl.aliyuncs.com`；模型 `QWEN_MODEL=qwen-plus`(准) 或 `qwen-flash`(更便宜)。
- **改答案 / 教它新东西**：编辑 `knowledge.md`，1 分钟内生效。

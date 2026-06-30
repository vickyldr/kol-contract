# KOL 飞书机器人

群里 @它 或私聊提问，它根据 `knowledge.md`（付款 SOP + 改约 SOP + 合同工具用法 + 入职流程）用千问回答；答不准你直接人工补一句即可。**改答案 = 改 `knowledge.md`**（机器人每分钟自动重载，不用重启）。

## 跑起来（上海 VPS，推荐）

```bash
cd feishu-bot
npm install
cp .env.example .env   # 填好里面的值
node server.js          # 或用 pm2: pm2 start server.js --name kol-bot
```

机器人监听 `:3000`，用 nginx 反代并配 HTTPS，对外暴露一个地址，比如
`https://bot.你的域名.com/feishu/event`（飞书事件订阅要用 HTTPS）。

## 飞书侧配置（一次性，你来做）

1. [飞书开放平台](https://open.feishu.cn/) → 创建企业自建应用 → 拿到 **App ID / App Secret**，填进 `.env`。
2. **添加机器人能力**：应用功能 → 机器人 → 启用。
3. **权限**（开通并发布版本）：
   - `im:message`（接收消息）
   - `im:message:send_as_bot`（以应用身份发消息）
4. **事件订阅**：
   - 订阅方式选「将事件发送至开发者服务器」，**请求地址**填 `https://你的域名/feishu/event`。
   - 把页面上的 **Verification Token** 填进 `.env` 的 `FEISHU_VERIFICATION_TOKEN`；若开了加密，把 **Encrypt Key** 填进 `FEISHU_ENCRYPT_KEY`。
   - 添加事件：**接收消息 `im.message.receive_v1`**。
   - 先把 `node server.js` 跑起来，再保存请求地址（飞书会发一次校验，机器人已自动应答）。
5. **发布版本**并通过审核（企业内自建一般秒过）。
6. 把机器人**拉进群**；群里 **@机器人** 提问，或与机器人**私聊**提问。

## 行为

- 群里只在 **被 @** 时回答；私聊直接回答（避免刷屏）。
- 有人说「人工 / 转人工 / 找 TL」→ 回一句让其找 TL（可在 `.env` 改 `HANDOFF_HINT`）。
- 知识库没覆盖的，它会说「不确定，建议找 TL」，不会瞎编。

## 切换环境

- **Lark 国际版**：`FEISHU_BASE=https://open.larksuite.com`。
- **千问国际站 Key**：`QWEN_BASE=https://dashscope-intl.aliyuncs.com`。
- 模型：`QWEN_MODEL=qwen-plus`（默认，准）或 `qwen-flash`（更便宜）。

## 维护

- 新增/纠正答案：编辑 `knowledge.md`，1 分钟内生效。
- 想让它会答新东西（比如新工具、新流程），把要点加进 `knowledge.md` 即可。

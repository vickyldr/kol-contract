# KOL 合同助手

一个纯前端网页工具，帮 KOL 商务同学：

1. **合同填充** —— 选模板、填信息、一键生成合同（英语 / 韩语 / 日语三个版本，付款方式可切换银行 / PayPal / Payoneer）。
2. **合同修改** —— 按内部 SOP 辅助改约：红人原文 → AI 整理给 TL → TL 回复 → AI 翻译给红人 → 一键生成**修改处黄色高亮**的合同，下载后截图给红人。

所有数据只存在你自己的浏览器（`localStorage`），不上传任何服务器。AI 调用直连 Anthropic（需自备 API Key）。

## 运行

```bash
npm install
npm run dev      # 本地开发，浏览器打开终端里给出的地址
npm run build    # 产出静态文件到 dist/，可部署到任意静态托管
npm run preview  # 预览构建结果
```

## 使用说明

### 一、模板管理（先做一次）

到「模板管理」上传 Word 模板。在需要自动填充的位置放占位符，用**花括号**包裹：

| 占位符 | 含义 |
| --- | --- |
| `{legalName}` | 法人姓名 |
| `{kolLink}` | KOL 链接 |
| `{unitPrice}` | 单价 |
| `{videoCount}` | 合作视频数量 |
| `{platform}` | 发布平台 |
| `{paymentInfo}` | 付款信息整块（根据所选支付方式自动生成，**只有这块会随支付方式变化**） |
| `{paymentMethod}` | 支付方式名（bank / paypal / payoneer） |

> 模板里出现的其它自定义占位符（如 `{campaign}`）会被自动识别，并在填充页生成对应输入框。

每种语言各传一份模板（标注语言即可）。

### 二、合同填充

选择模板 → 填写合同信息 → 选择付款方式（银行 / PayPal / Payoneer，只显示对应字段）→ **一键生成并下载**。

### 三、合同修改（对应改约 SOP）

1. **红人原文 → 整理给 TL**：粘贴红人原话，AI 翻译并按「一点一点」整理成中文，可直接复制发 TL。
2. **TL 回复 → 翻译给红人**：粘贴 TL 的判断，AI 生成一段红人语言的礼貌回复，可直接复制发红人。
3. **生成高亮合同**：上传需要修改的合同，AI 按「最小改动原则」给出 `原文 → 修改后` 列表（可手动增删改），确认后一键生成，**所有修改处黄色高亮**，下载后发 TL 复核、截图给红人。

> 每条修改记录都会自动保存，可在左侧列表切换。生成时会报告哪些修改成功定位、哪些未匹配（原文需与合同逐字一致）。

## 设置

到「设置」填入 Anthropic API Key 与模型（默认 `claude-opus-4-8`）。Key 仅存在本浏览器，请求带 `anthropic-dangerous-direct-browser-access` 头直连 Anthropic。

## 技术栈

Vite + React + TypeScript；`pizzip` + `docxtemplater` 做 .docx 读写；高亮通过直接改写 `word/document.xml`、给修改后的文字加 `<w:highlight w:val="yellow"/>` 实现，能正确处理跨多个 run 的文字片段。

import { useState } from "react";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_QWEN_MODEL,
  getApiKey,
  getModel,
  getProvider,
  setApiKey,
  setModel,
  setProvider,
  type Provider,
} from "../lib/storage";

export function Settings() {
  const [provider, setProv] = useState<Provider>(getProvider());
  const [key, setKey] = useState(getApiKey(provider));
  const [model, setModelState] = useState(getModel(provider));
  const [saved, setSaved] = useState(false);

  function switchProvider(p: Provider) {
    setProv(p);
    setKey(getApiKey(p));
    setModelState(getModel(p));
    setSaved(false);
  }

  function save() {
    setProvider(provider);
    setApiKey(provider, key.trim());
    setModel(provider, model.trim() || (provider === "qwen" ? DEFAULT_QWEN_MODEL : DEFAULT_ANTHROPIC_MODEL));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="panel">
      <h2>设置</h2>
      <div className="card">
        <h3>AI 服务商</h3>
        <p className="hint">
          「合同修改」里的翻译 / 总结 / 改约由大模型完成，需要你自己的 API Key。
          Key 只保存在本浏览器（localStorage），请求直连服务商，不经过任何中间服务器。
        </p>

        <div className="seg">
          <button
            className={provider === "qwen" ? "seg-btn active" : "seg-btn"}
            onClick={() => switchProvider("qwen")}
          >
            通义千问 Qwen（便宜，推荐）
          </button>
          <button
            className={provider === "anthropic" ? "seg-btn active" : "seg-btn"}
            onClick={() => switchProvider("anthropic")}
          >
            Claude（Anthropic）
          </button>
        </div>

        {provider === "qwen" ? (
          <p className="hint">
            千问默认用最便宜的 <code>qwen-flash</code>（约 $0.05 / 百万输入 token、$0.40 / 百万输出），
            一次改约（3 次调用）通常不到 1 分钱。Key 在阿里云百炼（Model Studio）控制台获取，
            使用国际站直连，浏览器可直接调用。
          </p>
        ) : (
          <p className="hint">Claude 使用 {DEFAULT_ANTHROPIC_MODEL}，质量更高、价格更贵。</p>
        )}

        <label>
          API Key（{provider === "qwen" ? "通义千问 / 阿里云百炼" : "Anthropic"}）
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={provider === "qwen" ? "sk-..." : "sk-ant-..."}
          />
        </label>
        <label>
          模型
          <input
            value={model}
            onChange={(e) => setModelState(e.target.value)}
            placeholder={provider === "qwen" ? DEFAULT_QWEN_MODEL : DEFAULT_ANTHROPIC_MODEL}
          />
        </label>
        <button className="primary" onClick={save}>
          保存
        </button>
        {saved && <span className="ok"> 已保存 ✓</span>}
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  DEFAULT_MODEL,
  getApiKey,
  getModel,
  setApiKey,
  setModel,
} from "../lib/storage";

export function Settings() {
  const [key, setKey] = useState(getApiKey());
  const [model, setModelState] = useState(getModel());
  const [saved, setSaved] = useState(false);

  function save() {
    setApiKey(key.trim());
    setModel(model.trim() || DEFAULT_MODEL);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="panel">
      <h2>设置</h2>
      <div className="card">
        <h3>Anthropic API</h3>
        <p className="hint">
          「合同修改」里的翻译 / 总结 / 改约由 Claude 完成，需要你自己的 API Key。
          Key 只保存在本浏览器（localStorage），请求直连 Anthropic，不经过任何中间服务器。
        </p>
        <label>
          API Key
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </label>
        <label>
          模型
          <input
            value={model}
            onChange={(e) => setModelState(e.target.value)}
            placeholder={DEFAULT_MODEL}
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

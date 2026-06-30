import { useState } from "react";
import { BasicMode } from "./components/BasicMode";
import { AdvancedMode } from "./components/AdvancedMode";
import { TemplateManager } from "./components/TemplateManager";
import { Settings } from "./components/Settings";

type Tab = "basic" | "advanced" | "templates" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "basic", label: "① 合同填充" },
  { id: "advanced", label: "② 合同修改" },
  { id: "templates", label: "模板管理" },
  { id: "settings", label: "设置" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("basic");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">📄</span>
          <div>
            <div className="title">KOL 合同助手</div>
            <div className="subtitle">模板自动填充 · AI 辅助改约 · 修改高亮</div>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === "basic" && <BasicMode />}
        {tab === "advanced" && <AdvancedMode />}
        {tab === "templates" && <TemplateManager />}
        {tab === "settings" && <Settings />}
      </main>

      <footer className="foot">
        所有数据仅保存在本浏览器（localStorage），不会上传到任何服务器；AI 调用直连 Anthropic。
      </footer>
    </div>
  );
}

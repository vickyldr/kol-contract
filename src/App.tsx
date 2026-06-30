import { useEffect, useState } from "react";
import { Records } from "./components/Records";
import { Templates } from "./components/Templates";
import { Products } from "./components/Products";
import { Assistant } from "./components/Assistant";
import { loadBuiltins } from "./lib/templates";

type Tab = "records" | "templates" | "products" | "assistant";

const TABS: { id: Tab; label: string }[] = [
  { id: "records", label: "合同记录" },
  { id: "templates", label: "模板" },
  { id: "products", label: "产品" },
  { id: "assistant", label: "问答助手" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("records");

  // warm the built-in template manifest once
  useEffect(() => {
    loadBuiltins();
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">📄</span>
          <div>
            <div className="title">KOL 合同助手</div>
            <div className="subtitle">模板自动填充 · AI 辅助改约 · 修改高亮 · 按红人/产品归档</div>
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
        {tab === "records" && <Records />}
        {tab === "templates" && <Templates />}
        {tab === "products" && <Products />}
        {tab === "assistant" && <Assistant />}
      </main>

      <footer className="foot">
        数据仅保存在本浏览器（localStorage），不上传任何服务器；AI 由通义千问完成。
      </footer>
    </div>
  );
}

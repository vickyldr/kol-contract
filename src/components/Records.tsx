import { useEffect, useMemo, useState } from "react";
import { genId, loadProducts, loadRecords, saveRecords } from "../lib/storage";
import { allTemplates } from "../lib/templates";
import { emptyFields, type Product, type Record_, type Template } from "../lib/types";
import { RecordDetail } from "./RecordDetail";
import { extractHandle } from "../lib/util";

const kolHandle = (r: Record_): string =>
  extractHandle(r.fields.kol.socialAccount, r.fields.kol.kolLink);

// Pull the KOL id / handle from the social account or link, e.g.
// "instagram.com/@johndoe" / "instagram.com/johndoe/" / "@johndoe" -> "@johndoe".
function kolHandle(r: Record_): string {
  const src = (r.fields.kol.socialAccount || r.fields.kol.kolLink || "").trim();
  if (!src) return "";
  const at = src.match(/@([A-Za-z0-9._]+)/);
  if (at) return "@" + at[1];
  const seg = src
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .split("/")
    .filter(Boolean);
  // last path segment after the domain
  if (seg.length >= 2) return "@" + seg[seg.length - 1];
  return "";
}

export function Records() {
  const [records, setRecords] = useState<Record_[]>(loadRecords());
  const [products, setProducts] = useState<Product[]>(loadProducts());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    allTemplates().then(setTemplates);
    setProducts(loadProducts());
  }, [activeId]);

  function persist(next: Record_[]) {
    setRecords(next);
    saveRecords(next);
  }

  function createRecord() {
    const now = Date.now();
    const rec: Record_ = {
      id: genId(),
      kolName: "",
      productId: products[0]?.id ?? "",
      templateId: "", // AI picks the template from the pasted info
      lang: "en",
      fields: emptyFields(),
      mods: [],
      createdAt: now,
      updatedAt: now,
    };
    persist([rec, ...records]);
    setActiveId(rec.id);
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const hay = [
        r.kolName,
        productName(r.productId),
        templateName(r.templateId),
        r.fields.kol.kolLink ?? "",
        r.fields.kol.socialAccount ?? "",
        kolHandle(r),
        ...r.mods.map((m) => m.title),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, records, products, templates]);

  const active = records.find((r) => r.id === activeId) ?? null;

  if (active) {
    return (
      <RecordDetail
        record={active}
        products={products}
        templates={templates}
        onBack={() => setActiveId(null)}
        onChange={(patch) =>
          persist(
            records.map((r) =>
              r.id === active.id ? { ...r, ...patch, updatedAt: Date.now() } : r,
            ),
          )
        }
        onDelete={() => {
          if (!confirm("删除该记录？")) return;
          persist(records.filter((r) => r.id !== active.id));
          setActiveId(null);
        }}
      />
    );
  }

  return (
    <div className="panel">
      <div className="records-head">
        <h2>合同记录</h2>
        <button className="primary" onClick={createRecord}>
          + 新建记录
        </button>
      </div>
      <p className="hint">同一红人 + 同一产品的合同归为一条记录，含自动填充与全部修改轮次。</p>

      <input
        className="search"
        placeholder="🔍 搜索：红人姓名 / 红人ID(@handle) / 产品 / 链接 / 模板…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {records.length === 0 && <p className="empty">还没有记录，点「新建记录」开始。</p>}
      {records.length > 0 && filtered.length === 0 && <p className="empty">没有匹配的记录。</p>}

      <ul className="rec-list">
        {filtered.map((r) => (
          <li key={r.id} className="rec-item" onClick={() => setActiveId(r.id)}>
            <div className="rec-main">
              <strong>{r.kolName || "(未命名红人)"}</strong>
              {kolHandle(r) && <span className="handle">{kolHandle(r)}</span>}
              <span className="badge">{productName(r.productId)}</span>
              {r.mods.length > 0 && <span className="badge mod">{r.mods.length} 次修改</span>}
            </div>
            <div className="muted">
              {templateName(r.templateId)} · 更新于 {new Date(r.updatedAt).toLocaleString("zh-CN")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

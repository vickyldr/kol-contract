import { useState } from "react";
import { saveAs } from "file-saver";
import { loadCases, saveCases, genId } from "../lib/storage";
import {
  applyHighlightedEdits,
  extractText,
  fileToBytes,
  type EditResult,
} from "../lib/docx";
import { messageForKOL, proposeEdits, summarizeForTL } from "../lib/claude";
import {
  LANG_LABEL,
  type ContractEdit,
  type Lang,
  type ModCase,
} from "../lib/types";

function newCase(): ModCase {
  const now = Date.now();
  return {
    id: genId(),
    title: "新的修改 " + new Date(now).toLocaleString("zh-CN"),
    lang: "en",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    kolOriginal: "",
    tlBriefing: "",
    tlReply: "",
    kolReply: "",
    edits: [],
  };
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be blocked; ignore */
  }
}

export function AdvancedMode() {
  const [cases, setCases] = useState<ModCase[]>(loadCases());
  const [activeId, setActiveId] = useState<string>(cases[0]?.id ?? "");

  const active = cases.find((c) => c.id === activeId) ?? null;

  function persist(next: ModCase[]) {
    setCases(next);
    saveCases(next);
  }

  function update(patch: Partial<ModCase>) {
    if (!active) return;
    persist(
      cases.map((c) =>
        c.id === active.id ? { ...c, ...patch, updatedAt: Date.now() } : c,
      ),
    );
  }

  function create() {
    const c = newCase();
    persist([c, ...cases]);
    setActiveId(c.id);
  }

  function remove(id: string) {
    if (!confirm("删除该修改记录？")) return;
    const next = cases.filter((c) => c.id !== id);
    persist(next);
    if (activeId === id) setActiveId(next[0]?.id ?? "");
  }

  return (
    <div className="panel two-col">
      <aside className="case-list">
        <button className="primary" onClick={create}>
          + 新建修改
        </button>
        <ul>
          {cases.map((c) => (
            <li
              key={c.id}
              className={c.id === activeId ? "case active" : "case"}
              onClick={() => setActiveId(c.id)}
            >
              <div className="case-title">{c.title}</div>
              <div className="muted">{LANG_LABEL[c.lang]}</div>
              <button
                className="link danger"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
              >
                删除
              </button>
            </li>
          ))}
          {cases.length === 0 && <li className="empty">还没有记录</li>}
        </ul>
      </aside>

      <section className="case-detail">
        {!active ? (
          <p className="empty">新建一条修改记录开始。</p>
        ) : (
          <CaseDetail key={active.id} c={active} update={update} />
        )}
      </section>
    </div>
  );
}

function CaseDetail({
  c,
  update,
}: {
  c: ModCase;
  update: (patch: Partial<ModCase>) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [contract, setContract] = useState<Uint8Array | null>(null);
  const [contractName, setContractName] = useState("");
  const [report, setReport] = useState<EditResult | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function setEdit(i: number, patch: Partial<ContractEdit>) {
    update({ edits: c.edits.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }
  function addEdit() {
    update({ edits: [...c.edits, { find: "", replace: "", note: "" }] });
  }
  function delEdit(i: number) {
    update({ edits: c.edits.filter((_, j) => j !== i) });
  }

  async function onContractUpload(file: File) {
    setContract(await fileToBytes(file));
    setContractName(file.name);
    setReport(null);
  }

  function generateHighlighted() {
    setError("");
    if (!contract) {
      setError("请先上传需要修改的合同 .docx");
      return;
    }
    const edits = c.edits.filter((e) => e.find.trim());
    if (edits.length === 0) {
      setError("没有可应用的修改项。");
      return;
    }
    try {
      const { out, result } = applyHighlightedEdits(contract, edits);
      setReport(result);
      const blob = new Blob([out as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      saveAs(blob, contractName.replace(/\.docx$/i, "") + "_modified.docx");
    } catch (e) {
      setError(`生成失败：${(e as Error).message}`);
    }
  }

  return (
    <div className="detail">
      <div className="detail-head">
        <input
          className="title-input"
          value={c.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <label className="inline">
          红人语言
          <select
            value={c.lang}
            onChange={(e) => update({ lang: e.target.value as Lang })}
          >
            {Object.entries(LANG_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Step 1 */}
      <div className="step">
        <h3>第 1 步 · 红人原文 → 整理给 TL</h3>
        <textarea
          rows={4}
          placeholder="粘贴红人的原话（外语原文）"
          value={c.kolOriginal}
          onChange={(e) => update({ kolOriginal: e.target.value })}
        />
        <button
          className="primary"
          disabled={!!busy || !c.kolOriginal.trim()}
          onClick={() =>
            run("tl", async () => {
              const out = await summarizeForTL(c.kolOriginal, c.lang);
              update({ tlBriefing: out, status: "tl_review" });
            })
          }
        >
          {busy === "tl" ? "整理中…" : "AI 翻译并整理（给 TL）"}
        </button>
        {c.tlBriefing && (
          <div className="ai-out">
            <div className="ai-out-head">
              <span>可直接复制粘贴给 TL：</span>
              <button className="link" onClick={() => copy(c.tlBriefing)}>
                复制
              </button>
            </div>
            <textarea
              rows={6}
              value={c.tlBriefing}
              onChange={(e) => update({ tlBriefing: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Step 2 */}
      <div className="step">
        <h3>第 2 步 · TL 回复 → 翻译给红人</h3>
        <textarea
          rows={4}
          placeholder="把 TL 的回复粘贴到这里（哪些能改 / 改成什么 / 哪些不能改）"
          value={c.tlReply}
          onChange={(e) => update({ tlReply: e.target.value })}
        />
        <button
          className="primary"
          disabled={!!busy || !c.tlReply.trim()}
          onClick={() =>
            run("kol", async () => {
              const out = await messageForKOL(c.kolOriginal, c.tlReply, c.lang);
              update({ kolReply: out, status: "kol_reply" });
            })
          }
        >
          {busy === "kol" ? "翻译中…" : `AI 生成给红人的回复（${LANG_LABEL[c.lang]}）`}
        </button>
        {c.kolReply && (
          <div className="ai-out">
            <div className="ai-out-head">
              <span>可直接复制粘贴给红人：</span>
              <button className="link" onClick={() => copy(c.kolReply)}>
                复制
              </button>
            </div>
            <textarea
              rows={6}
              value={c.kolReply}
              onChange={(e) => update({ kolReply: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Step 3 */}
      <div className="step">
        <h3>第 3 步 · 生成高亮合同</h3>
        <label className="file">
          上传需要修改的合同 .docx
          <input
            type="file"
            accept=".docx"
            onChange={(e) => e.target.files?.[0] && onContractUpload(e.target.files[0])}
          />
        </label>
        {contractName && <div className="muted">已载入：{contractName}</div>}

        <div className="edits-actions">
          <button
            className="primary"
            disabled={!!busy || !contract}
            onClick={() =>
              run("edits", async () => {
                if (!contract) return;
                const text = extractText(contract);
                const edits = await proposeEdits(text, c.kolOriginal, c.tlReply);
                update({ edits });
              })
            }
          >
            {busy === "edits" ? "分析中…" : "AI 按最小改动原则提议修改"}
          </button>
          <button className="ghost" onClick={addEdit}>
            + 手动添加修改项
          </button>
        </div>

        {c.edits.length > 0 && (
          <div className="edits">
            {c.edits.map((e, i) => (
              <div className="edit-row" key={i}>
                <div className="edit-num">{i + 1}</div>
                <div className="edit-fields">
                  <label>
                    原文（合同里要被替换的句子）
                    <textarea
                      rows={2}
                      value={e.find}
                      onChange={(ev) => setEdit(i, { find: ev.target.value })}
                    />
                  </label>
                  <label>
                    修改后
                    <textarea
                      rows={2}
                      value={e.replace}
                      onChange={(ev) => setEdit(i, { replace: ev.target.value })}
                    />
                  </label>
                  <label>
                    说明
                    <input
                      value={e.note}
                      onChange={(ev) => setEdit(i, { note: ev.target.value })}
                    />
                  </label>
                </div>
                <button className="link danger" onClick={() => delEdit(i)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          className="primary big"
          disabled={!contract || c.edits.length === 0}
          onClick={generateHighlighted}
        >
          生成高亮合同并下载（修改处黄色高亮）
        </button>

        {report && (
          <div className="report">
            <div className="ok">✓ 已应用 {report.applied.length} 处修改（黄色高亮）。</div>
            {report.unmatched.length > 0 && (
              <div className="warn">
                ⚠ {report.unmatched.length} 处未能在合同中定位，请核对原文是否逐字一致：
                <ul>
                  {report.unmatched.map((u, i) => (
                    <li key={i}>{u.find.slice(0, 60) || "(空)"}…</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="hint">
              下载后请发 TL 复核；确认无误后，再截图高亮部分发给红人。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

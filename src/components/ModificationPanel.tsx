import { useState } from "react";
import { saveAs } from "file-saver";
import {
  applyHighlightedEdits,
  bytesToBlob,
  extractText,
  type EditResult,
} from "../lib/docx";
import { messageForKOL, proposeEdits, summarizeForTL } from "../lib/claude";
import { genId } from "../lib/storage";
import {
  LANG_LABEL,
  newModCase,
  type ContractEdit,
  type ModCase,
  type Record_,
} from "../lib/types";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be blocked */
  }
}

export function ModificationPanel({
  record,
  onChange,
  buildContract,
  canBuild,
}: {
  record: Record_;
  onChange: (patch: Partial<Record_>) => void;
  buildContract: () => Promise<Uint8Array>;
  canBuild: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(record.mods[0]?.id ?? null);

  function setMods(mods: ModCase[]) {
    onChange({ mods });
  }
  function addRound() {
    const c = { ...newModCase(Date.now()), id: genId() };
    setMods([...record.mods, c]);
    setActiveId(c.id);
  }
  function updateRound(id: string, patch: Partial<ModCase>) {
    setMods(record.mods.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m)));
  }
  function removeRound(id: string) {
    if (!confirm("删除该修改轮次？")) return;
    const next = record.mods.filter((m) => m.id !== id);
    setMods(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  }

  const active = record.mods.find((m) => m.id === activeId) ?? null;

  return (
    <div className="card mod-card">
      <div className="records-head">
        <h3>合同修改（按 SOP 改约）</h3>
        <button className="primary" onClick={addRound}>
          + 新建修改轮次
        </button>
      </div>

      {record.mods.length === 0 && (
        <p className="empty">红人提出修改意见时，点上面新建一轮修改。</p>
      )}

      {record.mods.length > 0 && (
        <div className="round-tabs">
          {record.mods.map((m) => (
            <button
              key={m.id}
              className={m.id === activeId ? "round active" : "round"}
              onClick={() => setActiveId(m.id)}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      {active && (
        <RoundDetail
          key={active.id}
          c={active}
          lang={record.lang}
          update={(patch) => updateRound(active.id, patch)}
          remove={() => removeRound(active.id)}
          buildContract={buildContract}
          canBuild={canBuild}
        />
      )}
    </div>
  );
}

function RoundDetail({
  c,
  lang,
  update,
  remove,
  buildContract,
  canBuild,
}: {
  c: ModCase;
  lang: Record_["lang"];
  update: (patch: Partial<ModCase>) => void;
  remove: () => void;
  buildContract: () => Promise<Uint8Array>;
  canBuild: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
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
  const addEdit = () => update({ edits: [...c.edits, { find: "", replace: "", note: "" }] });
  const delEdit = (i: number) => update({ edits: c.edits.filter((_, j) => j !== i) });

  async function generateHighlighted() {
    setError("");
    const edits = c.edits.filter((e) => e.find.trim());
    if (edits.length === 0) {
      setError("没有可应用的修改项。");
      return;
    }
    const base = await buildContract();
    const { out, result } = applyHighlightedEdits(base, edits);
    setReport(result);
    saveAs(bytesToBlob(out), `${c.title}_modified.docx`);
  }

  return (
    <div className="detail">
      <div className="detail-head">
        <input
          className="title-input"
          value={c.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <button className="link danger" onClick={remove}>
          删除本轮
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="step">
        <h4>第 1 步 · 红人原文 → 整理给 TL</h4>
        <textarea
          rows={3}
          placeholder="粘贴红人的原话（外语原文）"
          value={c.kolOriginal}
          onChange={(e) => update({ kolOriginal: e.target.value })}
        />
        <button
          className="primary"
          disabled={!!busy || !c.kolOriginal.trim()}
          onClick={() =>
            run("tl", async () => {
              const out = await summarizeForTL(c.kolOriginal, lang);
              update({ tlBriefing: out, status: "tl_review" });
            })
          }
        >
          {busy === "tl" ? "整理中…" : "AI 翻译并整理（给 TL）"}
        </button>
        {c.tlBriefing && (
          <AiOut label="可直接复制粘贴给 TL：" value={c.tlBriefing} onChange={(v) => update({ tlBriefing: v })} />
        )}
      </div>

      <div className="step">
        <h4>第 2 步 · TL 回复 → 翻译给红人</h4>
        <textarea
          rows={3}
          placeholder="把 TL 的回复粘贴到这里（哪些能改 / 改成什么 / 哪些不能改）"
          value={c.tlReply}
          onChange={(e) => update({ tlReply: e.target.value })}
        />
        <button
          className="primary"
          disabled={!!busy || !c.tlReply.trim()}
          onClick={() =>
            run("kol", async () => {
              const out = await messageForKOL(c.kolOriginal, c.tlReply, lang);
              update({ kolReply: out, status: "kol_reply" });
            })
          }
        >
          {busy === "kol" ? "翻译中…" : `AI 生成给红人的回复（${LANG_LABEL[lang]}）`}
        </button>
        {c.kolReply && (
          <AiOut label="可直接复制粘贴给红人：" value={c.kolReply} onChange={(v) => update({ kolReply: v })} />
        )}
      </div>

      <div className="step">
        <h4>第 3 步 · 生成高亮合同</h4>
        <p className="hint">基于本记录当前填好的合同自动生成，无需上传。</p>
        <div className="edits-actions">
          <button
            className="primary"
            disabled={!!busy || !canBuild}
            onClick={() =>
              run("edits", async () => {
                const text = extractText(await buildContract());
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
                    <textarea rows={2} value={e.find} onChange={(ev) => setEdit(i, { find: ev.target.value })} />
                  </label>
                  <label>
                    修改后
                    <textarea rows={2} value={e.replace} onChange={(ev) => setEdit(i, { replace: ev.target.value })} />
                  </label>
                  <label>
                    说明
                    <input value={e.note} onChange={(ev) => setEdit(i, { note: ev.target.value })} />
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
          disabled={!canBuild || c.edits.length === 0}
          onClick={() => run("gen", generateHighlighted)}
        >
          {busy === "gen" ? "生成中…" : "生成高亮合同并下载（修改处黄色高亮）"}
        </button>

        {report && (
          <div className="report">
            <div className="ok">✓ 已应用 {report.applied.length} 处修改（黄色高亮）。</div>
            {report.unmatched.length > 0 && (
              <div className="warn">
                ⚠ {report.unmatched.length} 处未能定位，请核对原文是否与合同逐字一致：
                <ul>
                  {report.unmatched.map((u, i) => (
                    <li key={i}>{u.find.slice(0, 60) || "(空)"}…</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="hint">下载后发 TL 复核；确认无误后，截图高亮部分发给红人。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AiOut({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="ai-out">
      <div className="ai-out-head">
        <span>{label}</span>
        <button className="link" onClick={() => copy(value)}>
          复制
        </button>
      </div>
      <textarea rows={5} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

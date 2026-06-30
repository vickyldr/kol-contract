import { useEffect, useRef, useState } from "react";
import { askAssistant } from "../lib/llm";

interface Turn {
  q: string;
  a: string;
}

const SUGGESTIONS = [
  "新人入职我该先干嘛？",
  "台湾的红人怎么收款？",
  "红人要走 PayPal 亲友转账，怎么回？",
  "红人要改授权时长，流程是什么？",
  "对公账户要怎么处理？",
];

export function Assistant() {
  const [knowledge, setKnowledge] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}knowledge.md`)
      .then((r) => (r.ok ? r.text() : ""))
      .then(setKnowledge)
      .catch(() => setKnowledge(""));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setQ("");
    try {
      const a = await askAssistant(text, knowledge);
      setTurns((t) => [...t, { q: text, a }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel assistant">
      <h2>团队问答助手</h2>
      <p className="hint">
        新人入职、付款 SOP、改约流程、工具怎么用，直接问。答案来自团队知识库（付款 FAQ / 改约 SOP /
        工具说明）；不确定的会让你找 TL，不会瞎编。
      </p>

      <div className="chat">
        {turns.length === 0 && (
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="qa">
            <div className="bubble q">{t.q}</div>
            <div className="bubble a">{t.a}</div>
          </div>
        ))}
        {busy && <div className="bubble a muted">思考中…</div>}
        {error && <div className="error">{error}</div>}
        <div ref={endRef} />
      </div>

      <div className="ask-row">
        <textarea
          rows={2}
          placeholder="输入你的问题，回车发送（Shift+回车换行）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(q);
            }
          }}
        />
        <button className="primary" disabled={busy || !q.trim()} onClick={() => ask(q)}>
          发送
        </button>
      </div>
    </div>
  );
}

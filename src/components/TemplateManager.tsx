import { useRef, useState } from "react";
import { loadTemplates, saveTemplates, genId } from "../lib/storage";
import { bytesToBase64, base64ToBytes, fileToBytes, inspectTags } from "../lib/docx";
import { LANG_LABEL, type Lang, type Template } from "../lib/types";

const STANDARD_TAGS = [
  "legalName",
  "kolLink",
  "unitPrice",
  "videoCount",
  "platform",
  "paymentInfo",
  "paymentMethod",
];

export function TemplateManager() {
  const [list, setList] = useState<Template[]>(loadTemplates());
  const [name, setName] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const fileRef = useRef<HTMLInputElement>(null);

  function persist(next: Template[]) {
    setList(next);
    saveTemplates(next);
  }

  async function onUpload(file: File) {
    const bytes = await fileToBytes(file);
    const tpl: Template = {
      id: genId(),
      name: name.trim() || file.name.replace(/\.docx$/i, ""),
      lang,
      fileName: file.name,
      data: bytesToBase64(bytes),
      createdAt: Date.now(),
    };
    persist([tpl, ...list]);
    setName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function remove(id: string) {
    if (!confirm("删除该模板？")) return;
    persist(list.filter((t) => t.id !== id));
  }

  function tagsOf(t: Template): string[] {
    return inspectTags(base64ToBytes(t.data));
  }

  return (
    <div className="panel">
      <h2>模板管理</h2>
      <p className="hint">
        上传 Word 模板（英语 / 韩语 / 日语三个版本）。在需要自动填充的位置放上占位符，用花括号包裹，例如{" "}
        <code>{"{legalName}"}</code>、<code>{"{unitPrice}"}</code>、<code>{"{paymentInfo}"}</code>。
        付款信息整块用 <code>{"{paymentInfo}"}</code> 即可，会根据所选支付方式自动生成。
      </p>

      <div className="card upload">
        <div className="row">
          <label>
            模板名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：标准合作合同"
            />
          </label>
          <label>
            语言
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {Object.entries(LANG_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            选择 .docx
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
        </div>
        <div className="tagref">
          标准占位符：
          {STANDARD_TAGS.map((t) => (
            <code key={t}>{`{${t}}`}</code>
          ))}
        </div>
      </div>

      <h3>已上传模板（{list.length}）</h3>
      {list.length === 0 && <p className="empty">还没有模板，先上传一个吧。</p>}
      <ul className="tpl-list">
        {list.map((t) => {
          const tags = tagsOf(t);
          const nonStd = tags.filter((x) => !STANDARD_TAGS.includes(x));
          return (
            <li key={t.id} className="tpl-item">
              <div>
                <strong>{t.name}</strong>
                <span className="badge">{LANG_LABEL[t.lang]}</span>
                <div className="muted">{t.fileName}</div>
                <div className="muted">
                  占位符：{tags.length ? tags.map((x) => `{${x}}`).join("  ") : "（未检测到）"}
                  {nonStd.length > 0 && (
                    <span className="warn"> · 自定义：{nonStd.join(", ")}</span>
                  )}
                </div>
              </div>
              <button className="danger" onClick={() => remove(t.id)}>
                删除
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

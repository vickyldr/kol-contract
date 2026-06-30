import { useEffect, useRef, useState } from "react";
import { genId, loadUploadedTemplates, saveUploadedTemplates } from "../lib/storage";
import { allTemplates } from "../lib/templates";
import { bytesToBase64, fileToBytes } from "../lib/docx";
import { LANG_LABEL, type Lang, type Template } from "../lib/types";

export function Templates() {
  const [list, setList] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [payment, setPayment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setList(await allTemplates());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function onUpload(file: File) {
    const bytes = await fileToBytes(file);
    const tpl: Template = {
      id: genId(),
      name: name.trim() || file.name.replace(/\.docx$/i, ""),
      lang,
      payment,
      fileName: file.name,
      builtin: false,
      data: bytesToBase64(bytes),
      createdAt: Date.now(),
    };
    saveUploadedTemplates([tpl, ...loadUploadedTemplates()]);
    setName("");
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  function remove(id: string) {
    if (!confirm("删除该上传模板？")) return;
    saveUploadedTemplates(loadUploadedTemplates().filter((t) => t.id !== id));
    refresh();
  }

  const builtins = list.filter((t) => t.builtin);
  const uploaded = list.filter((t) => !t.builtin);

  return (
    <div className="panel">
      <h2>模板</h2>
      <p className="hint">
        内置模板可直接使用，无需改动模板本身——系统会按 <code>标签:</code> 自动定位并填入红人信息、付款字段，
        并填好单价 / 视频数量、替换产品名。也可上传你自己的 .docx（结构相同即可自动识别）。
      </p>

      <div className="card upload">
        <h3>上传模板</h3>
        <div className="row">
          <label>
            名称
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：英文-bank(IBAN)" />
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
            付款方式
            <select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="">（不指定）</option>
              <option value="bank">银行 Bank</option>
              <option value="paypal">PayPal</option>
              <option value="payoneer">Payoneer</option>
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
      </div>

      <h3>内置模板（{builtins.length}）</h3>
      <ul className="tpl-list">
        {builtins.map((t) => (
          <li key={t.id} className="tpl-item">
            <div>
              <strong>{t.name}</strong>
              <span className="badge">{LANG_LABEL[t.lang]}</span>
              {t.payment && <span className="badge">{t.payment}</span>}
              <span className="badge builtin">内置</span>
            </div>
          </li>
        ))}
      </ul>

      {uploaded.length > 0 && (
        <>
          <h3>已上传（{uploaded.length}）</h3>
          <ul className="tpl-list">
            {uploaded.map((t) => (
              <li key={t.id} className="tpl-item">
                <div>
                  <strong>{t.name}</strong>
                  <span className="badge">{LANG_LABEL[t.lang]}</span>
                  {t.payment && <span className="badge">{t.payment}</span>}
                  <div className="muted">{t.fileName}</div>
                </div>
                <button className="danger" onClick={() => remove(t.id)}>
                  删除
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

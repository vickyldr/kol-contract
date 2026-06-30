import { useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { loadTemplates } from "../lib/storage";
import { base64ToBytes, fillTemplate, inspectTags } from "../lib/docx";
import { buildTags, emptyFields } from "../lib/payment";
import {
  LANG_LABEL,
  PAYMENT_LABEL,
  type ContractFields,
  type PaymentMethod,
} from "../lib/types";

const STANDARD_TAGS = new Set([
  "legalName",
  "kolLink",
  "unitPrice",
  "videoCount",
  "platform",
  "paymentInfo",
  "paymentMethod",
]);

export function BasicMode() {
  const templates = loadTemplates();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [f, setF] = useState<ContractFields>(emptyFields());
  const [error, setError] = useState("");

  const selected = templates.find((t) => t.id === templateId);

  const customTags = useMemo(() => {
    if (!selected) return [];
    return inspectTags(base64ToBytes(selected.data)).filter(
      (t) => !STANDARD_TAGS.has(t),
    );
  }, [selected]);

  function set<K extends keyof ContractFields>(key: K, value: ContractFields[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function setExtra(tag: string, value: string) {
    setF((prev) => ({ ...prev, extra: { ...prev.extra, [tag]: value } }));
  }

  function generate() {
    setError("");
    if (!selected) {
      setError("请先选择一个模板。");
      return;
    }
    try {
      const out = fillTemplate(base64ToBytes(selected.data), buildTags(f));
      const blob = new Blob([out as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const base = (f.legalName || "contract").replace(/[\\/:*?"<>|]/g, "_");
      saveAs(blob, `${base}_${selected.lang}.docx`);
    } catch (e) {
      setError(`生成失败：${(e as Error).message}`);
    }
  }

  return (
    <div className="panel">
      <h2>① 合同填充</h2>
      {templates.length === 0 && (
        <p className="empty">
          还没有模板，请先到「模板管理」上传 Word 模板。
        </p>
      )}

      <div className="card">
        <label>
          选择模板
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{LANG_LABEL[t.lang]}）
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        <h3>合同信息</h3>
        <div className="grid2">
          <label>
            法人姓名
            <input value={f.legalName} onChange={(e) => set("legalName", e.target.value)} />
          </label>
          <label>
            KOL 链接
            <input value={f.kolLink} onChange={(e) => set("kolLink", e.target.value)} />
          </label>
          <label>
            单价
            <input value={f.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} />
          </label>
          <label>
            合作视频数量
            <input value={f.videoCount} onChange={(e) => set("videoCount", e.target.value)} />
          </label>
          <label>
            发布平台
            <input value={f.platform} onChange={(e) => set("platform", e.target.value)} />
          </label>
        </div>

        {customTags.length > 0 && (
          <>
            <h4>模板自定义字段</h4>
            <div className="grid2">
              {customTags.map((tag) => (
                <label key={tag}>
                  {tag}
                  <input
                    value={f.extra[tag] ?? ""}
                    onChange={(e) => setExtra(tag, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>付款信息</h3>
        <div className="seg">
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <button
              key={m}
              className={f.paymentMethod === m ? "seg-btn active" : "seg-btn"}
              onClick={() => set("paymentMethod", m)}
            >
              {PAYMENT_LABEL[m]}
            </button>
          ))}
        </div>

        {f.paymentMethod === "bank" && (
          <div className="grid2">
            <label>
              账户名 Account Name
              <input
                value={f.bank.accountName}
                onChange={(e) => set("bank", { ...f.bank, accountName: e.target.value })}
              />
            </label>
            <label>
              银行名称 Bank Name
              <input
                value={f.bank.bankName}
                onChange={(e) => set("bank", { ...f.bank, bankName: e.target.value })}
              />
            </label>
            <label>
              账号 / IBAN
              <input
                value={f.bank.accountNumber}
                onChange={(e) => set("bank", { ...f.bank, accountNumber: e.target.value })}
              />
            </label>
            <label>
              SWIFT / BIC
              <input
                value={f.bank.swift}
                onChange={(e) => set("bank", { ...f.bank, swift: e.target.value })}
              />
            </label>
            <label className="full">
              银行地址 Bank Address
              <input
                value={f.bank.bankAddress}
                onChange={(e) => set("bank", { ...f.bank, bankAddress: e.target.value })}
              />
            </label>
          </div>
        )}

        {f.paymentMethod === "paypal" && (
          <div className="grid2">
            <label>
              账户名 Account Name
              <input
                value={f.paypal.accountName}
                onChange={(e) => set("paypal", { ...f.paypal, accountName: e.target.value })}
              />
            </label>
            <label>
              PayPal 邮箱
              <input
                value={f.paypal.email}
                onChange={(e) => set("paypal", { ...f.paypal, email: e.target.value })}
              />
            </label>
          </div>
        )}

        {f.paymentMethod === "payoneer" && (
          <div className="grid2">
            <label>
              账户名 Account Name
              <input
                value={f.payoneer.accountName}
                onChange={(e) =>
                  set("payoneer", { ...f.payoneer, accountName: e.target.value })
                }
              />
            </label>
            <label>
              Payoneer 邮箱
              <input
                value={f.payoneer.email}
                onChange={(e) => set("payoneer", { ...f.payoneer, email: e.target.value })}
              />
            </label>
            <label>
              Customer ID
              <input
                value={f.payoneer.customerId}
                onChange={(e) =>
                  set("payoneer", { ...f.payoneer, customerId: e.target.value })
                }
              />
            </label>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <button className="primary big" disabled={!selected} onClick={generate}>
        一键生成并下载合同
      </button>
    </div>
  );
}

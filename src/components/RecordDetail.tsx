import { useCallback, useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import {
  bytesToBlob,
  detectFields,
  fillContract,
  type FillableField,
  type FillInput,
} from "../lib/docx";
import { getTemplateBytes } from "../lib/templates";
import {
  ACCOUNT_TYPE_KEY,
  KOL_FIELD_LABEL_CN,
  PREPAY_CLAUSE_DEFAULT,
  isRegisteredAddress,
  type KolField,
} from "../lib/labels";
import { runChecks } from "../lib/checks";
import { generatePrepayClause } from "../lib/llm";
import type { AccountBlock, ContractFields, Product, Record_, Template } from "../lib/types";
import { LANG_LABEL } from "../lib/types";
import { ModificationPanel } from "./ModificationPanel";

// KOL fields shown prominently vs. tucked under "更多(可选)".
const PRIMARY_KOL: KolField[] = ["legalName", "socialAccount", "kolLink", "platform"];
const OPTIONAL_KOL: KolField[] = ["email", "contactAddress", "identityNumber"];

export function RecordDetail({
  record,
  products,
  templates,
  onBack,
  onChange,
  onDelete,
}: {
  record: Record_;
  products: Product[];
  templates: Template[];
  onBack: () => void;
  onChange: (patch: Partial<Record_>) => void;
  onDelete: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fields, setFields] = useState<FillableField[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function runAi(fn: () => Promise<void>) {
    setAiBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  const template = templates.find((t) => t.id === record.templateId);
  const product = products.find((p) => p.id === record.productId);

  // Load template bytes + detect fillable fields whenever the template changes.
  useEffect(() => {
    let alive = true;
    if (!record.templateId) {
      setBytes(null);
      setFields([]);
      return;
    }
    setLoadingTpl(true);
    setError("");
    getTemplateBytes(record.templateId)
      .then((b) => {
        if (!alive) return;
        setBytes(b);
        setFields(detectFields(b));
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoadingTpl(false));
    return () => {
      alive = false;
    };
  }, [record.templateId]);

  function setFieldsObj(patch: Partial<ContractFields>) {
    onChange({ fields: { ...record.fields, ...patch } });
  }
  function setKol(field: KolField, value: string) {
    setFieldsObj({ kol: { ...record.fields.kol, [field]: value } });
  }
  function setPayment(key: string, value: string) {
    setFieldsObj({ payment: { ...record.fields.payment, [key]: value } });
  }

  const paymentFields = fields.filter((f) => f.kind === "payment");
  const hasBankAddress = paymentFields.some((f) => isRegisteredAddress(f.key));
  const hasAccountType = paymentFields.some((f) => f.key === ACCOUNT_TYPE_KEY);

  const method =
    template?.payment ||
    (paymentFields.some((f) => /paypal/i.test(f.label))
      ? "paypal"
      : paymentFields.some((f) => /payponeer|payoneer/i.test(f.label))
        ? "payoneer"
        : "bank");

  // Resolve the payment label -> value map, folding in the split bank address
  // and the currency (account type). Used by both fill and the checks.
  const resolvedPayment = useCallback((): Record<string, string> => {
    const payment = { ...record.fields.payment };
    const addr = [record.fields.addrStreet, record.fields.addrCity, record.fields.addrProvince]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
    for (const f of paymentFields) {
      if (isRegisteredAddress(f.key)) payment[f.key] = addr;
    }
    if (record.fields.currency.trim()) payment[ACCOUNT_TYPE_KEY] = record.fields.currency.trim();
    return payment;
  }, [paymentFields, record.fields]);

  const buildFillInput = useCallback(
    (): FillInput => ({
      productName: product?.contractName,
      method,
      unitPrice: record.fields.unitPrice,
      videoCount: record.fields.videoCount,
      accountBlock: record.fields.accountBlock,
      prepay: record.fields.prepay,
      prepayClause: record.fields.prepay
        ? record.fields.prepayClause || PREPAY_CLAUSE_DEFAULT[template?.lang ?? record.lang]
        : "",
      kol: record.fields.kol,
      payment: resolvedPayment(),
    }),
    [product, method, template, record.fields, record.lang, resolvedPayment],
  );

  const checks = useMemo(
    () =>
      runChecks({
        method,
        lang: template?.lang ?? record.lang,
        accountBlock: record.fields.accountBlock,
        kolName: record.kolName,
        legalName: record.fields.kol.legalName ?? "",
        unitPrice: record.fields.unitPrice,
        videoCount: record.fields.videoCount,
        prepay: record.fields.prepay,
        corporate: record.fields.corporate,
        paymentFields,
        values: resolvedPayment(),
      }),
    [method, template, record, paymentFields, resolvedPayment],
  );

  // Build the filled contract bytes (used for download and as the base for mods).
  const buildContract = useCallback(async (): Promise<Uint8Array> => {
    if (!bytes) throw new Error("模板尚未加载。");
    return fillContract(bytes, buildFillInput()).out;
  }, [bytes, buildFillInput]);

  function generate() {
    setError("");
    if (!bytes) {
      setError("请先选择模板。");
      return;
    }
    try {
      const { out, report } = fillContract(bytes, buildFillInput());
      const base = (record.kolName || "contract").replace(/[\\/:*?"<>|]/g, "_");
      saveAs(bytesToBlob(out), `${base}_${product?.name ?? ""}_${template?.lang ?? ""}.docx`);
      if (report.filledLabels.length === 0)
        setError("已生成，但没有任何字段被填充——请检查模板与输入。");
    } catch (e) {
      setError(`生成失败：${(e as Error).message}`);
    }
  }

  return (
    <div className="panel">
      <div className="records-head">
        <button className="link" onClick={onBack}>
          ← 返回列表
        </button>
        <button className="danger" onClick={onDelete}>
          删除记录
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h3>基本信息</h3>
        <div className="grid2">
          <label>
            红人姓名 / 法人姓名
            <input
              value={record.kolName}
              onChange={(e) => onChange({ kolName: e.target.value })}
              placeholder="用于归档与搜索"
            />
          </label>
          <label>
            产品
            <select
              value={record.productId}
              onChange={(e) => onChange({ productId: e.target.value })}
            >
              <option value="">（请选择产品）</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            合同模板
            <select
              value={record.templateId}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                onChange({ templateId: e.target.value, lang: t?.lang ?? record.lang });
              }}
            >
              <option value="">（请选择模板）</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.builtin ? "" : "（上传）"}
                </option>
              ))}
            </select>
          </label>
          <div className="readout">
            语言：{LANG_LABEL[template?.lang ?? record.lang]}
            {loadingTpl && <span className="muted"> · 载入中…</span>}
          </div>
        </div>
        {products.length === 0 && (
          <p className="warn">还没有产品，请先到「产品」页添加（如 Rythmix）。</p>
        )}
      </div>

      <div className="card">
        <h3>红人合同信息</h3>
        <div className="grid2">
          {PRIMARY_KOL.map((f) => (
            <label key={f}>
              {KOL_FIELD_LABEL_CN[f]}
              <input
                value={record.fields.kol[f] ?? ""}
                onChange={(e) => setKol(f, e.target.value)}
              />
            </label>
          ))}
          <label>
            单价（合同里 Annex 的价格）
            <input
              value={record.fields.unitPrice}
              onChange={(e) => setFieldsObj({ unitPrice: e.target.value })}
              placeholder="如 USD 500"
            />
          </label>
          <label>
            合作视频数量
            <input
              value={record.fields.videoCount}
              onChange={(e) => setFieldsObj({ videoCount: e.target.value })}
              placeholder="如 3"
            />
          </label>
        </div>

        <button className="link" onClick={() => setShowMore((v) => !v)}>
          {showMore ? "收起可选字段" : "更多可选字段（邮箱 / 地址 / 证件号）"}
        </button>
        {showMore && (
          <div className="grid2">
            {OPTIONAL_KOL.map((f) => (
              <label key={f}>
                {KOL_FIELD_LABEL_CN[f]}
                <input
                  value={record.fields.kol[f] ?? ""}
                  onChange={(e) => setKol(f, e.target.value)}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>付款信息</h3>
        <p className="hint">以下字段根据所选模板自动识别（{template?.payment || "未指定"}）。只填你有的即可。</p>

        <div className="row">
          <div className="field-block">
            <div className="field-label">填入哪个账户栏？</div>
            <div className="seg">
              {(["own", "third"] as AccountBlock[]).map((b) => (
                <button
                  key={b}
                  className={record.fields.accountBlock === b ? "seg-btn active" : "seg-btn"}
                  onClick={() => setFieldsObj({ accountBlock: b })}
                >
                  {b === "own" ? "本人账户 own account" : "第三方账户 third-party"}
                </button>
              ))}
            </div>
          </div>
          <div className="field-block">
            <div className="field-label">是否对公账户？</div>
            <div className="seg">
              <button
                className={!record.fields.corporate ? "seg-btn active" : "seg-btn"}
                onClick={() => setFieldsObj({ corporate: false })}
              >
                对私 personal
              </button>
              <button
                className={record.fields.corporate ? "seg-btn active" : "seg-btn"}
                onClick={() => setFieldsObj({ corporate: true })}
              >
                对公 corporate
              </button>
            </div>
          </div>
        </div>

        {paymentFields.length === 0 && !loadingTpl && (
          <p className="empty">该模板未识别到付款字段。</p>
        )}
        <div className="grid2">
          {paymentFields.map((f) =>
            isRegisteredAddress(f.key) || f.key === ACCOUNT_TYPE_KEY ? null : (
              <label key={f.key}>
                {f.label}
                <input
                  value={record.fields.payment[f.key] ?? ""}
                  onChange={(e) => setPayment(f.key, e.target.value)}
                />
              </label>
            ),
          )}
          {hasAccountType && (
            <label>
              账户币种 Account Type / Currency
              <input
                value={record.fields.currency}
                onChange={(e) => setFieldsObj({ currency: e.target.value })}
                placeholder="如 USD（会覆盖模板里的示例）"
              />
            </label>
          )}
        </div>

        {hasBankAddress && (
          <>
            <h4>账户注册地址（自动拆解填入 Registered Address）</h4>
            <div className="grid2">
              <label>
                街道 Street / Address
                <input
                  value={record.fields.addrStreet}
                  onChange={(e) => setFieldsObj({ addrStreet: e.target.value })}
                />
              </label>
              <label>
                城市 City
                <input
                  value={record.fields.addrCity}
                  onChange={(e) => setFieldsObj({ addrCity: e.target.value })}
                />
              </label>
              <label>
                省/州 Province / State
                <input
                  value={record.fields.addrProvince}
                  onChange={(e) => setFieldsObj({ addrProvince: e.target.value })}
                />
              </label>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>支付时间 / 预付</h3>
        <div className="field-block">
          <div className="field-label">是否预付？</div>
          <div className="seg">
            <button
              className={!record.fields.prepay ? "seg-btn active" : "seg-btn"}
              onClick={() => setFieldsObj({ prepay: false })}
            >
              发布后支付（默认）
            </button>
            <button
              className={record.fields.prepay ? "seg-btn active" : "seg-btn"}
              onClick={() =>
                setFieldsObj({
                  prepay: true,
                  prepayClause:
                    record.fields.prepayClause || PREPAY_CLAUSE_DEFAULT[template?.lang ?? record.lang],
                })
              }
            >
              预付 prepay
            </button>
          </div>
        </div>

        {record.fields.prepay && (
          <>
            <p className="hint">
              默认 50% 初稿通过后预付、50% 发布后支付。可填中文备注让 AI 改写（说明两次支付的时间节点和各付百分之几）。
            </p>
            <label>
              备注（中文，可选）
              <input
                value={record.fields.prepayNote}
                onChange={(e) => setFieldsObj({ prepayNote: e.target.value })}
                placeholder="如：三个视频一起给初稿付一半，全部发布后付另一半"
              />
            </label>
            <button
              className="primary"
              disabled={!!aiBusy || !record.fields.prepayNote.trim()}
              onClick={() =>
                runAi(async () => {
                  const clause = await generatePrepayClause(
                    record.fields.prepayNote,
                    template?.lang ?? record.lang,
                  );
                  setFieldsObj({ prepayClause: clause });
                })
              }
            >
              {aiBusy ? "生成中…" : "AI 按备注改写预付条款"}
            </button>
            <label>
              预付条款（会替换合同里的「Time of Payment」整句，可手动编辑）
              <textarea
                rows={4}
                value={record.fields.prepayClause}
                onChange={(e) => setFieldsObj({ prepayClause: e.target.value })}
              />
            </label>
          </>
        )}
      </div>

      {checks.length > 0 && (
        <div className="card checks">
          <h3>检查与提醒</h3>
          <ul>
            {checks.map((c, i) => (
              <li key={i} className={`chk ${c.level}`}>
                <span className="chk-ico">
                  {c.level === "error" ? "⛔" : c.level === "warn" ? "⚠️" : "ℹ️"}
                </span>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="primary big" disabled={!bytes || loadingTpl} onClick={generate}>
        一键生成并下载合同
      </button>

      <ModificationPanel
        record={record}
        onChange={onChange}
        buildContract={buildContract}
        canBuild={!!bytes}
      />
    </div>
  );
}

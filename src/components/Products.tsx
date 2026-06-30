import { useState } from "react";
import { genId, loadProducts, saveProducts } from "../lib/storage";
import type { Product } from "../lib/types";

export function Products() {
  const [list, setList] = useState<Product[]>(loadProducts());
  const [name, setName] = useState("");
  const [contractName, setContractName] = useState("");

  function persist(next: Product[]) {
    setList(next);
    saveProducts(next);
  }

  function add() {
    const n = name.trim();
    if (!n) return;
    const p: Product = {
      id: genId(),
      name: n,
      contractName: contractName.trim() || n,
      createdAt: Date.now(),
    };
    persist([p, ...list]);
    setName("");
    setContractName("");
  }

  function update(id: string, patch: Partial<Product>) {
    persist(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function remove(id: string) {
    if (!confirm("删除该产品？")) return;
    persist(list.filter((p) => p.id !== id));
  }

  return (
    <div className="panel">
      <h2>产品</h2>
      <p className="hint">
        产品名会在生成合同时，自动替换合同正文里的 <code>【Rythmix】</code>。
        例如新增产品「小影」，则合同里所有 <code>【Rythmix】</code> 变为「小影」。
      </p>

      <div className="card">
        <div className="row">
          <label>
            产品名称
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：Rythmix / 小影" />
          </label>
          <label>
            合同正文里显示的名字
            <input
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              placeholder="留空则与产品名相同"
            />
          </label>
          <button className="primary" style={{ alignSelf: "flex-end" }} onClick={add}>
            添加
          </button>
        </div>
      </div>

      {list.length === 0 && <p className="empty">还没有产品，先添加一个（如 Rythmix）。</p>}
      <ul className="tpl-list">
        {list.map((p) => (
          <li key={p.id} className="tpl-item">
            <div className="grow">
              <div className="row">
                <label>
                  产品名称
                  <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                </label>
                <label>
                  合同正文里显示
                  <input
                    value={p.contractName}
                    onChange={(e) => update(p.id, { contractName: e.target.value })}
                  />
                </label>
              </div>
            </div>
            <button className="danger" onClick={() => remove(p.id)}>
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

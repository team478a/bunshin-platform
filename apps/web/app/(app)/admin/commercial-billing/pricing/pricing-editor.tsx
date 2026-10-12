'use client';

import { useState } from 'react';
import { parseCommercialInteger, quoteMauPrice, type MauPricingTier } from '@bunshin/application';

export function PricingEditor({
  initial,
  action,
  current,
}: {
  initial: {
    id?: string;
    revision?: number;
    name: string;
    version: string;
    effectiveFrom: string;
    reason: string;
    tiers: MauPricingTier[];
  };
  current: { version: string; tiers: MauPricingTier[] };
  action: (data: FormData) => Promise<void>;
}) {
  const [rows, setRows] = useState(
    initial.tiers.map((t) => ({
      id: t.tierKey,
      upper: String(t.upperLimit),
      price: String(t.priceYen),
    })),
  );
  const [count, setCount] = useState('0');
  let preview = '整数の上限・金額・人数を入力してください。';
  try {
    const tiers = rows.map((r) => ({
      tierKey: r.id,
      upperLimit: parseCommercialInteger(r.upper),
      priceYen: parseCommercialInteger(r.price),
    }));
    const before = quoteMauPrice(parseCommercialInteger(count), current.version, current.tiers);
    const after = quoteMauPrice(parseCommercialInteger(count), initial.version || 'draft', tiers);
    preview = `現行: ${before.priceYen === null ? '個別見積' : `${before.priceYen.toLocaleString()}円`} → 新料金: ${after.priceYen === null ? '個別見積' : `${after.priceYen.toLocaleString()}円`}（税込）`;
  } catch {
    /* Invalid drafts have no charge preview. */
  }
  return (
    <form action={action} className="form-stack oem-pricing-editor">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="revision" value={initial.revision ?? 0} />
      <input type="hidden" name="tiers" value={JSON.stringify(rows)} />
      <label>
        料金表名
        <input name="name" required maxLength={120} defaultValue={initial.name} />
      </label>
      <label>
        バージョン
        <input name="version" required maxLength={80} defaultValue={initial.version} />
      </label>
      <label>
        適用月
        <input type="month" name="month" required defaultValue={initial.effectiveFrom} />
      </label>
      {rows.map((row, i) => (
        <fieldset key={row.id}>
          <legend>
            {i === 0
              ? '0'
              : (() => {
                  try {
                    return String(parseCommercialInteger(rows[i - 1]!.upper) + 1);
                  } catch {
                    return '未確定';
                  }
                })()}
            人から
          </legend>
          <label>
            上限人数
            <input
              required
              inputMode="numeric"
              value={row.upper}
              onChange={(e) =>
                setRows(rows.map((r, n) => (n === i ? { ...r, upper: e.target.value } : r)))
              }
            />
          </label>
          <label>
            税込月額（円）
            <input
              required
              inputMode="numeric"
              value={row.price}
              onChange={(e) =>
                setRows(rows.map((r, n) => (n === i ? { ...r, price: e.target.value } : r)))
              }
            />
          </label>
          <button
            type="button"
            className="button button--secondary"
            disabled={rows.length === 1}
            onClick={() => {
              if (window.confirm('この料金段階を削除しますか？'))
                setRows(rows.filter((r) => r.id !== row.id));
            }}
          >
            段階を削除
          </button>
        </fieldset>
      ))}
      <button
        className="button button--secondary"
        type="button"
        onClick={() =>
          setRows([
            ...rows,
            { id: `tier-${crypto.randomUUID().slice(0, 8)}`, upper: '', price: '' },
          ])
        }
      >
        段階を追加
      </button>
      <label>
        個別見積の開始人数（最終上限＋1）
        <input
          inputMode="numeric"
          value={(() => {
            try {
              return String(parseCommercialInteger(rows[rows.length - 1]!.upper) + 1);
            } catch {
              return '';
            }
          })()}
          onChange={(e) => {
            try {
              const threshold = parseCommercialInteger(e.target.value);
              if (threshold < 1) return;
              setRows(
                rows.map((r, i) =>
                  i === rows.length - 1 ? { ...r, upper: String(threshold - 1) } : r,
                ),
              );
            } catch {
              setRows(rows.map((r, i) => (i === rows.length - 1 ? { ...r, upper: '' } : r)));
            }
          }}
        />
      </label>
      <p>定員設定とは別です。境界を変えると最終段階の上限も変わります。</p>
      <label>
        任意人数で比較
        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
      </label>
      <p role="status">{preview}</p>
      <label>
        変更理由
        <textarea name="reason" required maxLength={1000} defaultValue={initial.reason} />
      </label>
      <label>
        <input type="checkbox" name="descending" />
        上位段階が安くなる場合も、理由を確認して保存する
      </label>
      <button className="button" type="submit">
        下書きを保存
      </button>
    </form>
  );
}

'use client';

import { useMemo, useState } from 'react';
import {
  groupUnknownAiUsageCosts,
  NO_PROVIDER_CALL_PRICING_VERSION,
  type AiUsageCostRow as Row,
} from './ai-usage-cost-reconciliation-groups';

export function AiUsageCostReconciliation({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [pricingVersions, setPricingVersions] = useState<Record<string, string>>({});
  const [groupPricingVersions, setGroupPricingVersions] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('課金証跡を確認した原価の精算');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () =>
      rows.flatMap((row) => {
        const rawCost = costs[row.id]?.trim();
        const cost = Number(rawCost);
        const pricingVersion = pricingVersions[row.id]?.trim();
        const confirmedZeroCost =
          cost === 0 &&
          row.status === 'FAILED' &&
          row.inputTokens === null &&
          row.outputTokens === null;
        return rawCost &&
          Number.isSafeInteger(cost) &&
          (cost > 0 || confirmedZeroCost) &&
          pricingVersion
          ? [{ usageEventId: row.id, estimatedCostUsdMicros: cost, pricingVersion }]
          : [];
      }),
    [costs, pricingVersions, rows],
  );
  const groups = useMemo(() => groupUnknownAiUsageCosts(rows), [rows]);

  function confirmNoProviderCost(ids: readonly string[]) {
    setCosts((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, '0'])),
    }));
    setPricingVersions((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, NO_PROVIDER_CALL_PRICING_VERSION])),
    }));
    setMessage(
      `${ids.length}件を0円として入力しました。証跡参照を入力し、内容を確認してから精算してください。`,
    );
  }

  function applyPricingVersion(ids: readonly string[], pricingVersion: string) {
    const value = pricingVersion.trim();
    if (!value) {
      setMessage('まとめて設定する価格版を入力してください。');
      return;
    }
    setPricingVersions((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, value])),
    }));
    setMessage(`${ids.length}件に価格版を入力しました。`);
  }

  async function submit() {
    setMessage(null);
    if (selected.length === 0) {
      setMessage('原価と価格版を入力した行がありません。');
      return;
    }
    if (reason.trim().length < 3 || !evidenceReference.trim()) {
      setMessage('精算理由と証跡参照を入力してください。');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/ai-usage-cost-reconciliation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, evidenceReference, updates: selected }),
      });
      const body = (await response.json()) as {
        data?: { updated: number; alreadyReconciled: number };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? '精算に失敗しました');
      setMessage(`更新 ${body.data.updated}件、既反映 ${body.data.alreadyReconciled}件`);
      const refreshed = await fetch('/api/admin/ai-usage-cost-reconciliation', {
        cache: 'no-store',
      });
      const refreshedBody = (await refreshed.json()) as { data?: { rows: Row[] } };
      if (refreshed.ok && refreshedBody.data) setRows(refreshedBody.data.rows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '精算に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>原価未確定の精算（SUPER_ADMIN）</h2>
      <p>
        通常の予算管理は月額上限で行います。ここは、原価を自動確定できなかった例外だけを、モデルと状態ごとのまとまりで確認する画面です。
      </p>
      <p>
        課金証跡または承認済み価格表で確認できた記録だけ精算してください。0円は、失敗かつトークン記録がなく、Providerへ送信していないことを運用ログなどで確認できた場合だけまとめて入力できます。
      </p>
      <label>
        精算理由
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </label>
      <label>
        証跡参照（チケット番号・請求書番号など）
        <input
          value={evidenceReference}
          onChange={(event) => setEvidenceReference(event.target.value)}
          maxLength={200}
        />
      </label>
      {rows.length === 0 ? (
        <p>今月の原価未確定記録はありません。</p>
      ) : (
        <>
          <div className="settings-status-list">
            {groups.map((group) => (
              <article className="settings-status-item" key={group.key}>
                <h3>{group.model}</h3>
                <p>
                  {group.provider}／{group.status === 'FAILED' ? '失敗' : '成功'}／
                  {group.rows.length}件
                </p>
                <label>
                  このまとまりの価格版
                  <input
                    aria-label={`${group.key} 共通価格版`}
                    placeholder="例：請求書・公式価格表の版"
                    value={groupPricingVersions[group.key] ?? ''}
                    onChange={(event) =>
                      setGroupPricingVersions((current) => ({
                        ...current,
                        [group.key]: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    applyPricingVersion(
                      group.rows.map((row) => row.id),
                      groupPricingVersions[group.key] ?? '',
                    )
                  }
                >
                  この{group.rows.length}件に価格版を設定
                </button>
                {group.canConfirmNoProviderCost ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => confirmNoProviderCost(group.rows.map((row) => row.id))}
                  >
                    ログ確認済みの{group.rows.length}件を0円として入力
                  </button>
                ) : (
                  <p>
                    原価は請求証跡に合わせて個別入力し、価格版だけを上の欄からまとめて設定できます。
                  </p>
                )}
              </article>
            ))}
          </div>
          <details>
            <summary>個別の原価と入力内容を確認・修正</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>処理</th>
                    <th>状態</th>
                    <th>トークン</th>
                    <th>原価（USDマイクロ）</th>
                    <th>価格版</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.occurredAt).toLocaleString('ja-JP')}</td>
                      <td>
                        {row.taskType}
                        <br />
                        <small>{row.model}</small>
                      </td>
                      <td>{row.status}</td>
                      <td>
                        {row.inputTokens ?? '—'} / {row.outputTokens ?? '—'}
                      </td>
                      <td>
                        <input
                          aria-label={`${row.id} 原価`}
                          inputMode="numeric"
                          value={costs[row.id] ?? ''}
                          onChange={(event) =>
                            setCosts((current) => ({ ...current, [row.id]: event.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${row.id} 価格版`}
                          value={pricingVersions[row.id] ?? ''}
                          onChange={(event) =>
                            setPricingVersions((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <button
        className="button"
        type="button"
        disabled={
          busy || selected.length === 0 || reason.trim().length < 3 || !evidenceReference.trim()
        }
        onClick={() => void submit()}
      >
        {busy ? '精算中…' : `入力した ${selected.length}件を精算`}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

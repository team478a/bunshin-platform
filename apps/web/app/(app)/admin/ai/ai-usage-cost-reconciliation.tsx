'use client';

import { useMemo, useState } from 'react';

interface Row {
  id: string;
  provider: string;
  taskType: string;
  model: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  occurredAt: string;
}

export function AiUsageCostReconciliation({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [pricingVersions, setPricingVersions] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('課金証跡を確認した原価の精算');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () =>
      rows.flatMap((row) => {
        const cost = Number(costs[row.id]);
        const pricingVersion = pricingVersions[row.id]?.trim();
        return Number.isSafeInteger(cost) && cost > 0 && pricingVersion
          ? [{ usageEventId: row.id, estimatedCostUsdMicros: cost, pricingVersion }]
          : [];
      }),
    [costs, pricingVersions, rows],
  );

  async function submit() {
    setMessage(null);
    if (selected.length === 0) {
      setMessage('原価と価格版を入力した行がありません。');
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
        課金証跡または承認済み価格表で確認できた行だけ入力してください。原価を推測して一括入力したり、失敗記録を自動で0円にしたりしません。
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
      )}
      <button
        className="button"
        type="button"
        disabled={busy || selected.length === 0}
        onClick={() => void submit()}
      >
        {busy ? '精算中…' : `入力した ${selected.length}件を精算`}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

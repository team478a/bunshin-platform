'use client';
import { useState, type FormEvent } from 'react';

type Case = { id: string; title: string; observations: Array<{ provider: string }> };

export function TrendBenchmarkEditor({ cases }: { cases: Case[] }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const actionValue = form.get('action');
    const action = typeof actionValue === 'string' ? actionValue : '';
    const payload =
      action === 'CREATE_CASE'
        ? {
            action,
            caseKey: form.get('caseKey'),
            title: form.get('title'),
            query: form.get('query'),
            lookbackDays: Number(form.get('lookbackDays')),
            maximumResults: Number(form.get('maximumResults')),
          }
        : {
            action,
            caseId: form.get('caseId'),
            provider: form.get('provider'),
            successful: form.get('successful') === 'on',
            evidenceLines: form.get('evidenceLines'),
            costUsd: Number(form.get('costUsd')),
            latencyMs: Number(form.get('latencyMs')),
            relevanceRating: Number(form.get('relevanceRating')),
            sourceQualityRating: Number(form.get('sourceQualityRating')),
            notes: form.get('notes'),
          };
    const response = await fetch('/api/admin/trend-provider-benchmark', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setMessage(result.error?.message ?? '保存できませんでした。');
      setBusy(false);
      return;
    }
    window.location.reload();
  }
  return (
    <>
      {message ? <p role="status">{message}</p> : null}
      <section className="settings-card">
        <h2>比較する質問を追加</h2>
        <form onSubmit={(event) => void submit(event)}>
          <input type="hidden" name="action" value="CREATE_CASE" />
          <label>
            短い識別名
            <input name="caseKey" required pattern="[a-z0-9-]{3,80}" placeholder="x-short-video" />
          </label>
          <label>
            画面に出す名前
            <input name="title" required minLength={3} maxLength={200} />
          </label>
          <label>
            検索する質問
            <textarea name="query" required minLength={3} maxLength={1000} />
          </label>
          <label>
            何日前まで調べるか
            <input name="lookbackDays" type="number" defaultValue="3" min="1" max="30" required />
          </label>
          <label>
            必要な根拠の数
            <input name="maximumResults" type="number" defaultValue="3" min="1" max="10" required />
          </label>
          <button disabled={busy}>比較する質問を保存</button>
        </form>
      </section>
      <section className="settings-card">
        <h2>調査結果を記録</h2>
        {cases.length === 0 ? (
          <p>先に比較する質問を作ってください。</p>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <input type="hidden" name="action" value="SAVE_OBSERVATION" />
            <label>
              比較する質問
              <select name="caseId">
                {cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              調査サービス
              <select name="provider">
                <option value="GROK">Grok</option>
                <option value="EXA">Exa</option>
                <option value="FIRECRAWL">Firecrawl</option>
              </select>
            </label>
            <label>
              <input name="successful" type="checkbox" defaultChecked /> 調査に成功した
            </label>
            <label>
              根拠URL（1行に1件。「URL | 公開日」の形）
              <textarea
                name="evidenceLines"
                placeholder="https://example.com/article | 2026-08-24"
              />
            </label>
            <label>
              かかった金額（米ドル）
              <input
                name="costUsd"
                type="number"
                defaultValue="0"
                min="0"
                max="1000"
                step="0.000001"
                required
              />
            </label>
            <label>
              かかった時間（ミリ秒）
              <input
                name="latencyMs"
                type="number"
                defaultValue="0"
                min="0"
                max="600000"
                required
              />
            </label>
            <label>
              内容の合い具合（0〜5）
              <input
                name="relevanceRating"
                type="number"
                defaultValue="3"
                min="0"
                max="5"
                required
              />
            </label>
            <label>
              情報元の信頼度（0〜5）
              <input
                name="sourceQualityRating"
                type="number"
                defaultValue="3"
                min="0"
                max="5"
                required
              />
            </label>
            <label>
              メモ
              <textarea name="notes" maxLength={1000} />
            </label>
            <button disabled={busy}>結果を保存・更新</button>
          </form>
        )}
      </section>
    </>
  );
}

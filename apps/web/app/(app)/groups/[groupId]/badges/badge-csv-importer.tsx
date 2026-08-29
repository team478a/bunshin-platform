'use client';

import { useState } from 'react';

interface ImportResult {
  imported: number;
  errors: { line: number; message: string }[];
}

export function BadgeCsvImporter(props: { workspaceId: string; groupId: string }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(formData: FormData) {
    const file = formData.get('csv');
    if (!(file instanceof File)) return;
    setBusy(true);
    setResult(null);
    const response = await fetch(
      `/api/workspaces/${props.workspaceId}/groups/${props.groupId}/badges/import`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: await file.text() }),
      },
    );
    const body = (await response.json()) as ImportResult & { error?: string };
    setResult(
      response.ok
        ? body
        : { imported: 0, errors: [{ line: 0, message: body.error ?? '登録できませんでした。' }] },
    );
    setBusy(false);
  }

  return (
    <section className="settings-card">
      <h2>CSVでまとめて候補者を登録</h2>
      <p>見出しは email,badge_code,reason の順です。正常な行だけを登録します。</p>
      <form action={upload} className="form-stack">
        <input name="csv" type="file" accept=".csv,text/csv" required />
        <button className="button" disabled={busy} type="submit">
          {busy ? '確認しています…' : 'CSVを確認して登録'}
        </button>
      </form>
      {result ? (
        <div role="status">
          <p>登録できた行：{result.imported}件</p>
          {result.errors.length > 0 ? (
            <>
              <h3>登録できなかった行</h3>
              <ul>
                {result.errors.map((error, index) => (
                  <li key={`${error.line}-${index}`}>
                    {error.line > 0 ? `${error.line}行目：` : ''}
                    {error.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

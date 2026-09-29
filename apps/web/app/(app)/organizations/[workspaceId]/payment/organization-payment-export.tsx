'use client';

import { useRef, useState, type FormEvent } from 'react';
import { organizationPaymentExportPeriod } from '../../../../../src/payments/organization-payment-export-period';

export function OrganizationPaymentExport({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const from = data.get('from');
    const to = data.get('to');
    if (typeof from !== 'string' || typeof to !== 'string') {
      setMessage('受付期間の入力を確認してください。');
      return;
    }
    const params = new URLSearchParams({ from, to });
    let period: ReturnType<typeof organizationPaymentExportPeriod>;
    try {
      period = organizationPaymentExportPeriod(params);
    } catch {
      setMessage('開始日と終了日を両方指定し、開始日が終了日以前になるようにしてください。');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/organizations/${workspaceId}/payments/export?${params}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        setMessage(
          response.status === 413
            ? '対象が10,000件を超えています。受付期間を狭めて再度保存してください。'
            : response.status === 400
              ? '受付期間の入力を確認してください。'
              : response.status === 401
                ? '再度ログインしてから保存してください。'
                : response.status === 403 || response.status === 404
                  ? 'この組織の決済台帳を取得する権限を確認できませんでした。'
                  : 'CSVを取得できませんでした。時間をおいて再度お試しください。',
        );
        return;
      }
      if (!response.headers.get('content-type')?.startsWith('text/csv')) {
        setMessage('CSVを取得できませんでした。再度ログインしてお試しください。');
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `organization-payments-${workspaceId}${period.from ? `-${period.from}-${period.to}` : ''}.csv`;
      document.body.appendChild(link);
      try {
        link.click();
        setMessage('CSVを取得しました。端末の保存先をご確認ください。');
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setMessage('CSVを取得できませんでした。通信状況を確認して再度お試しください。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void download(event)} className="stack stack--compact">
      <p id="payment-export-period-help">
        日本時間の受付日で絞り込みます（入金日・返金日ではありません）。両方空欄なら全期間です。
        1回に保存できるのは10,000件までです。超過時は一部だけのCSVを保存せず、期間の絞り込みをご案内します。
      </p>
      <label>
        受付開始日
        <input
          name="from"
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          disabled={busy}
          aria-describedby="payment-export-period-help"
        />
      </label>
      <label>
        受付終了日（この日を含む）
        <input
          name="to"
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          disabled={busy}
          aria-describedby="payment-export-period-help"
        />
      </label>
      <button className="button button--secondary" type="submit" disabled={busy}>
        {busy ? 'CSVを取得中…' : '決済台帳をCSVで保存する'}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

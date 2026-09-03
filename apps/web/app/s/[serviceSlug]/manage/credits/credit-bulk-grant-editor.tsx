'use client';

import { useState, type FormEvent } from 'react';

type Membership = { id: string; label: string; availableCredits: number };

export function CreditBulkGrantEditor({
  serviceSlug,
  memberships,
}: {
  serviceSlug: string;
  memberships: Membership[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const membershipIds = data
      .getAll('membershipId')
      .filter((value): value is string => typeof value === 'string');
    if (membershipIds.length === 0) {
      setMessage('付与する参加者を1人以上選んでください。');
      return;
    }
    setSaving(true);
    setMessage('一括付与しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/credit-grants`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            membershipIds,
            amount: Number(data.get('amount')),
            reason: data.get('reason'),
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { granted: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? '一括付与できませんでした。');
      setMessage(`${result.data?.granted ?? 0}人へ画像作成回数を付与しました。`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '一括付与できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>複数の参加者へ一括で付与する</h2>
      <p>
        キャンペーン特典など、同じ回数を複数の参加者へ渡す時に使います。減額は個別に行ってください。
      </p>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <fieldset className="field">
          <legend className="field__label">付与する参加者</legend>
          {memberships.map((membership) => (
            <label key={membership.id}>
              <input name="membershipId" type="checkbox" value={membership.id} /> {membership.label}
              （現在 {membership.availableCredits} 回）
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="field__label">1人あたりに追加する回数</span>
          <input
            className="field__control"
            name="amount"
            type="number"
            min="1"
            max="100000"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">付与した理由</span>
          <textarea className="field__control" name="reason" maxLength={1000} required />
        </label>
        <button className="button" disabled={saving} type="submit">
          {saving ? '一括付与しています…' : '選んだ参加者へ付与する'}
        </button>
      </form>
      <p
        aria-live="polite"
        role="status"
        className={message ? 'notice notice--success' : undefined}
      >
        {message}
      </p>
    </section>
  );
}

'use client';

import { useState, type FormEvent } from 'react';

type Membership = { id: string; label: string; availableCredits: number };

export function CreditAdjustmentEditor({
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
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/credit-adjustments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            membershipId: data.get('membershipId'),
            amount: Number(data.get('amount')),
            reason: data.get('reason'),
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { availableCredits: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? '保存できませんでした。');
      setMessage(
        `保存しました。現在の画像作成回数は ${result.data?.availableCredits ?? 0} 回です。`,
      );
      form.reset();
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (memberships.length === 0) {
    return (
      <section className="settings-card">
        <p>回数を調整できる参加者がまだいません。</p>
      </section>
    );
  }

  return (
    <section className="settings-card">
      <h2>参加者の回数を変更する</h2>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field__label">参加者</span>
          <select className="field__control" name="membershipId" required>
            {memberships.map((membership) => (
              <option key={membership.id} value={membership.id}>
                {membership.label}（現在 {membership.availableCredits} 回）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">変更する回数</span>
          <input
            className="field__control"
            name="amount"
            type="number"
            min="-100000"
            max="100000"
            required
          />
          <small>例：3 を入力すると3回追加、-1 を入力すると1回減らします。</small>
        </label>
        <label className="field">
          <span className="field__label">変更した理由</span>
          <textarea className="field__control" name="reason" maxLength={1000} required />
        </label>
        <button className="button" disabled={saving} type="submit">
          {saving ? '保存しています…' : '回数を保存する'}
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

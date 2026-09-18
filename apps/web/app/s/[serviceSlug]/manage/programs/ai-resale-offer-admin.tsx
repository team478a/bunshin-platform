'use client';

import { useState, type FormEvent } from 'react';

type OfferSettings = {
  offeringId: string;
  amountYen: number;
  applicationUrl: string | null;
} | null;

type PendingApplicant = {
  groupMembershipId: string;
  name: string;
  email: string | null;
  offerKind: 'STANDARD' | 'MONITOR';
  offeringId: string;
  amountYen: number;
  requestedAt: string;
};

export function AiResaleOfferAdmin({
  serviceSlug,
  enabled,
  standard,
  monitor,
  pendingApplicants,
}: {
  serviceSlug: string;
  enabled: boolean;
  standard: OfferSettings;
  monitor: OfferSettings;
  pendingApplicants: PendingApplicant[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function request(path: string, body: unknown, success: string) {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? '保存できませんでした。');
      setMessage(`${success} 画面を更新します…`);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
      setSaving(false);
    }
  }

  function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    void request(
      `/api/services/${encodeURIComponent(serviceSlug)}/ai-resale/offers`,
      {
        standardAmountYen: Number(text('standardAmountYen')),
        standardApplicationUrl: text('standardApplicationUrl'),
        monitorAmountYen: Number(text('monitorAmountYen')),
        monitorApplicationUrl: text('monitorApplicationUrl'),
      },
      '90日プログラムの案内を保存しました。',
    );
  }

  function activate(event: FormEvent<HTMLFormElement>, applicant: PendingApplicant) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reference = data.get('paymentConfirmationReference');
    void request(
      `/api/services/${encodeURIComponent(serviceSlug)}/ai-resale/paid-enrollments`,
      {
        groupMembershipId: applicant.groupMembershipId,
        programOfferingId: applicant.offeringId,
        paymentConfirmationReference: typeof reference === 'string' ? reference.trim() : '',
        idempotencyKey: crypto.randomUUID(),
      },
      `${applicant.name}さんの90日プログラムを開始しました。`,
    );
  }

  if (!enabled) return null;
  return (
    <>
      <section className="settings-card program-management-card">
        <p className="eyebrow">AI物販V1</p>
        <h2>DAY7後の90日プログラム</h2>
        <p>
          参加者に表示する金額と外部申込みページを設定します。URLが空欄の場合は、申込み希望を記録して運営者が支払い方法を案内します。
        </p>
        <form className="form-stack" onSubmit={configure}>
          <fieldset className="form-stack">
            <legend>標準プラン</legend>
            <label className="field">
              <span className="field__label">90日一括料金（税込）</span>
              <input
                className="field__control"
                type="number"
                inputMode="numeric"
                min="1"
                max="10000000"
                name="standardAmountYen"
                defaultValue={standard?.amountYen ?? 29800}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">外部申込みURL（任意・HTTPS）</span>
              <input
                className="field__control"
                type="url"
                inputMode="url"
                name="standardApplicationUrl"
                defaultValue={standard?.applicationUrl ?? ''}
                placeholder="https://"
              />
            </label>
          </fieldset>
          <fieldset className="form-stack">
            <legend>価格が高いと回答した人向けモニター</legend>
            <label className="field">
              <span className="field__label">90日一括料金（税込）</span>
              <input
                className="field__control"
                type="number"
                inputMode="numeric"
                min="1"
                max="10000000"
                name="monitorAmountYen"
                defaultValue={monitor?.amountYen ?? 9800}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">外部申込みURL（任意・HTTPS）</span>
              <input
                className="field__control"
                type="url"
                inputMode="url"
                name="monitorApplicationUrl"
                defaultValue={monitor?.applicationUrl ?? ''}
                placeholder="https://"
              />
            </label>
          </fieldset>
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? '保存しています…' : '90日プログラムの案内を保存する'}
          </button>
        </form>
      </section>

      <section className="settings-card program-management-card">
        <p className="eyebrow">外部入金の確認</p>
        <h2>90日プログラムの申込み希望</h2>
        <p>外部で入金を確認した後だけ、確認番号を入力して利用を開始してください。</p>
        {pendingApplicants.length === 0 ? <p>確認待ちの申込みはありません。</p> : null}
        <div className="settings-stack program-management-card__list">
          {pendingApplicants.map((applicant) => (
            <article key={`${applicant.groupMembershipId}:${applicant.offeringId}`}>
              <h3>{applicant.name}</h3>
              <p>
                {applicant.offerKind === 'STANDARD' ? '標準' : 'モニター'}プラン・
                {new Intl.NumberFormat('ja-JP').format(applicant.amountYen)}円
              </p>
              {applicant.email ? <p>{applicant.email}</p> : null}
              <p>
                申込み日時：
                {new Intl.DateTimeFormat('ja-JP', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(applicant.requestedAt))}
              </p>
              <form className="form-stack" onSubmit={(event) => activate(event, applicant)}>
                <label className="field">
                  <span className="field__label">外部決済の確認番号</span>
                  <input
                    className="field__control"
                    name="paymentConfirmationReference"
                    maxLength={160}
                    placeholder="決済管理画面の注文番号など"
                    required
                  />
                </label>
                <button className="button button--primary" type="submit" disabled={saving}>
                  入金確認済みとして90日利用を開始する
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>
      {message ? (
        <p className="notice notice--success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--danger" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

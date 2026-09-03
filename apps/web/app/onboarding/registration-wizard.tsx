'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Industry = { id: string; key: string; name: string; description: string | null };
type Values = {
  currentStep: number;
  primaryIndustryId: string;
  otherIndustryText: string;
  primaryPurpose: string;
  activityName: string;
  businessName: string;
  region: string;
  productService: string;
  socialUrl: string;
  notificationConsent: boolean;
};
const purposeOptions = [
  ['ATTRACT', '集客'],
  ['RESERVATION', '予約'],
  ['SALES', '販売'],
  ['RECRUITING', '採用'],
  ['AWARENESS', '認知'],
  ['RETENTION', '継続'],
] as const;

function initialString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function RegistrationWizard({
  industries,
  initial,
  returnTo,
}: {
  industries: Industry[];
  initial: Record<string, unknown> | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    currentStep: Number(initial?.currentStep ?? 1),
    primaryIndustryId: initialString(initial?.primaryIndustryId),
    otherIndustryText: initialString(initial?.otherIndustryText),
    primaryPurpose: initialString(initial?.primaryPurpose),
    activityName: initialString(initial?.activityName),
    businessName: initialString(initial?.businessName),
    region: initialString(initial?.region),
    productService: initialString(initial?.productService),
    socialUrl: Array.isArray(initial?.socialProfiles)
      ? String((initial.socialProfiles[0] as { url?: string } | undefined)?.url ?? '')
      : '',
    notificationConsent: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedIndustry = industries.find(({ id }) => id === values.primaryIndustryId);
  const update = (key: keyof Values, value: string | number) =>
    setValues((current) => ({ ...current, [key]: value }));
  async function save(nextStep: number, complete = false) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentStep: nextStep,
          primaryIndustryId: values.primaryIndustryId || null,
          otherIndustryText: values.otherIndustryText || null,
          primaryPurpose: values.primaryPurpose || null,
          activityName: values.activityName || null,
          businessName: values.businessName || null,
          region: values.region || null,
          productService: values.productService || null,
          socialProfiles: values.socialUrl ? [{ platform: 'OTHER', url: values.socialUrl }] : [],
          notificationConsent: values.notificationConsent,
          returnTo,
          complete,
        }),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { destination?: string };
      if (complete) {
        router.push(result.destination ?? '/bunshins');
        router.refresh();
        return;
      }
      setValues((current) => ({ ...current, currentStep: nextStep }));
    } catch {
      setError('保存できませんでした。入力内容を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="app-page onboarding-page">
      <header className="onboarding-header">
        <p className="eyebrow">最初のかんたん設定</p>
        <h1>あなたに合う投稿案を届ける準備</h1>
        <p>入力内容は途中でも保存され、次回は続きから再開できます。</p>
        <div className="progress-bar">
          <span style={{ width: `${values.currentStep * 25}%` }} />
        </div>
      </header>
      <section className="wizard-card">
        {values.currentStep === 1 && (
          <>
            <h2>主な業種を選んでください</h2>
            <div className="onboarding-options">
              {industries.map((item) => (
                <button
                  type="button"
                  className={values.primaryIndustryId === item.id ? 'is-selected' : ''}
                  key={item.id}
                  onClick={() => update('primaryIndustryId', item.id)}
                >
                  <span>{item.name}</span>
                  <small>{item.description ?? '選択する'}</small>
                </button>
              ))}
            </div>
            {selectedIndustry?.key === 'OTHER' && (
              <label className="field">
                <span className="field__label">業種を入力</span>
                <input
                  className="field__control"
                  value={values.otherIndustryText}
                  onChange={(event) => update('otherIndustryText', event.target.value)}
                />
              </label>
            )}
          </>
        )}
        {values.currentStep === 2 && (
          <>
            <h2>SNS投稿の主な目的は何ですか？</h2>
            <div className="onboarding-options">
              {purposeOptions.map(([key, label]) => (
                <button
                  type="button"
                  className={values.primaryPurpose === key ? 'is-selected' : ''}
                  key={key}
                  onClick={() => update('primaryPurpose', key)}
                >
                  <span>{label}</span>
                  <small>主目的にする</small>
                </button>
              ))}
            </div>
          </>
        )}
        {values.currentStep === 3 && (
          <>
            <h2>活動について教えてください</h2>
            {[
              ['activityName', '名前・活動名（必須）'],
              ['businessName', '店舗・会社名'],
              ['region', '地域'],
              ['productService', '商品・サービス'],
            ].map(([key, label]) => (
              <label className="field" key={key}>
                <span className="field__label">{label}</span>
                <input
                  className="field__control"
                  value={String(values[key as keyof Values])}
                  onChange={(event) => update(key as keyof Values, event.target.value)}
                />
              </label>
            ))}
          </>
        )}
        {values.currentStep === 4 && (
          <>
            <h2>通知とSNSの設定</h2>
            <label className="field">
              <span className="field__label">SNSプロフィールURL（任意）</span>
              <input
                className="field__control"
                type="url"
                value={values.socialUrl}
                onChange={(event) => update('socialUrl', event.target.value)}
                placeholder="https://"
              />
            </label>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={values.notificationConsent}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    notificationConsent: event.target.checked,
                  }))
                }
              />
              <span>公式LINEで投稿案や重要なお知らせを受け取る</span>
            </label>
            <p>通知はあとから停止できます。プロフィール内容もアカウント画面で変更できます。</p>
          </>
        )}
        {error && (
          <div className="notice notice--danger" role="alert">
            {error}
          </div>
        )}
        <div className="wizard-actions">
          {values.currentStep > 1 && (
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => void save(values.currentStep - 1)}
            >
              戻る
            </button>
          )}
          <button
            className="button button--primary"
            type="button"
            disabled={
              busy ||
              (values.currentStep === 1 && !values.primaryIndustryId) ||
              (values.currentStep === 2 && !values.primaryPurpose) ||
              (values.currentStep === 3 && !values.activityName)
            }
            onClick={() => void save(Math.min(4, values.currentStep + 1), values.currentStep === 4)}
          >
            {busy ? '保存中…' : values.currentStep === 4 ? '設定を完了する' : '保存して次へ'}
          </button>
        </div>
      </section>
    </main>
  );
}

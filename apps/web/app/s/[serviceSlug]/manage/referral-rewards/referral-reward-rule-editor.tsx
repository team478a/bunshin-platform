'use client';

import { useState, type FormEvent } from 'react';

type Milestone = 'ONBOARDING_COMPLETED' | 'FIRST_POST_REPORTED';

interface Rule {
  id: string;
  ruleKey: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED';
  milestone: Milestone;
  recipient: 'REFERRER' | 'REFERRED';
  creditAmount: number;
  expiresAfterDays: number | null;
  monthlyGrantLimit: number | null;
  createdAt: string;
}

const cards: { milestone: Milestone; ruleKey: string; title: string; description: string }[] = [
  {
    milestone: 'ONBOARDING_COMPLETED',
    ruleKey: 'onboarding-completed',
    title: '初期設定を終えた時',
    description: '紹介された人が、最初の質問への回答を完了した時に渡します。',
  },
  {
    milestone: 'FIRST_POST_REPORTED',
    ruleKey: 'first-post-reported',
    title: '最初の投稿を報告した時',
    description: '紹介された人が「投稿しました」を押した時に渡します。',
  },
];

export function ReferralRewardRuleEditor({
  serviceSlug,
  rules,
}: {
  serviceSlug: string;
  rules: Rule[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>, card: (typeof cards)[number]) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const numeric = (name: string) => {
      const raw = data.get(name);
      const value = typeof raw === 'string' ? raw.trim() : '';
      return value ? Number(value) : null;
    };
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/referral-reward-rules`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ruleKey: card.ruleKey,
            milestone: card.milestone,
            recipient: data.get('recipient'),
            creditAmount: Number(data.get('creditAmount')),
            expiresAfterDays: numeric('expiresAfterDays'),
            monthlyGrantLimit: numeric('monthlyGrantLimit'),
            enabled: data.has('enabled'),
          }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '保存できませんでした。');
      setMessage('紹介特典を保存しました。');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className={message ? 'notice notice--success' : undefined}
      >
        {message}
      </p>
      {cards.map((card) => {
        const rule = rules.find((item) => item.ruleKey === card.ruleKey);
        return (
          <section className="settings-card" key={card.ruleKey}>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
            <p>現在：{rule?.status === 'ACTIVE' ? `有効（第${rule.version}版）` : '停止中'}</p>
            <form className="form-stack" onSubmit={(event) => void submit(event, card)}>
              <label className="field">
                <span className="field__label">誰に渡すか</span>
                <select
                  className="field__control"
                  name="recipient"
                  defaultValue={rule?.recipient ?? 'REFERRER'}
                >
                  <option value="REFERRER">紹介した人</option>
                  <option value="REFERRED">紹介された人</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">渡す画像作成回数</span>
                <input
                  className="field__control"
                  name="creditAmount"
                  type="number"
                  min="1"
                  max="100000"
                  required
                  defaultValue={rule?.creditAmount ?? 1}
                />
              </label>
              <label className="field">
                <span className="field__label">使える日数（空欄なら期限なし）</span>
                <input
                  className="field__control"
                  name="expiresAfterDays"
                  type="number"
                  min="1"
                  max="3650"
                  defaultValue={rule?.expiresAfterDays ?? ''}
                />
              </label>
              <label className="field">
                <span className="field__label">1人に1か月で渡す上限（空欄なら上限なし）</span>
                <input
                  className="field__control"
                  name="monthlyGrantLimit"
                  type="number"
                  min="1"
                  max="100000"
                  defaultValue={rule?.monthlyGrantLimit ?? ''}
                />
              </label>
              <label>
                <input name="enabled" type="checkbox" defaultChecked={rule?.status === 'ACTIVE'} />{' '}
                この特典を使う
              </label>
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? '保存中…' : '特典を保存'}
              </button>
            </form>
          </section>
        );
      })}
    </>
  );
}

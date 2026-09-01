'use client';

import { useState, type FormEvent } from 'react';

type CommercialSetting = {
  planName: string;
  billingMode: 'FREE' | 'MANUAL_INVOICE' | 'EXTERNAL_BILLING';
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ENDED';
  monthlyPriceYen: number | null;
  includedMemberLimit: number | null;
  monthlyAiGenerationLimit: number | null;
  monthlyImageGenerationLimit: number | null;
  monthlyVideoGenerationLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

const numeric = (formData: FormData, name: string) => {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return null;
  return Number(value);
};

export function ServiceCommercialSettingEditor({
  serviceId,
  setting,
}: {
  serviceId: string;
  setting: CommercialSetting | null;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const startsAt = formData.get('startsAt');
    const endsAt = formData.get('endsAt');
    setSaving(true);
    setMessage('販売プランを保存しています…');
    try {
      const response = await fetch(
        `/api/admin/services/${encodeURIComponent(serviceId)}/commercial-settings`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            planName: formData.get('planName'),
            billingMode: formData.get('billingMode'),
            status: formData.get('status'),
            monthlyPriceYen: numeric(formData, 'monthlyPriceYen'),
            includedMemberLimit: numeric(formData, 'includedMemberLimit'),
            monthlyAiGenerationLimit: numeric(formData, 'monthlyAiGenerationLimit'),
            monthlyImageGenerationLimit: numeric(formData, 'monthlyImageGenerationLimit'),
            monthlyVideoGenerationLimit: numeric(formData, 'monthlyVideoGenerationLimit'),
            startsAt:
              typeof startsAt === 'string' && startsAt ? new Date(startsAt).toISOString() : null,
            endsAt: typeof endsAt === 'string' && endsAt ? new Date(endsAt).toISOString() : null,
            reason: formData.get('reason'),
          }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? '販売プランを保存できませんでした。');
      setMessage('販売プランを保存しました。画面を更新します…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '販売プランを保存できませんでした。');
      setSaving(false);
    }
  }

  return (
    <details className="settings-card">
      <summary>販売プラン・契約上限を設定する</summary>
      <p>
        ここはサービス運営者向けの契約情報です。決済・請求書発行はまだ外部サービスで行い、カード情報や決済の秘密情報は保存しません。
      </p>
      <p>
        機能そのものの利用可否・利用回数は、サービス内の「参加者と担当者」で設定する機能上限が正です。
      </p>
      <form className="admin-form-grid" onSubmit={(event) => void submit(event)}>
        <label>
          プラン名
          <input
            defaultValue={setting?.planName ?? '無料プラン'}
            maxLength={120}
            name="planName"
            required
          />
        </label>
        <label>
          請求方法
          <select defaultValue={setting?.billingMode ?? 'FREE'} name="billingMode">
            <option value="FREE">無料</option>
            <option value="MANUAL_INVOICE">請求書・手作業</option>
            <option value="EXTERNAL_BILLING">外部の決済サービス</option>
          </select>
        </label>
        <label>
          契約状態
          <select defaultValue={setting?.status ?? 'DRAFT'} name="status">
            <option value="DRAFT">準備中</option>
            <option value="ACTIVE">利用中</option>
            <option value="SUSPENDED">一時停止</option>
            <option value="ENDED">終了</option>
          </select>
        </label>
        <label>
          月額（円）
          <input
            defaultValue={setting?.monthlyPriceYen ?? ''}
            min="0"
            name="monthlyPriceYen"
            type="number"
          />
        </label>
        <label>
          契約人数の上限
          <input
            defaultValue={setting?.includedMemberLimit ?? ''}
            min="1"
            name="includedMemberLimit"
            type="number"
          />
        </label>
        <label>
          月あたりのAI作成目安
          <input
            defaultValue={setting?.monthlyAiGenerationLimit ?? ''}
            min="1"
            name="monthlyAiGenerationLimit"
            type="number"
          />
        </label>
        <label>
          月あたりの画像作成目安
          <input
            defaultValue={setting?.monthlyImageGenerationLimit ?? ''}
            min="1"
            name="monthlyImageGenerationLimit"
            type="number"
          />
        </label>
        <label>
          月あたりの動画作成目安
          <input
            defaultValue={setting?.monthlyVideoGenerationLimit ?? ''}
            min="1"
            name="monthlyVideoGenerationLimit"
            type="number"
          />
        </label>
        <label>
          契約開始（任意）
          <input
            defaultValue={setting?.startsAt?.slice(0, 16) ?? ''}
            name="startsAt"
            type="datetime-local"
          />
        </label>
        <label>
          契約終了（任意）
          <input
            defaultValue={setting?.endsAt?.slice(0, 16) ?? ''}
            name="endsAt"
            type="datetime-local"
          />
        </label>
        <label>
          変更理由
          <input
            name="reason"
            required
            maxLength={1000}
            placeholder="例：テストサービスの契約条件を登録"
          />
        </label>
        <button disabled={saving} type="submit">
          {saving ? '保存中…' : '販売プランを保存する'}
        </button>
      </form>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </details>
  );
}

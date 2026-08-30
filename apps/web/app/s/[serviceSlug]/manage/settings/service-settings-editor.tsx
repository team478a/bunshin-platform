'use client';

import { useState, type FormEvent } from 'react';
import { readServiceOnboardingSettings } from '../../../../../src/services/service-onboarding-settings';

export interface ServiceSettingsValue {
  displayName: string;
  description: string;
  operatorName: string;
  contactEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  brand: {
    logoUrl: string | null;
    iconUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };
  registration: {
    mode: 'PUBLIC' | 'INVITATION_ONLY' | 'APPROVAL_REQUIRED' | 'CLOSED';
    emailEnabled: boolean;
    lineEnabled: boolean;
    inviteCodeEnabled: boolean;
    referralEnabled: boolean;
    onboardingConfig: unknown;
    surveyConfig: unknown;
  };
}

export function ServiceSettingsEditor({
  serviceSlug,
  value,
}: {
  serviceSlug: string;
  value: ServiceSettingsValue;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const onboarding = readServiceOnboardingSettings(
    value.registration.onboardingConfig,
    value.registration.surveyConfig,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const field = data.get(name);
      return typeof field === 'string' ? field : '';
    };
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(`/api/services/${encodeURIComponent(serviceSlug)}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: text('displayName'),
          description: text('description'),
          operatorName: text('operatorName'),
          contactEmail: text('contactEmail'),
          termsUrl: text('termsUrl'),
          privacyUrl: text('privacyUrl'),
          logoUrl: text('logoUrl'),
          iconUrl: text('iconUrl'),
          faviconUrl: text('faviconUrl'),
          primaryColor: text('primaryColor'),
          secondaryColor: text('secondaryColor'),
          fontFamily: text('fontFamily'),
          registrationMode: text('registrationMode'),
          emailEnabled: data.has('emailEnabled'),
          lineEnabled: data.has('lineEnabled'),
          inviteCodeEnabled: data.has('inviteCodeEnabled'),
          referralEnabled: data.has('referralEnabled'),
          welcomeTitle: text('welcomeTitle'),
          welcomeMessage: text('welcomeMessage'),
          onboardingQuestions: text('onboardingQuestions')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
          reason: text('reason'),
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '設定を保存できませんでした。');
      setMessage('設定を保存しました。サービス画面にも反映されます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form-grid" onSubmit={(event) => void submit(event)}>
      <label>
        サービス名
        <input name="displayName" required maxLength={120} defaultValue={value.displayName} />
      </label>
      <label>
        運営者名
        <input name="operatorName" required maxLength={160} defaultValue={value.operatorName} />
      </label>
      <label>
        サービスの説明
        <textarea
          name="description"
          required
          maxLength={1000}
          rows={4}
          defaultValue={value.description}
        />
      </label>
      <label>
        問い合わせメール
        <input
          name="contactEmail"
          type="email"
          maxLength={320}
          defaultValue={value.contactEmail ?? ''}
        />
      </label>
      <label>
        ロゴ画像URL
        <input
          name="logoUrl"
          type="url"
          defaultValue={value.brand.logoUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        アイコン画像URL
        <input
          name="iconUrl"
          type="url"
          defaultValue={value.brand.iconUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        ブラウザーアイコンURL
        <input
          name="faviconUrl"
          type="url"
          defaultValue={value.brand.faviconUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        メインカラー
        <input name="primaryColor" type="color" defaultValue={value.brand.primaryColor} />
      </label>
      <label>
        サブカラー
        <input name="secondaryColor" type="color" defaultValue={value.brand.secondaryColor} />
      </label>
      <label>
        文字の種類
        <select name="fontFamily" defaultValue={value.brand.fontFamily}>
          <option value="system-ui">読みやすい標準文字</option>
          <option value="sans-serif">すっきりした文字</option>
          <option value="serif">落ち着いた文字</option>
        </select>
      </label>
      <label>
        利用規約URL
        <input
          name="termsUrl"
          type="url"
          defaultValue={value.termsUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        プライバシーポリシーURL
        <input
          name="privacyUrl"
          type="url"
          defaultValue={value.privacyUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        新しい人の参加方法
        <select name="registrationMode" defaultValue={value.registration.mode}>
          <option value="INVITATION_ONLY">招待された人だけ</option>
          <option value="PUBLIC">誰でも参加できる</option>
          <option value="APPROVAL_REQUIRED">管理者が確認してから参加</option>
          <option value="CLOSED">新しい参加を止める</option>
        </select>
      </label>
      <fieldset>
        <legend>ログイン・参加に使う方法</legend>
        <label>
          <input
            name="emailEnabled"
            type="checkbox"
            defaultChecked={value.registration.emailEnabled}
          />{' '}
          メールを使う
        </label>
        <label>
          <input
            name="lineEnabled"
            type="checkbox"
            defaultChecked={value.registration.lineEnabled}
          />{' '}
          LINEを使う
        </label>
        <label>
          <input
            name="inviteCodeEnabled"
            type="checkbox"
            defaultChecked={value.registration.inviteCodeEnabled}
          />{' '}
          招待コードを使う
        </label>
        <label>
          <input
            name="referralEnabled"
            type="checkbox"
            defaultChecked={value.registration.referralEnabled}
          />{' '}
          紹介元を記録する
        </label>
        <small>メールかLINEのどちらか一つは必ず選んでください。</small>
      </fieldset>
      <fieldset>
        <legend>初めて参加する人への案内</legend>
        <label>
          最初に表示する見出し
          <input
            name="welcomeTitle"
            maxLength={120}
            defaultValue={onboarding.welcomeTitle}
            placeholder="例：一緒に投稿を始めましょう"
          />
        </label>
        <label>
          最初に表示する説明
          <textarea
            name="welcomeMessage"
            maxLength={1000}
            rows={4}
            defaultValue={onboarding.welcomeMessage}
            placeholder="このサービスでできることを、やさしい言葉で説明します。"
          />
        </label>
        <label>
          最初に聞く質問
          <textarea
            name="onboardingQuestions"
            rows={7}
            defaultValue={onboarding.questions.join('\n')}
            placeholder={'1行に1つ入力します。\n例：どのSNSを使いたいですか？'}
          />
          <small>1行に1問、最大7問です。答えを迷わない具体的な質問にしてください。</small>
        </label>
      </fieldset>
      <label>
        変更した理由
        <input name="reason" required maxLength={1000} placeholder="例：新しいロゴへ変更" />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? '保存中…' : '設定を保存する'}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import {
  DEFAULT_SERVICE_PROFILE_QUESTIONS,
  readServiceAnnouncement,
  readServiceOnboardingSettings,
  type ServiceProfileQuestionSettings,
} from '../../../../../src/services/service-onboarding-settings';

const profileQuestionLabels: Record<keyof ServiceProfileQuestionSettings, string> = {
  industry: '業種',
  purpose: '利用・発信の目的',
  activityName: '活動名',
  businessName: '店舗・会社名',
  region: '活動地域',
  productService: '商品・サービス',
  socialProfile: 'SNSプロフィール',
  notificationConsent: 'LINE通知の同意',
};

export function suggestedProfileQuestions(organizationType: string, operationStyle: string) {
  const next = { ...DEFAULT_SERVICE_PROFILE_QUESTIONS };
  if (['COMMUNITY', 'MEMBERSHIP', 'MEDIA'].includes(organizationType)) {
    next.industry = false;
    next.businessName = false;
    next.productService = false;
  }
  if (organizationType === 'EDUCATION') {
    next.industry = false;
    next.businessName = false;
  }
  if (operationStyle === 'INFORMATION') {
    next.purpose = false;
    next.productService = false;
    next.socialProfile = false;
  }
  if (operationStyle === 'NETWORK') next.productService = false;
  return next;
}

function dateTimeInputValue(value: string | null) {
  if (!value) return '';
  return new Date(value)
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

export interface ServiceSettingsValue {
  displayName: string;
  description: string;
  operatorName: string;
  contactEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  trendResearchEnabled?: boolean;
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
  const [profileQuestions, setProfileQuestions] = useState(onboarding.profileQuestions);
  const [organizationType, setOrganizationType] = useState('MEDIA');
  const [operationStyle, setOperationStyle] = useState('INFORMATION');
  const announcement = readServiceAnnouncement(value.registration.onboardingConfig);

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
          trendResearchEnabled: data.has('trendResearchEnabled'),
          welcomeTitle: text('welcomeTitle'),
          welcomeMessage: text('welcomeMessage'),
          announcementEnabled: data.has('announcementEnabled'),
          announcementTitle: text('announcementTitle'),
          announcementMessage: text('announcementMessage'),
          announcementStartsAt: text('announcementStartsAt'),
          announcementEndsAt: text('announcementEndsAt'),
          onboardingQuestions: text('onboardingQuestions')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
          profileQuestions,
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
    <form
      className="admin-form-grid service-settings-form"
      onSubmit={(event) => void submit(event)}
    >
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
        <legend>話題を使った投稿案</legend>
        <label>
          <input
            name="trendResearchEnabled"
            type="checkbox"
            defaultChecked={value.trendResearchEnabled ?? true}
          />{' '}
          今話題になっていることを、投稿案づくりに使う
        </label>
        <small>
          オフにすると、このサービスの新しい話題調査と、話題を使った投稿案への反映を止めます。すでに作られた投稿案は消えません。
        </small>
        <small>調査サービスや費用の設定は、システム管理者が管理します。</small>
      </fieldset>
      <fieldset>
        <legend>参加者へのお知らせ</legend>
        <label>
          <input name="announcementEnabled" type="checkbox" defaultChecked={announcement.enabled} />{' '}
          サービスホームにお知らせを表示する
        </label>
        <label>
          見出し
          <input
            name="announcementTitle"
            maxLength={120}
            defaultValue={announcement.title}
            placeholder="例：今週の投稿テーマについて"
          />
        </label>
        <label>
          内容
          <textarea
            name="announcementMessage"
            maxLength={1000}
            rows={4}
            defaultValue={announcement.message}
            placeholder="参加者に伝えたいことを、やさしい言葉で書きます。"
          />
        </label>
        <label>
          表示を始める日時（空欄ならすぐ表示）
          <input
            name="announcementStartsAt"
            type="datetime-local"
            defaultValue={dateTimeInputValue(announcement.startsAt)}
          />
        </label>
        <label>
          表示を終える日時（空欄なら表示を続ける）
          <input
            name="announcementEndsAt"
            type="datetime-local"
            defaultValue={dateTimeInputValue(announcement.endsAt)}
          />
        </label>
        <small>
          日本時間で予約できます。メンテナンスや今週の案内に使えます。表示を止めると参加者のホームから非表示になります。LINE送信や機能停止は行いません。
        </small>
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
        <section className="settings-card">
          <h3>登録時に聞く項目を自動提案</h3>
          <p>
            運営団体と運営方法を選ぶと、参加者に必要な質問だけを提案します。提案後に個別に変更できます。
          </p>
          <label>
            運営団体の種類
            <select
              value={organizationType}
              onChange={(event) => setOrganizationType(event.target.value)}
            >
              <option value="MEDIA">メディア・情報発信</option>
              <option value="COMMUNITY">コミュニティ</option>
              <option value="MEMBERSHIP">会員組織</option>
              <option value="EDUCATION">教育・スクール</option>
              <option value="BUSINESS">事業者支援</option>
              <option value="OTHER">その他</option>
            </select>
          </label>
          <label>
            主な運営方法
            <select
              value={operationStyle}
              onChange={(event) => setOperationStyle(event.target.value)}
            >
              <option value="INFORMATION">情報を届ける</option>
              <option value="PROGRAM">講座・プログラムを運営する</option>
              <option value="NETWORK">交流・コミュニティを運営する</option>
              <option value="SUPPORT">個別支援を行う</option>
            </select>
          </label>
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              setProfileQuestions(suggestedProfileQuestions(organizationType, operationStyle))
            }
          >
            おすすめの質問を反映する
          </button>
        </section>
        <fieldset>
          <legend>共通プロフィールで聞く項目</legend>
          {(Object.keys(profileQuestionLabels) as Array<keyof ServiceProfileQuestionSettings>).map(
            (key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={profileQuestions[key]}
                  onChange={(event) =>
                    setProfileQuestions((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />{' '}
                {profileQuestionLabels[key]}
              </label>
            ),
          )}
        </fieldset>
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
      <button className="button button--primary" type="submit" disabled={saving}>
        {saving ? '保存中…' : '設定を保存する'}
      </button>
      {message ? (
        <p className="notice notice--success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}

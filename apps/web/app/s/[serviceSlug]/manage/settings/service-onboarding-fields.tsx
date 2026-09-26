import type { Dispatch, SetStateAction } from 'react';
import type { ServiceProfileQuestionSettings } from '../../../../../src/services/service-onboarding-settings';
import { DailyIdeaDeliveryFields } from './daily-idea-delivery-fields';
import {
  suggestedOnboardingCopy,
  suggestedProfileQuestions,
} from './service-registration-question-suggestions';
import type {
  AudioTrackOption,
  DailyIdeaDeliverySettings,
  VisualCharacterOption,
} from './service-settings-types';

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

export function ServiceOnboardingFields({
  serviceSlug,
  profileQuestions,
  setProfileQuestions,
  businessFreeSettingsLocked,
  businessProfileEnabled,
  setBusinessProfileEnabled,
  dailyIdeaDelivery,
  setDailyIdeaDelivery,
  organizationType,
  setOrganizationType,
  operationStyle,
  setOperationStyle,
  welcomeTitle,
  setWelcomeTitle,
  welcomeMessage,
  setWelcomeMessage,
  onboardingQuestions,
  setOnboardingQuestions,
  visualCharacters,
  audioTracks,
}: {
  serviceSlug: string;
  profileQuestions: ServiceProfileQuestionSettings;
  setProfileQuestions: Dispatch<SetStateAction<ServiceProfileQuestionSettings>>;
  businessFreeSettingsLocked: boolean;
  businessProfileEnabled: boolean;
  setBusinessProfileEnabled: Dispatch<SetStateAction<boolean>>;
  dailyIdeaDelivery: DailyIdeaDeliverySettings;
  setDailyIdeaDelivery: Dispatch<SetStateAction<DailyIdeaDeliverySettings>>;
  organizationType: string;
  setOrganizationType: Dispatch<SetStateAction<string>>;
  operationStyle: string;
  setOperationStyle: Dispatch<SetStateAction<string>>;
  welcomeTitle: string;
  setWelcomeTitle: Dispatch<SetStateAction<string>>;
  welcomeMessage: string;
  setWelcomeMessage: Dispatch<SetStateAction<string>>;
  onboardingQuestions: string;
  setOnboardingQuestions: Dispatch<SetStateAction<string>>;
  visualCharacters: VisualCharacterOption[];
  audioTracks: AudioTrackOption[];
}) {
  return (
    <fieldset>
      <legend>初めて参加する人への案内</legend>
      <label>
        最初に表示する見出し
        <input
          name="welcomeTitle"
          maxLength={120}
          value={welcomeTitle}
          onChange={(event) => setWelcomeTitle(event.target.value)}
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
            <option value="PERSONALIZED_SOCIAL_CONTENT">利用者ごとのSNS投稿案を提供する</option>
            <option value="PROGRAM">講座・プログラムを運営する</option>
            <option value="NETWORK">交流・コミュニティを運営する</option>
            <option value="SUPPORT">個別支援を行う</option>
          </select>
        </label>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            setProfileQuestions(suggestedProfileQuestions(organizationType, operationStyle));
            const copy = suggestedOnboardingCopy(operationStyle);
            if (copy) {
              setWelcomeTitle(copy.welcomeTitle);
              setWelcomeMessage(copy.welcomeMessage);
              setOnboardingQuestions(copy.questions.join('\n'));
            }
          }}
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
      <DailyIdeaDeliveryFields
        serviceSlug={serviceSlug}
        businessFreeSettingsLocked={businessFreeSettingsLocked}
        businessProfileEnabled={businessProfileEnabled}
        setBusinessProfileEnabled={setBusinessProfileEnabled}
        dailyIdeaDelivery={dailyIdeaDelivery}
        setDailyIdeaDelivery={setDailyIdeaDelivery}
        visualCharacters={visualCharacters}
        audioTracks={audioTracks}
      />
      <label>
        最初に表示する説明
        <textarea
          name="welcomeMessage"
          maxLength={1000}
          rows={4}
          value={welcomeMessage}
          onChange={(event) => setWelcomeMessage(event.target.value)}
          placeholder="このサービスでできることを、やさしい言葉で説明します。"
        />
      </label>
      <label>
        最初に聞く質問
        <textarea
          name="onboardingQuestions"
          rows={7}
          value={onboardingQuestions}
          onChange={(event) => setOnboardingQuestions(event.target.value)}
          placeholder={'1行に1つ入力します。\n例：どのSNSを使いたいですか？'}
        />
        <small>1行に1問、最大7問です。答えを迷わない具体的な質問にしてください。</small>
      </label>
    </fieldset>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import {
  readServiceAnnouncement,
  readServiceOnboardingSettings,
} from '../../../../../src/services/service-onboarding-settings';
import { enforceBusinessDailyServiceSettings } from '../../../../../src/services/business-daily-service-settings';
import { ServiceBasicsFields } from './service-basics-fields';
import { ServiceOnboardingFields } from './service-onboarding-fields';
import type {
  AudioTrackOption,
  ServiceSettingsValue,
  VisualCharacterOption,
} from './service-settings-types';

export {
  suggestedOnboardingCopy,
  suggestedProfileQuestions,
} from './service-registration-question-suggestions';
export type { ServiceSettingsValue } from './service-settings-types';

export function ServiceSettingsEditor({
  serviceSlug,
  value,
  visualCharacters,
  audioTracks,
}: {
  serviceSlug: string;
  value: ServiceSettingsValue;
  visualCharacters: VisualCharacterOption[];
  audioTracks: AudioTrackOption[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const onboarding = readServiceOnboardingSettings(
    value.registration.onboardingConfig,
    value.registration.surveyConfig,
  );
  const businessFreeSettingsLocked = onboarding.businessProfileEnabled;
  const [profileQuestions, setProfileQuestions] = useState(onboarding.profileQuestions);
  const [businessProfileEnabled, setBusinessProfileEnabled] = useState(
    onboarding.businessProfileEnabled,
  );
  const [businessProfileInputMode, setBusinessProfileInputMode] = useState(
    onboarding.businessProfileInputMode,
  );
  const [dailyIdeaDelivery, setDailyIdeaDelivery] = useState(
    enforceBusinessDailyServiceSettings({
      businessProfileEnabled: businessFreeSettingsLocked,
      emailEnabled: value.registration.emailEnabled,
      lineEnabled: value.registration.lineEnabled,
      inviteCodeEnabled: value.registration.inviteCodeEnabled,
      referralEnabled: value.registration.referralEnabled,
      dailyIdeaDelivery: onboarding.dailyIdeaDelivery,
    }).dailyIdeaDelivery,
  );
  const [organizationType, setOrganizationType] = useState('MEDIA');
  const [operationStyle, setOperationStyle] = useState('INFORMATION');
  const [welcomeTitle, setWelcomeTitle] = useState(onboarding.welcomeTitle);
  const [welcomeMessage, setWelcomeMessage] = useState(onboarding.welcomeMessage);
  const [onboardingQuestions, setOnboardingQuestions] = useState(onboarding.questions.join('\n'));
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
          inviteCodeEnabled: businessFreeSettingsLocked ? false : data.has('inviteCodeEnabled'),
          referralEnabled: businessFreeSettingsLocked ? false : data.has('referralEnabled'),
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
          businessProfileEnabled,
          businessProfileInputMode,
          dailyIdeaDelivery,
          reason: text('reason'),
        }),
      });
      const result = (await response.json()) as {
        error?: { message?: string; requestId?: string };
      };
      if (!response.ok) {
        const message = result.error?.message ?? '設定を保存できませんでした。';
        throw new Error(
          result.error?.requestId
            ? `${message}（問い合わせ番号: ${result.error.requestId}）`
            : message,
        );
      }
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
      <ServiceBasicsFields
        value={value}
        businessFreeSettingsLocked={businessFreeSettingsLocked}
        announcement={announcement}
      />
      <ServiceOnboardingFields
        serviceSlug={serviceSlug}
        profileQuestions={profileQuestions}
        setProfileQuestions={setProfileQuestions}
        businessFreeSettingsLocked={businessFreeSettingsLocked}
        businessProfileEnabled={businessProfileEnabled}
        setBusinessProfileEnabled={setBusinessProfileEnabled}
        businessProfileInputMode={businessProfileInputMode}
        setBusinessProfileInputMode={setBusinessProfileInputMode}
        dailyIdeaDelivery={dailyIdeaDelivery}
        setDailyIdeaDelivery={setDailyIdeaDelivery}
        organizationType={organizationType}
        setOrganizationType={setOrganizationType}
        operationStyle={operationStyle}
        setOperationStyle={setOperationStyle}
        welcomeTitle={welcomeTitle}
        setWelcomeTitle={setWelcomeTitle}
        welcomeMessage={welcomeMessage}
        setWelcomeMessage={setWelcomeMessage}
        onboardingQuestions={onboardingQuestions}
        setOnboardingQuestions={setOnboardingQuestions}
        visualCharacters={visualCharacters}
        audioTracks={audioTracks}
      />
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

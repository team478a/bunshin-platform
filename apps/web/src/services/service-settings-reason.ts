import type { ServiceFoundationRecord } from '@bunshin/application';
import {
  readServiceOnboardingSettings,
  type ServiceDailyIdeaDeliverySettings,
  type ServiceProfileQuestionSettings,
} from './service-onboarding-settings';

export interface ServiceSettingsReasonPolicy {
  termsUrl: string | null;
  privacyUrl: string | null;
  registrationMode: ServiceFoundationRecord['registration']['mode'];
  emailEnabled: boolean;
  lineEnabled: boolean;
  inviteCodeEnabled: boolean;
  referralEnabled: boolean;
  trendResearchEnabled: boolean;
  profileQuestions?: ServiceProfileQuestionSettings | undefined;
  businessProfileEnabled: boolean;
  businessProfileInputMode: 'FULL' | 'MINIMAL';
  dailyIdeaDelivery: ServiceDailyIdeaDeliverySettings;
}

const canonicalUrl = (value: string | null) => {
  if (!value) return '';
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
};

// This is specific to the settings form, not an authorization or approval policy.
export function serviceSettingsChangesRequiringReason(
  current: Pick<
    ServiceFoundationRecord,
    'termsUrl' | 'privacyUrl' | 'registration' | 'trendResearchEnabled'
  >,
  next: ServiceSettingsReasonPolicy,
): string[] {
  const onboarding = readServiceOnboardingSettings(
    current.registration.onboardingConfig,
    current.registration.surveyConfig,
  );
  const changes: string[] = [];
  if (
    canonicalUrl(current.termsUrl) !== canonicalUrl(next.termsUrl) ||
    canonicalUrl(current.privacyUrl) !== canonicalUrl(next.privacyUrl)
  )
    changes.push('利用規約・プライバシーの参照先');
  if (
    current.registration.mode !== next.registrationMode ||
    current.registration.emailEnabled !== next.emailEnabled ||
    current.registration.lineEnabled !== next.lineEnabled ||
    current.registration.inviteCodeEnabled !== next.inviteCodeEnabled ||
    current.registration.referralEnabled !== next.referralEnabled
  )
    changes.push('参加方法・登録受付');
  if ((current.trendResearchEnabled ?? true) !== next.trendResearchEnabled)
    changes.push('話題調査の利用');
  if (
    onboarding.businessProfileEnabled !== next.businessProfileEnabled ||
    onboarding.businessProfileInputMode !== next.businessProfileInputMode
  )
    changes.push('サービスの提供方式');
  const nextProfile = next.profileQuestions;
  if (
    nextProfile &&
    (Object.keys(onboarding.profileQuestions) as (keyof ServiceProfileQuestionSettings)[]).some(
      (key) => onboarding.profileQuestions[key] !== nextProfile[key],
    )
  )
    changes.push('参加時に取得する情報');
  const mediaPolicy = (setting: ServiceDailyIdeaDeliverySettings) => [
    setting.enabled,
    setting.cadence,
    setting.lockCadence,
    setting.contentMode,
    setting.mediaMode,
    setting.videoNarration.enabled,
    setting.visualCharacter.enabled,
  ];
  if (
    JSON.stringify(mediaPolicy(onboarding.dailyIdeaDelivery)) !==
    JSON.stringify(mediaPolicy(next.dailyIdeaDelivery))
  )
    changes.push('AI・メディアの利用条件');
  return changes;
}

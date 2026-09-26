import {
  DEFAULT_SERVICE_PROFILE_QUESTIONS,
  type ServiceProfileQuestionSettings,
} from '../../../../../src/services/service-onboarding-settings';

export function suggestedProfileQuestions(organizationType: string, operationStyle: string) {
  const next: ServiceProfileQuestionSettings = { ...DEFAULT_SERVICE_PROFILE_QUESTIONS };
  if (operationStyle === 'PERSONALIZED_SOCIAL_CONTENT') {
    return {
      ...next,
      industry: false,
      purpose: false,
      activityName: false,
      businessName: false,
      region: false,
      productService: false,
      socialProfile: false,
      notificationConsent: true,
    };
  }
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

export function suggestedOnboardingCopy(operationStyle: string) {
  if (operationStyle === 'PERSONALIZED_SOCIAL_CONTENT') {
    return {
      welcomeTitle: 'あなたらしい投稿を作るために、少し教えてください',
      welcomeMessage:
        'お答えいただいた内容を使って、あなたがご自身のSNSに投稿できる文章を作ります。むずかしく考えず、今のあなたに近い内容をお答えください。',
      questions: [
        '千ノ国メディアを、どのようなきっかけで知りましたか？（例：知人からの紹介、説明会・イベント、SNS、すでに活動している）',
        '普段、SNSでは主にどのような方とつながっていますか？（例：友人・知人、家族・親戚、地域の方、仕事関係、同じ趣味の方）',
        '千ノ国メディアについて、実際に感じたことや伝えたいことを教えてください。（まだない場合は「まだありません」で大丈夫です）',
      ],
    };
  }
  return null;
}

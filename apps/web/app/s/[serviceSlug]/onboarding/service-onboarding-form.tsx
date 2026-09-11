'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { serviceOnboardingChoicePreset } from '../../../../src/services/service-onboarding-settings';

const OTHER = '__OTHER__';

export function ServiceOnboardingForm({
  serviceSlug,
  questions,
  businessProfileEnabled,
  industries,
  initialBusinessProfile,
}: {
  serviceSlug: string;
  questions: string[];
  businessProfileEnabled: boolean;
  industries: Array<{ id: string; key: string; name: string }>;
  initialBusinessProfile: {
    primaryIndustryId: string | null;
    otherIndustryText: string | null;
    businessName: string;
    region: string | null;
    productService: string;
    primaryPurpose: string;
    targetAudience: string;
    websiteUrl: string | null;
    businessFeatures: string | null;
    priceInformation: string | null;
    preferredTone: string | null;
    requiredContent: string | null;
    forbiddenContent: string | null;
  } | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [selections, setSelections] = useState(() => questions.map(() => ''));
  const [customAnswers, setCustomAnswers] = useState(() => questions.map(() => ''));
  const [businessProfile, setBusinessProfile] = useState(() => ({
    primaryIndustryId: initialBusinessProfile?.primaryIndustryId ?? '',
    otherIndustryText: initialBusinessProfile?.otherIndustryText ?? '',
    businessName: initialBusinessProfile?.businessName ?? '',
    region: initialBusinessProfile?.region ?? '',
    productService: initialBusinessProfile?.productService ?? '',
    primaryPurpose: initialBusinessProfile?.primaryPurpose ?? 'AWARENESS',
    targetAudience: initialBusinessProfile?.targetAudience ?? '',
    websiteUrl: initialBusinessProfile?.websiteUrl ?? '',
    businessFeatures: initialBusinessProfile?.businessFeatures ?? '',
    priceInformation: initialBusinessProfile?.priceInformation ?? '',
    preferredTone: initialBusinessProfile?.preferredTone ?? 'やさしく親しみやすい',
    requiredContent: initialBusinessProfile?.requiredContent ?? '',
    forbiddenContent: initialBusinessProfile?.forbiddenContent ?? '',
  }));

  const answers = questions.map((question, index) => {
    const preset = serviceOnboardingChoicePreset(question);
    if (!preset || selections[index] === OTHER) return customAnswers[index]?.trim() ?? '';
    return selections[index]?.trim() ?? '';
  });
  const selectedIndustry = industries.find(({ id }) => id === businessProfile.primaryIndustryId);
  const businessComplete =
    !businessProfileEnabled ||
    (Boolean(businessProfile.primaryIndustryId) &&
      (selectedIndustry?.key !== 'OTHER' || Boolean(businessProfile.otherIndustryText.trim())) &&
      Boolean(businessProfile.businessName.trim()) &&
      Boolean(businessProfile.productService.trim()) &&
      Boolean(businessProfile.primaryPurpose) &&
      Boolean(businessProfile.targetAudience.trim()) &&
      Boolean(businessProfile.businessFeatures.trim()) &&
      Boolean(businessProfile.preferredTone.trim()));
  const complete = answers.every(Boolean) && businessComplete;
  const updateBusiness = (key: keyof typeof businessProfile, value: string) =>
    setBusinessProfile((current) => ({ ...current, [key]: value }));

  async function submit() {
    if (!complete) {
      setMessage('すべての質問に回答してください。');
      return;
    }
    setSaving(true);
    setMessage('');
    const response = await fetch(`/api/services/${encodeURIComponent(serviceSlug)}/onboarding`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answers,
        businessProfile: businessProfileEnabled
          ? {
              ...businessProfile,
              primaryIndustryId: businessProfile.primaryIndustryId,
              otherIndustryText: businessProfile.otherIndustryText || null,
              region: businessProfile.region || null,
              websiteUrl: businessProfile.websiteUrl || null,
              priceInformation: businessProfile.priceInformation || null,
              requiredContent: businessProfile.requiredContent || null,
              forbiddenContent: businessProfile.forbiddenContent || null,
            }
          : null,
      }),
    });
    if (!response.ok) {
      setSaving(false);
      setMessage('保存できませんでした。入力内容を確認して、もう一度お試しください。');
      return;
    }
    router.replace(`/s/${encodeURIComponent(serviceSlug)}/bunshins/new`);
    router.refresh();
  }

  return (
    <form action={submit} className="service-onboarding-form">
      {businessProfileEnabled ? (
        <fieldset className="service-onboarding-question">
          <legend>事業について教えてください</legend>
          <label>
            業種
            <select
              value={businessProfile.primaryIndustryId}
              onChange={(event) => updateBusiness('primaryIndustryId', event.target.value)}
              required
            >
              <option value="">選んでください</option>
              {industries.map((industry) => (
                <option key={industry.id} value={industry.id}>
                  {industry.name}
                </option>
              ))}
            </select>
          </label>
          {selectedIndustry?.key === 'OTHER' ? (
            <label>
              業種名
              <input
                value={businessProfile.otherIndustryText}
                onChange={(event) => updateBusiness('otherIndustryText', event.target.value)}
                required
                maxLength={160}
              />
            </label>
          ) : null}
          <label>
            店舗・会社名
            <input
              value={businessProfile.businessName}
              onChange={(event) => updateBusiness('businessName', event.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            活動地域（任意）
            <input
              value={businessProfile.region}
              onChange={(event) => updateBusiness('region', event.target.value)}
              maxLength={160}
            />
          </label>
          <label>
            主な商品・サービス
            <textarea
              value={businessProfile.productService}
              onChange={(event) => updateBusiness('productService', event.target.value)}
              required
              maxLength={1000}
              rows={3}
            />
          </label>
          <label>
            商品・サービスの特徴
            <textarea
              value={businessProfile.businessFeatures}
              onChange={(event) => updateBusiness('businessFeatures', event.target.value)}
              required
              maxLength={1000}
              rows={3}
              placeholder="例：予約なしでも利用でき、初めての方へ使い方を丁寧に説明します"
            />
          </label>
          <label>
            Webサイト（任意）
            <input
              type="url"
              inputMode="url"
              value={businessProfile.websiteUrl}
              onChange={(event) => updateBusiness('websiteUrl', event.target.value)}
              maxLength={2048}
              placeholder="https://example.jp"
            />
          </label>
          <label>
            価格・料金（任意）
            <textarea
              value={businessProfile.priceInformation}
              onChange={(event) => updateBusiness('priceInformation', event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="例：初回相談は無料、通常プランは月額5,000円"
            />
          </label>
          <label>
            発信の目的
            <select
              value={businessProfile.primaryPurpose}
              onChange={(event) => updateBusiness('primaryPurpose', event.target.value)}
              required
            >
              <option value="ATTRACT">集客</option>
              <option value="RESERVATION">予約</option>
              <option value="SALES">販売</option>
              <option value="RECRUITING">採用</option>
              <option value="AWARENESS">認知</option>
              <option value="RETENTION">既存顧客との関係づくり</option>
            </select>
          </label>
          <label>
            情報を届けたいお客様
            <textarea
              value={businessProfile.targetAudience}
              onChange={(event) => updateBusiness('targetAudience', event.target.value)}
              required
              maxLength={500}
              rows={3}
            />
          </label>
          <label>
            投稿文の雰囲気
            <select
              value={businessProfile.preferredTone}
              onChange={(event) => updateBusiness('preferredTone', event.target.value)}
              required
            >
              <option value="やさしく親しみやすい">やさしく親しみやすい</option>
              <option value="信頼感のある丁寧な文章">信頼感のある丁寧な文章</option>
              <option value="明るく元気な文章">明るく元気な文章</option>
              <option value="落ち着いた専門的な文章">落ち着いた専門的な文章</option>
              <option value="短く簡潔で分かりやすい文章">短く簡潔で分かりやすい文章</option>
            </select>
          </label>
          <label>
            毎回必ず入れたい内容（任意）
            <textarea
              value={businessProfile.requiredContent}
              onChange={(event) => updateBusiness('requiredContent', event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="例：予約はプロフィールのリンクから、と案内する"
            />
          </label>
          <label>
            投稿に入れたくない内容（任意）
            <textarea
              value={businessProfile.forbiddenContent}
              onChange={(event) => updateBusiness('forbiddenContent', event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="例：必ず効果が出る、地域最安などの断定表現"
            />
          </label>
        </fieldset>
      ) : null}
      {questions.map((question, index) => {
        const preset = serviceOnboardingChoicePreset(question);
        if (!preset) {
          return (
            <label key={`${index}-${question}`}>
              <span>
                {index + 1}. {question}
              </span>
              <textarea
                value={customAnswers[index] ?? ''}
                onChange={(event) =>
                  setCustomAnswers((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index ? event.target.value : value,
                    ),
                  )
                }
                required
                maxLength={1000}
                rows={3}
              />
            </label>
          );
        }
        return (
          <fieldset className="service-onboarding-question" key={`${index}-${question}`}>
            <legend>
              {index + 1}. {question}
            </legend>
            <div className="onboarding-options service-onboarding-options">
              {preset.options.map((option) => (
                <button
                  aria-pressed={selections[index] === option}
                  className={selections[index] === option ? 'is-selected' : ''}
                  key={option}
                  onClick={() =>
                    setSelections((current) =>
                      current.map((value, itemIndex) => (itemIndex === index ? option : value)),
                    )
                  }
                  type="button"
                >
                  <span>{option}</span>
                  <small>{selections[index] === option ? '選択中' : '選ぶ'}</small>
                </button>
              ))}
              <button
                aria-pressed={selections[index] === OTHER}
                className={selections[index] === OTHER ? 'is-selected' : ''}
                onClick={() =>
                  setSelections((current) =>
                    current.map((value, itemIndex) => (itemIndex === index ? OTHER : value)),
                  )
                }
                type="button"
              >
                <span>{preset.otherLabel}</span>
                <small>{selections[index] === OTHER ? '入力中' : '選ぶ'}</small>
              </button>
            </div>
            {selections[index] === OTHER ? (
              <label className="service-onboarding-other">
                回答を入力してください
                <textarea
                  autoFocus
                  value={customAnswers[index] ?? ''}
                  onChange={(event) =>
                    setCustomAnswers((current) =>
                      current.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                  required
                  maxLength={1000}
                  rows={3}
                />
              </label>
            ) : null}
          </fieldset>
        );
      })}
      <button
        className="button button--primary button--full"
        type="submit"
        disabled={saving || !complete}
      >
        {saving ? '保存しています…' : '回答してはじめる'}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}

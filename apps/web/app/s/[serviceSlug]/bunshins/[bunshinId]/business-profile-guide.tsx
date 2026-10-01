'use client';

import type { SocialAccountStrategyDestination, SocialPlatform } from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClientRequestId } from '../../../../ui/client-request-id';

const platformLabels: Record<SocialPlatform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X（旧Twitter）',
  THREADS: 'Threads',
  YOUTUBE_SHORTS: 'YouTube ショート',
  OTHER: 'SNS',
};

const destinationLabels: Record<SocialAccountStrategyDestination, string> = {
  PROFILE: 'SNSの自己紹介ページ',
  LINE: 'LINE',
  LP: '案内ページ',
  BLOG: 'ブログ',
  EC: 'ネットショップ',
  INQUIRY: '問い合わせページ',
  RECRUIT_PAGE: '求人ページ',
  NONE: '案内先はありません',
  OTHER: '設定した案内先',
};

export interface BusinessProfileGuideStrategy {
  socialProfileId: string;
  platform: SocialPlatform;
  availableMinutes: 3 | 5 | 10 | 20;
  profileDraft: string;
  ctaStrategy: string;
  destinationType: SocialAccountStrategyDestination;
  destinationDetail: string | null;
}

const editableDestinations = [
  ['PROFILE', 'SNSのプロフィールから案内する'],
  ['LINE', 'LINEへ案内する'],
  ['LP', '予約・案内ページへ案内する'],
  ['INQUIRY', '問い合わせページへ案内する'],
  ['EC', 'ネットショップへ案内する'],
  ['BLOG', 'ブログへ案内する'],
  ['RECRUIT_PAGE', '採用ページへ案内する'],
  ['OTHER', 'その他のページへ案内する'],
  ['NONE', '案内先を入れない'],
] as const satisfies ReadonlyArray<readonly [SocialAccountStrategyDestination, string]>;

const destinationNeedsUrl = (destination: SocialAccountStrategyDestination) =>
  destination !== 'PROFILE' && destination !== 'NONE';

function goalForDestination(destination: SocialAccountStrategyDestination) {
  if (destination === 'LINE') return 'LINE_REGISTRATION' as const;
  if (destination === 'EC') return 'SALES' as const;
  if (destination === 'INQUIRY' || destination === 'LP') return 'INQUIRY' as const;
  if (destination === 'RECRUIT_PAGE') return 'RECRUIT' as const;
  if (destination === 'BLOG') return 'BLOG_TRAFFIC' as const;
  if (destination === 'OTHER') return 'OTHER' as const;
  return 'BRAND_AWARENESS' as const;
}

function copyWithSelection(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

async function writeToClipboard(value: string) {
  let clipboardAttempt: Promise<boolean> | null = null;
  try {
    clipboardAttempt = navigator.clipboard.writeText(value).then(
      () => true,
      () => false,
    );
  } catch {
    // LINE内ブラウザや一部のiPhoneではClipboard APIを利用できない場合がある。
  }
  const selectedCopy = copyWithSelection(value);
  return selectedCopy || (await clipboardAttempt) || false;
}

export function BusinessProfileGuide({
  serviceSlug,
  bunshinId,
  topic,
  audience,
  strategy,
}: {
  serviceSlug: string;
  bunshinId: string;
  topic: string;
  audience: string;
  strategy: BusinessProfileGuideStrategy;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [destinationType, setDestinationType] = useState(strategy.destinationType);
  const [destinationDetail, setDestinationDetail] = useState(strategy.destinationDetail ?? '');

  async function copy(value: string, kind: 'profile' | 'guidance') {
    const copied = await writeToClipboard(value);
    setMessage(
      copied
        ? kind === 'profile'
          ? `自己紹介文をコピーしました。${platformLabels[strategy.platform]}のプロフィール編集画面に貼り付けてください。`
          : '投稿の最後に入れる案内文をコピーしました。'
        : '自動でコピーできませんでした。文章を長押しして「コピー」を選んでください。',
    );
  }

  async function saveDestination() {
    if (pending) return;
    const detail = destinationDetail.trim();
    if (destinationNeedsUrl(destinationType)) {
      try {
        const url = new URL(detail);
        if (url.protocol !== 'https:') throw new Error('HTTPS required');
      } catch {
        setMessage('案内先のURLを「https://」から入力してください。');
        return;
      }
    }

    setPending(true);
    setMessage('案内文を作り直しています。そのままお待ちください。');
    const requestId = createClientRequestId();
    const base = `/api/services/${encodeURIComponent(serviceSlug)}/bunshins/${encodeURIComponent(bunshinId)}/social-account-strategies`;
    try {
      const generatedResponse = await fetch(`${base}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({
          socialProfileId: strategy.socialProfileId,
          platform: strategy.platform,
          goal: goalForDestination(destinationType),
          availableMinutes: strategy.availableMinutes,
          destinationType,
          destinationDetail: destinationNeedsUrl(destinationType) ? detail : null,
          wizardTopic: topic,
          wizardAudience: audience,
        }),
      });
      const generated = (await generatedResponse.json().catch(() => null)) as {
        data?: { id?: string };
        error?: { message?: string; requestId?: string };
      } | null;
      if (!generatedResponse.ok || !generated?.data?.id) {
        throw new Error(
          `${generated?.error?.message ?? '案内文を作り直せませんでした。'}（受付番号: ${generated?.error?.requestId ?? requestId}）`,
        );
      }
      const approveResponse = await fetch(
        `${base}/${encodeURIComponent(generated.data.id)}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-request-id': requestId },
          body: '{}',
        },
      );
      if (!approveResponse.ok) {
        const result = (await approveResponse.json().catch(() => null)) as {
          error?: { message?: string; requestId?: string };
        } | null;
        throw new Error(
          `${result?.error?.message ?? '案内文を決定できませんでした。'}（受付番号: ${result?.error?.requestId ?? requestId}）`,
        );
      }
      setMessage(
        '案内先を保存しました。新しい自己紹介文を表示し、投稿方針は今後作る週間計画から反映します。',
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `保存できませんでした。もう一度お試しください。（受付番号: ${requestId}）`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="business-profile-guide service-entry__card"
      id="sns-profile-guide"
      aria-labelledby="sns-profile-guide-title"
    >
      <header>
        <p className="eyebrow">最初に一度だけ</p>
        <h2 id="sns-profile-guide-title">SNSの自己紹介文を入れましょう</h2>
        <p>用意した文章をコピーして、{platformLabels[strategy.platform]}へ貼り付けます。</p>
      </header>

      <ol className="business-profile-guide__steps">
        <li>下の青いボタンを押す</li>
        <li>{platformLabels[strategy.platform]}を開き、「プロフィールを編集」を押す</li>
        <li>自己紹介の欄を長押しして「貼り付け」を押し、保存する</li>
      </ol>

      <div className="business-profile-guide__copy-block">
        <h3>コピーする自己紹介文</h3>
        <textarea
          aria-label="SNSへ貼り付ける自己紹介文"
          className="field__control"
          readOnly
          rows={6}
          value={strategy.profileDraft}
        />
        <button
          className="button button--primary button--full"
          type="button"
          onClick={() => void copy(strategy.profileDraft, 'profile')}
        >
          自己紹介文をコピー
        </button>
      </div>

      {strategy.destinationType !== 'NONE' ? (
        <div className="business-profile-guide__copy-block">
          <h3>投稿を見た人への案内</h3>
          <p className="business-profile-guide__destination">
            案内先：{destinationLabels[strategy.destinationType]}
            {strategy.destinationDetail ? `（${strategy.destinationDetail}）` : ''}
          </p>
          <textarea
            aria-label="投稿の最後に入れる案内文"
            className="field__control"
            readOnly
            rows={4}
            value={strategy.ctaStrategy}
          />
          <button
            className="button button--secondary button--full"
            type="button"
            onClick={() => void copy(strategy.ctaStrategy, 'guidance')}
          >
            案内文をコピー
          </button>
          <p className="business-profile-guide__hint">
            この案内文は、投稿文のいちばん最後に貼り付けて使います。
          </p>
        </div>
      ) : null}

      <details className="business-profile-guide__destination-editor">
        <summary>お客様の案内先を設定・変更する</summary>
        <div className="business-profile-guide__destination-form">
          <p>投稿を見た人に、次に開いてほしい場所を選んでください。</p>
          <label className="field">
            <span className="field__label">案内する場所</span>
            <select
              className="field__control"
              value={destinationType}
              onChange={(event) =>
                setDestinationType(event.target.value as SocialAccountStrategyDestination)
              }
            >
              {editableDestinations.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {!destinationNeedsUrl(destinationType) ? (
            <p className="business-profile-guide__hint">
              URLの入力は必要ありません。
              {destinationType === 'PROFILE'
                ? 'SNSの自己紹介ページを見てもらう案内にします。'
                : '投稿の最後に案内先を入れません。'}
            </p>
          ) : (
            <label className="field">
              <span className="field__label">案内先のURL</span>
              <input
                className="field__control"
                type="url"
                inputMode="url"
                placeholder="https:// から入力"
                value={destinationDetail}
                onChange={(event) => setDestinationDetail(event.target.value)}
                maxLength={2048}
                required
              />
            </label>
          )}
          <button
            className="button button--primary button--full"
            type="button"
            disabled={pending}
            onClick={() => void saveDestination()}
          >
            {pending ? '案内文を準備しています…' : 'この案内先で文章を作り直す'}
          </button>
          <small>保存すると、上の自己紹介文と案内文が新しい内容に変わります。</small>
        </div>
      </details>

      <p className="business-profile-guide__message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

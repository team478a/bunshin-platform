'use client';

import { RewardsActionFeedback } from '../../../../ui/rewards-action-feedback';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { useServiceDailyMissionController } from './service-daily-mission-controller';
import { ServiceDailyMissionList } from './service-daily-mission-list';

export function ServiceDailyMissionSection({
  endpoint,
  missions,
  variantPointCost,
  pointWorkspaceId,
  serviceSlug,
  rewardsPilotActive,
  active,
  generation,
  videos = {},
  imageCreationBaseHref,
  businessFree = false,
}: {
  endpoint: string;
  missions: DailyMissionView[];
  variantPointCost: number | null;
  pointWorkspaceId: string;
  serviceSlug: string;
  rewardsPilotActive: boolean;
  active: boolean;
  generation?: { missionDate: string; timezone: string; socialProfileId: string };
  videos?: Record<string, { href: string; status: string }>;
  imageCreationBaseHref?: string;
  businessFree?: boolean;
}) {
  const controller = useServiceDailyMissionController({
    endpoint,
    missions,
    variantPointCost,
    rewardsPilotActive,
    active,
    ...(generation ? { generation } : {}),
  });
  const {
    message,
    pointNotice,
    manualCopy,
    pendingAction,
    copyWithSelection,
    setManualCopy,
    setMessage,
    generateToday,
  } = controller;
  return (
    <section className="mission-experience">
      <header className="mission-experience__header">
        <p className="eyebrow">今日やること</p>
        <h2>
          {businessFree
            ? '今日の集客を1つ進めましょう'
            : imageCreationBaseHref
              ? '投稿画像を作りましょう'
              : '今日の投稿を準備しましょう'}
        </h2>
        <p>
          {businessFree
            ? '投稿、写真、返信など、その日にできる一つだけを分かりやすく案内します。'
            : imageCreationBaseHref
              ? 'むずかしい設定は必要ありません。下の青いボタンから始められます。'
              : '用意された文章を順番にコピーして使います。内容を考え直す必要はありません。'}
        </p>
      </header>
      {message ? (
        <p className="notice" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <RewardsActionFeedback
        action={pointNotice}
        workspaceId={pointWorkspaceId}
        serviceSlug={serviceSlug}
      />
      {manualCopy ? (
        <section className="mission-manual-copy" aria-label={`${manualCopy.title}を手動でコピー`}>
          <h3>{manualCopy.title}</h3>
          <p>まず下のボタンを押してください。</p>
          <button
            type="button"
            onClick={() => {
              if (copyWithSelection(manualCopy.value)) {
                setManualCopy(null);
                setMessage('コピーしました。次の手順へ進んでください。');
              } else {
                setMessage('下の文章を長押ししてコピーしてください。');
              }
            }}
          >
            もう一度コピーする
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              if (typeof navigator.share !== 'function') {
                setMessage('下の文章を長押ししてコピーしてください。');
                return;
              }
              void navigator
                .share({ title: manualCopy.title, text: manualCopy.value })
                .then(() => setMessage('共有メニューを閉じました。'))
                .catch(() => setMessage('下の文章を長押ししてコピーしてください。'));
            }}
          >
            iPhoneの共有メニューを開く
          </button>
          <p>
            共有メニューでは「コピー」を選びます。それでも難しい場合は、下の枠内を長押しし、「すべて選択」→「コピー」の順に押してください。
          </p>
          <textarea
            aria-label={manualCopy.title}
            readOnly
            rows={8}
            value={manualCopy.value}
            onFocus={(event) => event.currentTarget.select()}
          />
        </section>
      ) : null}
      {missions.length === 0 ? (
        <div>
          <p>届いた投稿案はまだありません。自動のお届けを設定すると、投稿予定の日に届きます。</p>
          {active && generation ? (
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={() => void generateToday()}
            >
              {pendingAction === 'generate'
                ? '投稿案を準備しています…'
                : '今日の投稿案を今すぐ準備する'}
            </button>
          ) : null}
        </div>
      ) : null}
      <ServiceDailyMissionList
        missions={missions}
        controller={controller}
        variantPointCost={variantPointCost}
        pointWorkspaceId={pointWorkspaceId}
        serviceSlug={serviceSlug}
        active={active}
        videos={videos}
        {...(imageCreationBaseHref === undefined ? {} : { imageCreationBaseHref })}
        businessFree={businessFree}
      />
    </section>
  );
}

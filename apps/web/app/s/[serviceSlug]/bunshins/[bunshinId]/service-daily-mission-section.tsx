'use client';

import { useState, type ReactNode } from 'react';
import { RewardsActionFeedback } from '../../../../ui/rewards-action-feedback';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { useServiceDailyMissionController } from './service-daily-mission-controller';
import { ServiceDailyMissionList } from './service-daily-mission-list';
import {
  splitServiceMissionsByDate,
  splitServiceMissionsBySource,
} from './service-mission-date-filter';

function MissionSourceGroups({
  missions,
  showSourceGroups,
  campaignHref,
  idPrefix,
  list,
}: {
  missions: DailyMissionView[];
  showSourceGroups: boolean;
  campaignHref: string;
  idPrefix: string;
  list: (missions: DailyMissionView[]) => ReactNode;
}) {
  if (!showSourceGroups) return list(missions);

  const { personalMissions, campaignMissions } = splitServiceMissionsBySource(missions);
  return (
    <div className="mission-source-groups">
      <section
        className="mission-source-group"
        aria-labelledby={`${idPrefix}-personal-posts-title`}
      >
        <header>
          <p className="eyebrow">自分で育てる発信</p>
          <h3 id={`${idPrefix}-personal-posts-title`}>自分の投稿</h3>
          <p>あなたの日常や発信テーマをもとにした投稿案です。</p>
        </header>
        {personalMissions.length > 0 ? list(personalMissions) : <p>この日の投稿案はありません。</p>}
      </section>
      <section
        className="mission-source-group mission-source-group--campaign"
        aria-labelledby={`${idPrefix}-campaign-posts-title`}
      >
        <header>
          <p className="eyebrow">参加を選んだ企画</p>
          <h3 id={`${idPrefix}-campaign-posts-title`}>グループの企画</h3>
          <p>あなたが参加した企業・グループの企画だけを表示します。</p>
        </header>
        {campaignMissions.length > 0 ? (
          list(campaignMissions)
        ) : (
          <p>この日の企画投稿案はありません。</p>
        )}
        <a className="mission-source-group__link" href={campaignHref}>
          参加中・参加できる企画を見る
        </a>
      </section>
    </div>
  );
}

export function ServiceDailyMissionSection({
  endpoint,
  bunshinId,
  missions,
  today,
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
  bunshinId: string;
  missions: DailyMissionView[];
  today: string;
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
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const { todayMissions, pastMissions } = splitServiceMissionsByDate(missions, today);
  const showSourceGroups = !businessFree && missions.some(({ campaignId }) => campaignId !== null);
  const campaignHref = `/s/${encodeURIComponent(serviceSlug)}/bunshins/${encodeURIComponent(bunshinId)}/campaigns`;
  const pastDates = pastMissions.map(({ missionDate }) => missionDate);
  const selectedHistoryMissions = pastMissions.filter(
    ({ missionDate }) => missionDate === selectedHistoryDate,
  );
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
      {todayMissions.length === 0 ? (
        <div>
          <p>今日の投稿案はまだありません。自動のお届けを設定すると、投稿予定の日に届きます。</p>
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
      {todayMissions.length > 0 ? (
        <MissionSourceGroups
          missions={todayMissions}
          showSourceGroups={showSourceGroups}
          campaignHref={campaignHref}
          idPrefix="today"
          list={(sourceMissions) => (
            <ServiceDailyMissionList
              missions={sourceMissions}
              controller={controller}
              variantPointCost={variantPointCost}
              pointWorkspaceId={pointWorkspaceId}
              serviceSlug={serviceSlug}
              active={active}
              videos={videos}
              {...(imageCreationBaseHref === undefined ? {} : { imageCreationBaseHref })}
              businessFree={businessFree}
            />
          )}
        />
      ) : null}
      <details className="mission-history">
        <summary>過去の投稿をカレンダーから見る</summary>
        {pastMissions.length === 0 ? (
          <p>過去の投稿案はまだありません。</p>
        ) : (
          <div className="mission-history__content">
            <label htmlFor="service-mission-history-date">見たい日付を選択</label>
            <input
              id="service-mission-history-date"
              type="date"
              min={pastDates.reduce((earliest, date) => (date < earliest ? date : earliest))}
              max={pastDates.reduce((latest, date) => (date > latest ? date : latest))}
              value={selectedHistoryDate}
              onChange={(event) => setSelectedHistoryDate(event.currentTarget.value)}
            />
            {selectedHistoryDate ? (
              selectedHistoryMissions.length > 0 ? (
                <MissionSourceGroups
                  missions={selectedHistoryMissions}
                  showSourceGroups={showSourceGroups}
                  campaignHref={campaignHref}
                  idPrefix={`history-${selectedHistoryDate}`}
                  list={(sourceMissions) => (
                    <ServiceDailyMissionList
                      missions={sourceMissions}
                      controller={controller}
                      variantPointCost={variantPointCost}
                      pointWorkspaceId={pointWorkspaceId}
                      serviceSlug={serviceSlug}
                      active={active}
                      videos={videos}
                      {...(imageCreationBaseHref === undefined ? {} : { imageCreationBaseHref })}
                      businessFree={businessFree}
                    />
                  )}
                />
              ) : (
                <p>選んだ日付の投稿案はありません。別の日付を選んでください。</p>
              )
            ) : (
              <p>カレンダーで日付を選ぶと、その日の投稿案を表示します。</p>
            )}
          </div>
        )}
      </details>
    </section>
  );
}

'use client';

import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import {
  serviceExecutionResultOptions,
  type ServiceDailyMissionController,
} from './service-daily-mission-controller';
import { ServiceDailyMissionDetail } from './service-daily-mission-detail';
import { ServiceDailyMissionImageGuide } from './service-daily-mission-image-guide';

export function ServiceDailyMissionCard({
  mission,
  controller,
  variantPointCost,
  pointWorkspaceId,
  serviceSlug,
  active,
  video,
  imageCreationBaseHref,
  businessFree,
}: {
  mission: DailyMissionView;
  controller: ServiceDailyMissionController;
  variantPointCost: number | null;
  pointWorkspaceId: string;
  serviceSlug: string;
  active: boolean;
  video: { href: string; status: string } | undefined;
  imageCreationBaseHref: string | undefined;
  businessFree: boolean;
}) {
  const isImageMission = mission.format === 'IMAGE' || mission.format === 'SLIDE';
  const imageCreationHref =
    isImageMission && imageCreationBaseHref
      ? `${imageCreationBaseHref}?mission=${encodeURIComponent(mission.id)}`
      : null;
  const expanded = controller.expanded === mission.id;

  return (
    <li className={`mission-card${isImageMission ? ' mission-card--simple' : ''}`}>
      {video ? (
        <p>
          <a href={video.href}>
            {['READY_FOR_REVIEW', 'COMPLETED'].includes(video.status)
              ? 'この投稿案の字幕動画を見る'
              : video.status === 'FAILED'
                ? '字幕動画の作成状況を確認する'
                : '字幕動画を準備しています — 状況を見る'}
          </a>
        </p>
      ) : null}
      {mission.businessAction ? (
        <p className="mission-card__date">{mission.missionDate}の行動</p>
      ) : isImageMission ? (
        <p className="mission-card__date">{mission.missionDate}の投稿</p>
      ) : null}
      {mission.businessAction ? (
        <p className="eyebrow">{mission.businessAction.label}</p>
      ) : isImageMission ? (
        <p className="eyebrow">この5枚のテーマ</p>
      ) : null}
      <h3>
        {mission.businessAction
          ? mission.businessAction.title
          : isImageMission
            ? mission.topic
            : `${mission.missionDate} — ${mission.topic}`}
      </h3>
      {mission.businessAction ? (
        <section className="mission-growth-action">
          {mission.businessAction.program ? (
            <p className="mission-growth-action__program">
              第{mission.businessAction.program.cycleNumber}期・{mission.businessAction.program.day}
              日目 /{mission.businessAction.program.phaseLabel}
            </p>
          ) : null}
          <p>{mission.businessAction.reason}</p>
          <p>
            <strong>やることは3つです</strong>
          </p>
          <ol>
            {mission.businessAction.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : isImageMission && imageCreationHref ? (
        <div className="mission-simple-steps" aria-label="画像を作って保存する手順">
          <p>
            <strong>やることは3つだけです</strong>
          </p>
          <ol>
            <li>青い「画像作成へ進む」ボタンを押す</li>
            <li>次の画面で「画像を作る」を押す</li>
            <li>「この画像を使う」を押してスマホに保存する</li>
          </ol>
        </div>
      ) : !isImageMission ? (
        <p>{mission.reason}</p>
      ) : null}
      {active && businessFree ? (
        <section className="mission-execution-result">
          <h4>どこまでできましたか？</h4>
          <p>近いものを1つ押してください。次回の内容を調整します。</p>
          <div>
            {serviceExecutionResultOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mission.executionResult === value}
                disabled={controller.pendingAction !== null || mission.executionResult === value}
                onClick={() => void controller.recordExecutionResult(mission.id, value)}
              >
                {mission.executionResult === value ? `✓ ${label}` : label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {isImageMission ? (
        <ServiceDailyMissionImageGuide
          mission={mission}
          imageCreationHref={imageCreationHref}
          controller={controller}
        />
      ) : null}
      <button
        className={isImageMission ? 'mission-detail-toggle' : undefined}
        type="button"
        onClick={() => void controller.openMission(mission)}
      >
        {expanded
          ? isImageMission
            ? '詳しい内容を閉じる'
            : '閉じる'
          : mission.businessAction && !mission.businessAction.postContentIsPrimary
            ? '参考の投稿案を見る'
            : isImageMission
              ? '内容を確認・変更する'
              : '内容を見る'}
      </button>
      {expanded ? (
        <ServiceDailyMissionDetail
          mission={mission}
          controller={controller}
          variantPointCost={variantPointCost}
          pointWorkspaceId={pointWorkspaceId}
          serviceSlug={serviceSlug}
          active={active}
          isImageMission={isImageMission}
          businessFree={businessFree}
        />
      ) : null}
    </li>
  );
}

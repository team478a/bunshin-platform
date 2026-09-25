'use client';

import {
  MissionContent,
  MissionGuide,
  MissionIdea,
  MissionTrendContext,
  missionWithSelectedVariant,
  rejectionReasons,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { ServiceDailyMissionAccepted } from './service-daily-mission-accepted';
import type { ServiceDailyMissionController } from './service-daily-mission-controller';

export function ServiceDailyMissionDetail({
  mission,
  controller,
  variantPointCost,
  pointWorkspaceId,
  serviceSlug,
  active,
  isImageMission,
  businessFree,
}: {
  mission: DailyMissionView;
  controller: ServiceDailyMissionController;
  variantPointCost: number | null;
  pointWorkspaceId: string;
  serviceSlug: string;
  active: boolean;
  isImageMission: boolean;
  businessFree: boolean;
}) {
  const preparedMission = missionWithSelectedVariant(mission);
  const confirmation = controller.variantConfirmation;

  return (
    <div className="mission-detail">
      {isImageMission ? (
        <details className="mission-advanced-content">
          <summary>企画の理由や自分で作る方法を見る</summary>
          <MissionIdea mission={mission} />
          <MissionTrendContext mission={mission} />
          <MissionGuide mission={preparedMission} />
          <MissionContent mission={preparedMission} />
        </details>
      ) : (
        <>
          <MissionIdea mission={mission} />
          <MissionTrendContext mission={mission} />
          <MissionGuide mission={preparedMission} />
          <MissionContent mission={preparedMission} />
        </>
      )}
      {active && variantPointCost !== null && !mission.variants[0] ? (
        <div className="mission-variant-actions">
          <button
            type="button"
            disabled={controller.pendingAction !== null}
            onClick={() => controller.requestVariant(mission.id)}
          >
            {variantPointCost} WPで別の案を見る
          </button>
          <label>
            直したいところ（任意）
            <textarea
              value={controller.variantInstructions[mission.id] ?? ''}
              maxLength={500}
              onChange={(event) =>
                controller.setVariantInstructions((current) => ({
                  ...current,
                  [mission.id]: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            disabled={
              controller.pendingAction !== null ||
              !(controller.variantInstructions[mission.id] ?? '').trim()
            }
            onClick={() =>
              controller.requestVariant(mission.id, controller.variantInstructions[mission.id])
            }
          >
            {variantPointCost} WPで内容を直す
          </button>
          {confirmation?.missionId === mission.id ? (
            <section
              className="mission-variant-confirmation"
              role="alertdialog"
              aria-labelledby={`variant-confirmation-${mission.id}`}
            >
              <h4 id={`variant-confirmation-${mission.id}`}>WPを使いますか？</h4>
              <p>
                <strong>{variantPointCost} WP</strong>を使って
                {confirmation.instruction ? '内容を直した案' : '別の案'}を1つ作ります。
                作成に失敗した場合、WPは戻ります。
              </p>
              <div className="mission-variant-confirmation__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => controller.setVariantConfirmation(null)}
                >
                  やめる
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() =>
                    void controller.generateVariant(mission.id, confirmation.instruction)
                  }
                >
                  {variantPointCost} WPを使って作る
                </button>
              </div>
            </section>
          ) : null}
          <p>
            作成に使ったWPは、失敗した場合に戻ります。{' '}
            <a
              href={`/points?workspaceId=${encodeURIComponent(pointWorkspaceId)}&serviceSlug=${encodeURIComponent(serviceSlug)}`}
            >
              残高を見る
            </a>
          </p>
        </div>
      ) : null}
      {mission.variants[0] && !mission.variants[0].selectedAt ? (
        <aside className="mission-variant">
          <h4>別の案</h4>
          <MissionContent mission={{ ...mission, content: mission.variants[0].content }} />
          <button
            type="button"
            disabled={controller.pendingAction !== null}
            onClick={() => void controller.selectVariant(mission.id, mission.variants[0]!.id)}
          >
            この案を使う
          </button>
        </aside>
      ) : null}
      {mission.variants[0]?.selectedAt ? (
        <p className="mission-step-complete">✓ 別の案を使用中です</p>
      ) : null}
      {active && mission.decision !== 'ACCEPTED' ? (
        <div className="mission-decision-actions">
          <button
            type="button"
            disabled={controller.pendingAction !== null}
            onClick={() => void controller.decide(mission.id, 'ACCEPTED')}
          >
            採用する
          </button>{' '}
          <button
            type="button"
            disabled={controller.pendingAction !== null}
            onClick={() => controller.setRejecting(mission.id)}
          >
            今回は使わない
          </button>
        </div>
      ) : null}
      {active && controller.rejecting === mission.id ? (
        <div className="mission-rejection">
          <p>近い理由を1つ選んでください。</p>
          {rejectionReasons.map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={controller.pendingAction !== null}
              onClick={() => void controller.decide(mission.id, 'REJECTED', value)}
            >
              {label}
            </button>
          ))}
          <label>
            その他（書かなくても大丈夫です）
            <textarea
              value={controller.otherDetail}
              maxLength={1000}
              onChange={(event) => controller.setOtherDetail(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={controller.pendingAction !== null}
            onClick={() => void controller.decide(mission.id, 'REJECTED', 'OTHER')}
          >
            その他で決定
          </button>
        </div>
      ) : null}
      {mission.decision === 'REJECTED' ? <p>今回は使わないと記録しました。</p> : null}
      {active && mission.decision === 'ACCEPTED' ? (
        <ServiceDailyMissionAccepted
          mission={mission}
          controller={controller}
          businessFree={businessFree}
        />
      ) : null}
    </div>
  );
}

'use client';

import {
  displayDate,
  missionAssistanceOptions,
  missionWithSelectedVariant,
  MissionContent,
  MissionGuide,
  MissionIdea,
  MissionTrendContext,
  rejectionReasons,
  type DailyMissionView,
} from './daily-mission-content';
import { PersonalDailyMissionAccepted } from './personal-daily-mission-accepted';
import type { PersonalDailyMissionController } from './personal-daily-mission-controller';

export function PersonalDailyMissionDetail({
  workspaceId,
  mission,
  controller,
}: {
  workspaceId: string;
  mission: DailyMissionView;
  controller: PersonalDailyMissionController;
}) {
  const selected = controller.assistanceSelections[mission.id] ?? mission.assistanceLevel;
  const missionForUse = missionWithSelectedVariant(mission);
  const variant = mission.variants[0];
  const confirmation = controller.variantConfirmation;

  return (
    <div className="mission-detail">
      <fieldset className="mission-assistance-picker">
        <legend>今日はどこまで見ますか？</legend>
        <p>今日だけ変えられます。SNSのいつもの設定は変わりません。</p>
        <div>
          {missionAssistanceOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`assistance-${mission.id}`}
                value={option.value}
                checked={selected === option.value}
                onChange={() =>
                  controller.setAssistanceSelections((current) => ({
                    ...current,
                    [mission.id]: option.value,
                  }))
                }
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.help}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <MissionIdea mission={mission} />
      <MissionTrendContext mission={mission} />
      {selected === 'GUIDED' || selected === 'READY_TO_USE' ? (
        <MissionGuide mission={missionForUse} />
      ) : null}
      {selected === 'READY_TO_USE' ? (
        <div className="mission-assistance-content">
          <h4>{variant?.selectedAt ? '使用する別案' : '完成版'}</h4>
          <MissionContent mission={missionForUse} />
        </div>
      ) : null}
      {controller.active && !variant ? (
        <div className="mission-variant-actions">
          <button
            type="button"
            disabled={controller.busy || controller.variantPointCost === null}
            onClick={() => controller.requestVariant(mission.id)}
          >
            {controller.variantPointCost === null
              ? 'ポイント交換を利用できません'
              : `${controller.variantPointCost} WPで別の案を見る`}
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
              controller.busy ||
              controller.variantPointCost === null ||
              !(controller.variantInstructions[mission.id] ?? '').trim()
            }
            onClick={() =>
              controller.requestVariant(mission.id, controller.variantInstructions[mission.id])
            }
          >
            {controller.variantPointCost === null
              ? 'ポイント交換を利用できません'
              : `${controller.variantPointCost} WPで内容を直す`}
          </button>
          {confirmation?.missionId === mission.id ? (
            <section
              className="mission-variant-confirmation"
              role="alertdialog"
              aria-labelledby={`variant-confirmation-${mission.id}`}
            >
              <h4 id={`variant-confirmation-${mission.id}`}>WPを使いますか？</h4>
              <p>
                <strong>{controller.variantPointCost} WP</strong>を使って
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
                  {controller.variantPointCost} WPを使って作る
                </button>
              </div>
            </section>
          ) : null}
          <p>
            作成に使ったWPは、失敗した場合に戻ります。{' '}
            <a href={`/points?workspaceId=${encodeURIComponent(workspaceId)}`}>残高を見る</a>
          </p>
        </div>
      ) : null}
      {variant && !variant.selectedAt ? (
        <aside className="mission-variant">
          <h4>別の案</h4>
          <MissionContent mission={{ ...mission, content: variant.content }} />
          <button
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.selectVariant(mission.id, variant.id)}
          >
            この案を使う
          </button>
        </aside>
      ) : null}
      {variant?.selectedAt ? <p className="mission-step-complete">✓ 別の案を使用中です</p> : null}
      {mission.externalLinkUsage ? (
        <aside className="mission-link-summary">
          <h4>あなた専用の紹介URLを入れました</h4>
          <p>
            <strong>紹介するもの：</strong>
            {mission.externalLinkUsage.productName}
          </p>
          {mission.externalLinkUsage.campaignName ? (
            <p>
              <strong>参加する企画：</strong>
              {mission.externalLinkUsage.campaignName}
            </p>
          ) : null}
          <p className="mission-link-summary__url">{mission.externalLinkUsage.insertedUrl}</p>
          <p>
            {mission.externalLinkUsage.expiresAt
              ? `使える期限：${displayDate(mission.externalLinkUsage.expiresAt)}`
              : '使える期限：期限なし'}
          </p>
          <p>コピーする直前に、今も使えるURLか自動で確認します。</p>
        </aside>
      ) : null}
      {controller.active && mission.decision !== 'ACCEPTED' ? (
        <div className="mission-decision-actions">
          <button
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.decide(mission.id, 'ACCEPTED')}
          >
            採用する
          </button>{' '}
          <button
            type="button"
            disabled={controller.busy}
            onClick={() => controller.setRejecting(mission.id)}
          >
            今回は使わない
          </button>
        </div>
      ) : null}
      {controller.active && controller.rejecting === mission.id ? (
        <div className="mission-rejection">
          <p>理由を1つ選んでください。</p>
          {rejectionReasons.map(([value, label]) => (
            <span key={value}>
              <button
                type="button"
                disabled={controller.busy}
                onClick={() => void controller.decide(mission.id, 'REJECTED', value)}
              >
                {label}
              </button>{' '}
            </span>
          ))}
          <label>
            その他（任意）
            <textarea
              value={controller.otherDetail}
              onChange={(event) => controller.setOtherDetail(event.target.value)}
              maxLength={1000}
            />
          </label>
          <button
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.decide(mission.id, 'REJECTED', 'OTHER')}
          >
            その他で決定
          </button>
        </div>
      ) : null}
      {mission.decision === 'REJECTED' ? <p>今回は使わないと記録しました。</p> : null}
      {controller.active && mission.decision === 'ACCEPTED' ? (
        <PersonalDailyMissionAccepted mission={mission} controller={controller} />
      ) : null}
    </div>
  );
}

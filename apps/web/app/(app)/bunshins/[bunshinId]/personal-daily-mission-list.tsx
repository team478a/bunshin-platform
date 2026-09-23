'use client';

import type { MissionProgressView } from '../../../../src/activity-progress';
import {
  copyOptions,
  displayDate,
  missionAssistanceOptions,
  missionWithSelectedVariant,
  MissionContent,
  MissionGuide,
  MissionIdea,
  MissionTrendContext,
  platformLabels,
  rejectionReasons,
  type DailyMissionView,
} from './daily-mission-content';
import type { PersonalDailyMissionController } from './personal-daily-mission-controller';

export function PersonalDailyMissionList({
  workspaceId,
  missions,
  progress,
  localDate,
  controller,
}: {
  workspaceId: string;
  missions: DailyMissionView[];
  progress: MissionProgressView;
  localDate: string;
  controller: PersonalDailyMissionController;
}) {
  const {
    active,
    busy,
    expanded,
    assistanceSelections,
    rejecting,
    otherDetail,
    variantPointCost,
    variantInstructions,
    variantConfirmation,
    setAssistanceSelections,
    setRejecting,
    setOtherDetail,
    setVariantInstructions,
    setVariantConfirmation,
    view,
    transition,
    continuity,
    decide,
    copy,
    markPosted,
    feedback,
    requestVariant,
    generateVariant,
    selectVariant,
  } = controller;

  return (
    <>
      {missions.length === 0 ? (
        <div className="mission-empty">
          <strong>今日の投稿案はまだありません</strong>
          <p>SNS設定と週間計画を準備すると、投稿案を作成できます。</p>
        </div>
      ) : (
        <ul className="mission-list">
          {missions.map((mission) => (
            <li className="mission-card" key={mission.id}>
              <h3>
                {mission.missionDate} — {mission.topic}
              </h3>
              <div className="mission-meta">
                <span>{mission.platform ? platformLabels[mission.platform] : 'SNS'}</span>
                <span>
                  {mission.format === 'TEXT'
                    ? '文章'
                    : mission.format === 'SLIDE'
                      ? 'スライド'
                      : mission.format === 'IMAGE'
                        ? '画像'
                        : mission.format === 'LIVE_ACTION'
                          ? '自分で撮る動画'
                          : 'AI動画の作り方'}
                </span>
                <span>約{mission.estimatedMinutes}分</span>
                {mission.classification !== 'ORGANIC' && (
                  <span>
                    {mission.classification === 'ADVERTISEMENT'
                      ? '商品を紹介する企画（PR）'
                      : '商品に関係する企画'}
                  </span>
                )}
              </div>
              <p className="mission-reason">{mission.reason}</p>
              {active &&
                mission.missionDate === localDate &&
                !progress.weekly.days.some(
                  (day) => day.dailyMissionId === mission.id && day.status !== 'UNSEEN',
                ) && (
                  <div className="mission-continuity-actions">
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void continuity(mission.id, 'CONFIRMED')}
                    >
                      確認しました
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void continuity(mission.id, 'RESTED')}
                    >
                      今日は休む
                    </button>
                  </div>
                )}
              {mission.missionDate === localDate &&
                progress.weekly.days.some(
                  (day) => day.dailyMissionId === mission.id && day.status !== 'UNSEEN',
                ) && (
                  <p className="mission-continuity-saved" role="status">
                    今日の活動を保存しました
                  </p>
                )}
              <button type="button" disabled={busy} onClick={() => void view(mission)}>
                {expanded === mission.id ? '閉じる' : '内容を見る'}
              </button>{' '}
              {active && ['GENERATED', 'VIEWED'].includes(mission.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void transition(mission.id, 'started')}
                >
                  開始する
                </button>
              )}{' '}
              {active && ['GENERATED', 'VIEWED', 'STARTED'].includes(mission.status) && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void transition(mission.id, 'completed')}
                  >
                    完了
                  </button>{' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void transition(mission.id, 'skipped')}
                  >
                    今日は見送る
                  </button>
                </>
              )}
              {expanded === mission.id && (
                <div className="mission-detail">
                  {(() => {
                    const selected = assistanceSelections[mission.id] ?? mission.assistanceLevel;
                    const missionForUse = missionWithSelectedVariant(mission);
                    const variant = mission.variants[0];
                    return (
                      <>
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
                                    setAssistanceSelections((current) => ({
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
                        {(selected === 'GUIDED' || selected === 'READY_TO_USE') && (
                          <MissionGuide mission={missionForUse} />
                        )}
                        {selected === 'READY_TO_USE' && (
                          <div className="mission-assistance-content">
                            <h4>{variant?.selectedAt ? '使用する別案' : '完成版'}</h4>
                            <MissionContent mission={missionForUse} />
                          </div>
                        )}
                        {active && !variant && (
                          <div className="mission-variant-actions">
                            <button
                              type="button"
                              disabled={busy || variantPointCost === null}
                              onClick={() => requestVariant(mission.id)}
                            >
                              {variantPointCost === null
                                ? 'ポイント交換を利用できません'
                                : `${variantPointCost} WPで別の案を見る`}
                            </button>
                            <label>
                              直したいところ（任意）
                              <textarea
                                value={variantInstructions[mission.id] ?? ''}
                                maxLength={500}
                                onChange={(event) =>
                                  setVariantInstructions((current) => ({
                                    ...current,
                                    [mission.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                variantPointCost === null ||
                                !(variantInstructions[mission.id] ?? '').trim()
                              }
                              onClick={() =>
                                requestVariant(mission.id, variantInstructions[mission.id])
                              }
                            >
                              {variantPointCost === null
                                ? 'ポイント交換を利用できません'
                                : `${variantPointCost} WPで内容を直す`}
                            </button>
                            {variantConfirmation?.missionId === mission.id ? (
                              <section
                                className="mission-variant-confirmation"
                                role="alertdialog"
                                aria-labelledby={`variant-confirmation-${mission.id}`}
                              >
                                <h4 id={`variant-confirmation-${mission.id}`}>WPを使いますか？</h4>
                                <p>
                                  <strong>{variantPointCost} WP</strong>を使って
                                  {variantConfirmation.instruction ? '内容を直した案' : '別の案'}
                                  を1つ作ります。作成に失敗した場合、WPは戻ります。
                                </p>
                                <div className="mission-variant-confirmation__actions">
                                  <button
                                    className="button button--secondary"
                                    type="button"
                                    onClick={() => setVariantConfirmation(null)}
                                  >
                                    やめる
                                  </button>
                                  <button
                                    className="button button--primary"
                                    type="button"
                                    onClick={() =>
                                      void generateVariant(
                                        mission.id,
                                        variantConfirmation.instruction,
                                      )
                                    }
                                  >
                                    {variantPointCost} WPを使って作る
                                  </button>
                                </div>
                              </section>
                            ) : null}
                            <p>
                              作成に使ったWPは、失敗した場合に戻ります。{' '}
                              <a href={`/points?workspaceId=${encodeURIComponent(workspaceId)}`}>
                                残高を見る
                              </a>
                            </p>
                          </div>
                        )}
                        {variant && !variant.selectedAt && (
                          <aside className="mission-variant">
                            <h4>別の案</h4>
                            <MissionContent mission={{ ...mission, content: variant.content }} />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void selectVariant(mission.id, variant.id)}
                            >
                              この案を使う
                            </button>
                          </aside>
                        )}
                        {variant?.selectedAt && (
                          <p className="mission-step-complete">✓ 別の案を使用中です</p>
                        )}
                        {mission.externalLinkUsage && (
                          <aside className="mission-link-summary">
                            <h4>あなた専用の紹介URLを入れました</h4>
                            <p>
                              <strong>紹介するもの：</strong>
                              {mission.externalLinkUsage.productName}
                            </p>
                            {mission.externalLinkUsage.campaignName && (
                              <p>
                                <strong>参加する企画：</strong>
                                {mission.externalLinkUsage.campaignName}
                              </p>
                            )}
                            <p className="mission-link-summary__url">
                              {mission.externalLinkUsage.insertedUrl}
                            </p>
                            <p>
                              {mission.externalLinkUsage.expiresAt
                                ? `使える期限：${displayDate(mission.externalLinkUsage.expiresAt)}`
                                : '使える期限：期限なし'}
                            </p>
                            <p>コピーする直前に、今も使えるURLか自動で確認します。</p>
                          </aside>
                        )}
                      </>
                    );
                  })()}
                  {active && mission.decision !== 'ACCEPTED' && (
                    <div className="mission-decision-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(mission.id, 'ACCEPTED')}
                      >
                        採用する
                      </button>{' '}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRejecting(mission.id)}
                      >
                        今回は使わない
                      </button>
                    </div>
                  )}
                  {active && rejecting === mission.id && (
                    <div className="mission-rejection">
                      <p>理由を1つ選んでください。</p>
                      {rejectionReasons.map(([value, label]) => (
                        <span key={value}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void decide(mission.id, 'REJECTED', value)}
                          >
                            {label}
                          </button>{' '}
                        </span>
                      ))}
                      <label>
                        その他（任意）
                        <textarea
                          value={otherDetail}
                          onChange={(event) => setOtherDetail(event.target.value)}
                          maxLength={1000}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(mission.id, 'REJECTED', 'OTHER')}
                      >
                        その他で決定
                      </button>
                    </div>
                  )}
                  {mission.decision === 'REJECTED' && <p>今回は使わないと記録しました。</p>}
                  {active && mission.decision === 'ACCEPTED' && (
                    <div className="mission-accepted">
                      <p className="mission-step-complete">✓ 採用しました</p>
                      {(assistanceSelections[mission.id] ?? mission.assistanceLevel) !==
                        'READY_TO_USE' && <p>完成版を見ると、文章や台本をコピーできます。</p>}
                      {(assistanceSelections[mission.id] ?? mission.assistanceLevel) ===
                        'READY_TO_USE' &&
                        copyOptions(missionWithSelectedVariant(mission)).map((option, index) => (
                          <span key={`${option.type}-${index}`}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void copy(
                                  mission.id,
                                  option.value,
                                  option.type,
                                  'metadata' in option ? option.metadata : undefined,
                                )
                              }
                            >
                              {option.label}
                            </button>{' '}
                          </span>
                        ))}
                      {mission.postedAt === null ? (
                        <div className="mission-post-action">
                          <p className="mission-self-report-notice">
                            SNSへ実際に投稿した後で押してください。投稿したかどうかは自動では確認されず、自己申告で記録されます。
                          </p>
                          <button
                            type="button"
                            disabled={busy || mission.platform === null}
                            onClick={() => void markPosted(mission)}
                          >
                            投稿しました
                          </button>
                          {mission.platform === null && (
                            <p>投稿したことを記録するには、使うSNSを先に決めてください。</p>
                          )}
                        </div>
                      ) : (
                        <div className="mission-feedback">
                          <p className="mission-step-complete">✓ 投稿済み</p>
                          <p>この投稿はあなたらしかったですか？</p>
                          {(
                            [
                              ['GOOD', '👍 自分らしい'],
                              ['NEUTRAL', '😐 普通'],
                              ['BAD', '👎 違う'],
                            ] as const
                          ).map(([rating, label]) => (
                            <button
                              key={rating}
                              type="button"
                              aria-pressed={mission.feedback === rating}
                              disabled={busy || mission.feedback === rating}
                              onClick={() => void feedback(mission.id, rating)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

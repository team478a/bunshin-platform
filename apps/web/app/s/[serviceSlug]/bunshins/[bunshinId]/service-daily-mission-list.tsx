'use client';

import { emptyBusinessOutcomes } from '../../../../../src/services/business-outcomes';
import {
  MissionContent,
  MissionGuide,
  MissionIdea,
  MissionTrendContext,
  copyOptions,
  imagePostHeadline,
  missionWithSelectedVariant,
  rejectionReasons,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import {
  serviceExecutionResultOptions,
  type ServiceDailyMissionController,
} from './service-daily-mission-controller';

export function ServiceDailyMissionList({
  missions,
  controller,
  variantPointCost,
  pointWorkspaceId,
  serviceSlug,
  active,
  videos,
  imageCreationBaseHref,
  businessFree,
}: {
  missions: DailyMissionView[];
  controller: ServiceDailyMissionController;
  variantPointCost: number | null;
  pointWorkspaceId: string;
  serviceSlug: string;
  active: boolean;
  videos: Record<string, { href: string; status: string }>;
  imageCreationBaseHref?: string;
  businessFree: boolean;
}) {
  const {
    expanded,
    pendingAction,
    rejecting,
    otherDetail,
    variantInstructions,
    variantConfirmation,
    businessOutcomes,
    setRejecting,
    setOtherDetail,
    setVariantInstructions,
    setVariantConfirmation,
    setBusinessOutcomes,
    recordExecutionResult,
    copy,
    markPosted,
    openMission,
    feedback,
    saveBusinessOutcomes,
    requestVariant,
    generateVariant,
    selectVariant,
    decide,
  } = controller;

  return (
    <ul className="mission-list">
      {missions.map((mission) => {
        const isImageMission = mission.format === 'IMAGE' || mission.format === 'SLIDE';
        const imageCreationHref =
          isImageMission && imageCreationBaseHref
            ? `${imageCreationBaseHref}?mission=${encodeURIComponent(mission.id)}`
            : null;
        const preparedMission = missionWithSelectedVariant(mission);
        const preparedCopyOptions = copyOptions(preparedMission);
        const imageInstruction = preparedCopyOptions.find(
          (option) => option.type === 'COPIED_IMAGE_INSTRUCTION',
        );
        const postCaption = preparedCopyOptions.find((option) => option.type === 'COPIED_TEXT');
        const imageHeadline = imagePostHeadline(preparedMission);
        return (
          <li
            className={`mission-card${isImageMission ? ' mission-card--simple' : ''}`}
            key={mission.id}
          >
            {videos[mission.id] ? (
              <p>
                <a href={videos[mission.id]!.href}>
                  {['READY_FOR_REVIEW', 'COMPLETED'].includes(videos[mission.id]!.status)
                    ? 'この投稿案の字幕動画を見る'
                    : videos[mission.id]!.status === 'FAILED'
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
                    第{mission.businessAction.program.cycleNumber}期・
                    {mission.businessAction.program.day}日目 /
                    {mission.businessAction.program.phaseLabel}
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
                      disabled={pendingAction !== null || mission.executionResult === value}
                      onClick={() => void recordExecutionResult(mission.id, value)}
                    >
                      {mission.executionResult === value ? `✓ ${label}` : label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {imageCreationHref ? (
              <a className="button mission-create-image" href={imageCreationHref}>
                画像作成へ進む
              </a>
            ) : isImageMission ? (
              <div className="mission-manual-image-flow">
                <section>
                  <p className="mission-manual-image-flow__number">1</p>
                  <div>
                    <h4>画像を作る文章をコピー</h4>
                    <p>投稿テーマが5枚で完結する、画像と文章を作るための指示です。</p>
                    <p>
                      <strong>1枚目の見出し：</strong>
                      <br />「{imageHeadline}」
                    </p>
                    <ol>
                      <li>表紙</li>
                      <li>読者の悩み・共感</li>
                      <li>理由・気づき</li>
                      <li>今日できる解決策</li>
                      <li>まとめ・次の行動</li>
                    </ol>
                    {imageInstruction ? (
                      <button
                        className="mission-copy-action"
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() =>
                          void copy(mission, imageInstruction.value, imageInstruction.type)
                        }
                      >
                        画像用の文章をコピー
                      </button>
                    ) : (
                      <p>画像用の文章を準備できませんでした。</p>
                    )}
                  </div>
                </section>
                <section>
                  <p className="mission-manual-image-flow__number">2</p>
                  <div>
                    <h4>画像を作れるAIに貼り付ける</h4>
                    <p>
                      ChatGPTなど普段使っている画像AIを開き、入力欄を長押しして「ペースト」を押します。
                    </p>
                    <p>画像が1枚だけ出た場合は「次」と送ると、続きの画像を作れます。</p>
                  </div>
                </section>
                <section>
                  <p className="mission-manual-image-flow__number">3</p>
                  <div>
                    <h4>5枚の画像をスマホへ保存</h4>
                    <p>できた画像を1枚ずつ長押しして「写真に保存」を押します。</p>
                  </div>
                </section>
                <section>
                  <p className="mission-manual-image-flow__number">4</p>
                  <div>
                    <h4>動画にする場合はCapCutへ</h4>
                    <p>5枚を順番に並べ、1枚を2〜3秒ずつ表示すると短い解説動画として使えます。</p>
                  </div>
                </section>
                <section>
                  <p className="mission-manual-image-flow__number">5</p>
                  <div>
                    <h4>投稿文をコピー</h4>
                    <p>画像と一緒に載せる文章です。コピーしてInstagramへ貼り付けます。</p>
                    {postCaption ? (
                      <button
                        className="mission-copy-action"
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => void copy(mission, postCaption.value, postCaption.type)}
                      >
                        投稿文をコピー
                      </button>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}
            <button
              className={isImageMission ? 'mission-detail-toggle' : undefined}
              type="button"
              onClick={() => void openMission(mission)}
            >
              {expanded === mission.id
                ? isImageMission
                  ? '詳しい内容を閉じる'
                  : '閉じる'
                : mission.businessAction && !mission.businessAction.postContentIsPrimary
                  ? '参考の投稿案を見る'
                  : isImageMission
                    ? '内容を確認・変更する'
                    : '内容を見る'}
            </button>
            {expanded === mission.id ? (
              <div className="mission-detail">
                {isImageMission ? (
                  <details className="mission-advanced-content">
                    <summary>企画の理由や自分で作る方法を見る</summary>
                    <MissionIdea mission={mission} />
                    <MissionTrendContext mission={mission} />
                    <MissionGuide mission={missionWithSelectedVariant(mission)} />
                    <MissionContent mission={missionWithSelectedVariant(mission)} />
                  </details>
                ) : (
                  <>
                    <MissionIdea mission={mission} />
                    <MissionTrendContext mission={mission} />
                    <MissionGuide mission={missionWithSelectedVariant(mission)} />
                    <MissionContent mission={missionWithSelectedVariant(mission)} />
                  </>
                )}
                {active && variantPointCost !== null && !mission.variants[0] ? (
                  <div className="mission-variant-actions">
                    <button
                      type="button"
                      disabled={pendingAction !== null || variantPointCost === null}
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
                        pendingAction !== null ||
                        variantPointCost === null ||
                        !(variantInstructions[mission.id] ?? '').trim()
                      }
                      onClick={() => requestVariant(mission.id, variantInstructions[mission.id])}
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
                          {variantConfirmation.instruction ? '内容を直した案' : '別の案'}を
                          1つ作ります。作成に失敗した場合、WPは戻ります。
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
                              void generateVariant(mission.id, variantConfirmation.instruction)
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
                    <MissionContent
                      mission={{ ...mission, content: mission.variants[0].content }}
                    />
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={() => void selectVariant(mission.id, mission.variants[0]!.id)}
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
                      disabled={pendingAction !== null}
                      onClick={() => void decide(mission.id, 'ACCEPTED')}
                    >
                      採用する
                    </button>{' '}
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={() => setRejecting(mission.id)}
                    >
                      今回は使わない
                    </button>
                  </div>
                ) : null}
                {active && rejecting === mission.id ? (
                  <div className="mission-rejection">
                    <p>近い理由を1つ選んでください。</p>
                    {rejectionReasons.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => void decide(mission.id, 'REJECTED', value)}
                      >
                        {label}
                      </button>
                    ))}
                    <label>
                      その他（書かなくても大丈夫です）
                      <textarea
                        value={otherDetail}
                        maxLength={1000}
                        onChange={(event) => setOtherDetail(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={() => void decide(mission.id, 'REJECTED', 'OTHER')}
                    >
                      その他で決定
                    </button>
                  </div>
                ) : null}
                {mission.decision === 'REJECTED' ? <p>今回は使わないと記録しました。</p> : null}
                {active && mission.decision === 'ACCEPTED' ? (
                  <div className="mission-accepted">
                    <p className="mission-step-complete">✓ 採用しました</p>
                    {copyOptions(missionWithSelectedVariant(mission)).map((option, index) => (
                      <button
                        key={`${option.type}:${index}`}
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() =>
                          void copy(
                            mission,
                            option.value,
                            option.type,
                            'metadata' in option ? option.metadata : undefined,
                          )
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                    {mission.postedAt === null ? (
                      <div className="mission-post-action">
                        <p className="mission-self-report-notice">
                          SNSへ実際に投稿した後で押してください。投稿したかどうかは自動では確認されず、自己申告で記録されます。
                        </p>
                        <button
                          type="button"
                          disabled={pendingAction !== null || mission.platform === null}
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
                        <p>この投稿は、あなたらしかったですか？</p>
                        <small>
                          回答は、次週の投稿形式や切り口をあなたに合わせるために使います。
                        </small>
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
                            disabled={pendingAction !== null || mission.feedback === rating}
                            onClick={() => void feedback(mission.id, rating)}
                          >
                            {label}
                          </button>
                        ))}
                        {businessFree ? (
                          <section className="mission-business-outcomes">
                            <h4>この投稿から、お客様の反応はありましたか？</h4>
                            <p>なければ0のままで大丈夫です。お客様の名前は入力しません。</p>
                            {(
                              [
                                ['inquiries', '問い合わせ'],
                                ['reservations', '予約'],
                                ['visits', '来店'],
                                ['orders', '購入・申込'],
                                ['other', 'その他の反応'],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key}>
                                {label}の件数
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={999}
                                  value={
                                    (businessOutcomes[mission.id] ?? emptyBusinessOutcomes())[key]
                                  }
                                  onChange={(event) => {
                                    const count = Math.max(
                                      0,
                                      Math.min(
                                        999,
                                        Number.parseInt(event.target.value || '0', 10) || 0,
                                      ),
                                    );
                                    setBusinessOutcomes((current) => ({
                                      ...current,
                                      [mission.id]: {
                                        ...(current[mission.id] ?? emptyBusinessOutcomes()),
                                        [key]: count,
                                      },
                                    }));
                                  }}
                                />
                              </label>
                            ))}
                            <button
                              type="button"
                              disabled={pendingAction !== null}
                              onClick={() => void saveBusinessOutcomes(mission.id)}
                            >
                              お客様の反応を保存する
                            </button>
                          </section>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

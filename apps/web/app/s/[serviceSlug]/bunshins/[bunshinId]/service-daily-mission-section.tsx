'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClientRequestId } from '../../../../ui/client-request-id';
import { RewardsActionFeedback, type RewardsAction } from '../../../../ui/rewards-action-feedback';
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
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pointNotice, setPointNotice] = useState<RewardsAction | null>(null);
  const [manualCopy, setManualCopy] = useState<{ title: string; value: string } | null>(null);
  const [variantInstructions, setVariantInstructions] = useState<Record<string, string>>({});

  const key = () => createClientRequestId();

  async function generateToday() {
    if (!generation || pendingAction) return;
    const requestId = key();
    setPendingAction('generate');
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({ ...generation, idempotencyKey: requestId }),
      });
      if (!response.ok) {
        setMessage(
          `今日の投稿案を準備できませんでした。もう一度お試しください。（受付番号: ${requestId}）`,
        );
        return;
      }
      setMessage('今日の投稿案を準備しました。');
      router.refresh();
    } catch {
      setMessage(`通信できませんでした。もう一度お試しください。（受付番号: ${requestId}）`);
    } finally {
      setPendingAction(null);
    }
  }

  async function record(id: string, resource: string, payload: Record<string, unknown>) {
    if (pendingAction) return false;
    setPendingAction(`${id}:${resource}`);
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${resource}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setMessage('操作を記録できませんでした。もう一度お試しください。');
        return false;
      }
      return true;
    } finally {
      setPendingAction(null);
    }
  }

  async function decide(id: string, decision: 'ACCEPTED' | 'REJECTED', rejectionReason?: string) {
    const ok = await record(id, 'decision', {
      decision,
      idempotencyKey: key(),
      ...(rejectionReason ? { rejectionReason } : {}),
      ...(rejectionReason === 'OTHER' && otherDetail.trim()
        ? { rejectionDetail: otherDetail.trim() }
        : {}),
    });
    if (ok) {
      setRejecting(null);
      setOtherDetail('');
      router.refresh();
    }
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
      // LINE内ブラウザではClipboard API自体が提供されない場合がある。
    }
    const selectedCopy = copyWithSelection(value);
    return selectedCopy || (await clipboardAttempt) || false;
  }

  async function copy(
    mission: DailyMissionView,
    value: string,
    type: string,
    metadata?: { slideIndex: number },
  ) {
    if (pendingAction) return;
    const id = mission.id;
    setMessage(null);
    setManualCopy(null);
    const authorizationData = mission.copyAuthorization;
    if (!authorizationData) {
      setMessage('コピーの準備を確認できませんでした。画面を開き直してください。');
      return;
    }
    if (!authorizationData?.allowed) {
      setMessage(
        authorizationData?.reason === 'LINK_CHANGED'
          ? 'あなた専用の紹介URLが新しくなりました。この投稿案を作り直してください。'
          : authorizationData?.reason === 'APPROVAL_PENDING'
            ? 'この投稿案は運営者の確認待ちです。確認が終わるまでコピーできません。'
            : authorizationData?.reason === 'APPROVAL_CHANGES_REQUESTED'
              ? `この投稿案は見直しが必要です。${authorizationData.reviewNote ? `理由：${authorizationData.reviewNote}` : '運営者の案内を確認してください。'}`
              : 'この紹介URLは今は使えません。運営者へお問い合わせください。',
      );
      return;
    }
    setPendingAction(`${id}:copy`);
    if (!(await writeToClipboard(value))) {
      setManualCopy({
        title: type === 'COPIED_TEXT' ? '投稿文' : '画像用の文章',
        value,
      });
      setMessage('自動コピーができないため、下の文章を長押ししてコピーしてください。');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    const ok = await record(id, 'activities', {
      type,
      idempotencyKey: key(),
      ...(metadata ? { metadata } : {}),
    });
    setMessage(
      ok
        ? type === 'COPIED_IMAGE_INSTRUCTION'
          ? 'コピーしました。次に、画像を作れるAIを開いて貼り付けてください。'
          : type === 'COPIED_TEXT'
            ? '投稿文をコピーしました。Instagramの投稿画面へ貼り付けてください。'
            : 'コピーしました。SNSへ貼り付けて使えます。'
        : null,
    );
  }

  async function markPosted(mission: DailyMissionView) {
    if (!mission.platform) return;
    const recorded = await record(mission.id, 'post-record', {
      platform: mission.platform,
      idempotencyKey: key(),
    });
    if (recorded) {
      if (rewardsPilotActive) setPointNotice('POSTED');
      router.refresh();
    }
  }

  async function openMission(mission: DailyMissionView) {
    const opening = expanded !== mission.id;
    setExpanded(opening ? mission.id : null);
    if (!opening || !active) return;
    const recorded = await record(mission.id, 'activities', {
      type: 'VIEWED',
      idempotencyKey: key(),
    });
    if (recorded && rewardsPilotActive) setPointNotice('VIEWED');
  }

  async function feedback(id: string, rating: 'GOOD' | 'NEUTRAL' | 'BAD') {
    if (await record(id, 'feedback', { rating, idempotencyKey: key() })) router.refresh();
  }

  async function generateVariant(missionId: string, instruction?: string) {
    if (pendingAction) return;
    if (variantPointCost === null) {
      setMessage('ポイント交換を利用できません。時間をおいて、もう一度お試しください。');
      return;
    }
    if (
      !window.confirm(
        `${variantPointCost} WPを使って${instruction?.trim() ? '内容を直した案' : '別の案'}を作ります。よろしいですか？`,
      )
    )
      return;
    const requestId = key();
    setPendingAction(`${missionId}:variant`);
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(missionId)}/variants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({
          idempotencyKey: requestId,
          acceptedPointCost: variantPointCost,
          ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        setMessage(
          payload?.error?.code === 'CONTENT_REJECTED'
            ? `安全に使える別案を作れませんでした。時間をおいてもう一度お試しください。（受付番号: ${requestId}）`
            : payload?.error?.code === 'FORBIDDEN'
              ? 'WPが足りないか、ポイント交換を利用できません。ポイント画面を確認してください。'
              : payload?.error?.code === 'CONFLICT'
                ? '価格が変わったか、別案がすでにあります。画面を更新してください。'
                : `別案を作れませんでした。もう一度お試しください。（受付番号: ${requestId}）`,
        );
        return;
      }
      setVariantInstructions((current) => ({ ...current, [missionId]: '' }));
      router.refresh();
    } catch {
      setMessage(`通信できませんでした。もう一度お試しください。（受付番号: ${requestId}）`);
    } finally {
      setPendingAction(null);
    }
  }

  async function selectVariant(missionId: string, variantId: string) {
    if (
      await record(missionId, `variants/${encodeURIComponent(variantId)}/select`, {
        idempotencyKey: key(),
      })
    )
      router.refresh();
  }

  return (
    <section className="mission-experience">
      <header className="mission-experience__header">
        <p className="eyebrow">今日やること</p>
        <h2>{imageCreationBaseHref ? '投稿画像を作りましょう' : '今日の投稿を準備しましょう'}</h2>
        <p>
          {imageCreationBaseHref
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
              {isImageMission ? (
                <p className="mission-card__date">{mission.missionDate}の投稿</p>
              ) : null}
              {isImageMission ? <p className="eyebrow">この5枚のテーマ</p> : null}
              <h3>
                {isImageMission ? mission.topic : `${mission.missionDate} — ${mission.topic}`}
              </h3>
              {isImageMission && imageCreationHref ? (
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
                  {active && !mission.variants[0] ? (
                    <div className="mission-variant-actions">
                      <button
                        type="button"
                        disabled={pendingAction !== null || variantPointCost === null}
                        onClick={() => void generateVariant(mission.id)}
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
                        onClick={() =>
                          void generateVariant(mission.id, variantInstructions[mission.id])
                        }
                      >
                        {variantPointCost === null
                          ? 'ポイント交換を利用できません'
                          : `${variantPointCost} WPで内容を直す`}
                      </button>
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
    </section>
  );
}

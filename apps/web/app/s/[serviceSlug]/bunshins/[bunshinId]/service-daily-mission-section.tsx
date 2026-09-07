'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClientRequestId } from '../../../../ui/client-request-id';
import {
  MissionContent,
  MissionGuide,
  MissionIdea,
  MissionTrendContext,
  copyOptions,
  missionWithSelectedVariant,
  rejectionReasons,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';

export function ServiceDailyMissionSection({
  endpoint,
  missions,
  variantPointCost,
  pointWorkspaceId,
  active,
  videos = {},
}: {
  endpoint: string;
  missions: DailyMissionView[];
  variantPointCost: number | null;
  pointWorkspaceId: string;
  active: boolean;
  videos?: Record<string, { href: string; status: string }>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [variantInstructions, setVariantInstructions] = useState<Record<string, string>>({});

  const key = () => createClientRequestId();

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

  async function copy(id: string, value: string, type: string, metadata?: { slideIndex: number }) {
    if (pendingAction) return;
    setPendingAction(`${id}:copy-authorization`);
    setMessage(null);
    const authorization = await fetch(`${endpoint}/${encodeURIComponent(id)}/copy-authorization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => null);
    if (!authorization?.ok) {
      setMessage('専用URLを確認できませんでした。少し待ってから、もう一度お試しください。');
      setPendingAction(null);
      return;
    }
    const authorizationResult = (await authorization.json().catch(() => null)) as {
      data?: { allowed?: boolean; reason?: string; reviewNote?: string | null };
    } | null;
    const authorizationData = authorizationResult?.data;
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
      setPendingAction(null);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setMessage('コピーできませんでした。ブラウザの設定を確認してください。');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    const ok = await record(id, 'activities', {
      type,
      idempotencyKey: key(),
      ...(metadata ? { metadata } : {}),
    });
    setMessage(ok ? 'コピーしました。SNSへ貼り付けて使えます。' : null);
  }

  async function markPosted(mission: DailyMissionView) {
    if (!mission.platform) return;
    if (
      await record(mission.id, 'post-record', {
        platform: mission.platform,
        idempotencyKey: key(),
      })
    )
      router.refresh();
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
        <p className="eyebrow">今日のおすすめ</p>
        <h2>届いた投稿案</h2>
        <p>投稿予定の日に、あなたに合った内容を自動で準備し、LINEでお知らせします。</p>
      </header>
      {message ? (
        <p className="notice" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {missions.length === 0 ? (
        <p>届いた投稿案はまだありません。自動のお届けを設定すると、投稿予定の日に届きます。</p>
      ) : null}
      <ul className="mission-list">
        {missions.map((mission) => (
          <li className="mission-card" key={mission.id}>
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
            <h3>
              {mission.missionDate} — {mission.topic}
            </h3>
            <p>{mission.reason}</p>
            <button
              type="button"
              onClick={() => {
                const opening = expanded !== mission.id;
                setExpanded(opening ? mission.id : null);
                if (opening && active)
                  void record(mission.id, 'activities', {
                    type: 'VIEWED',
                    idempotencyKey: key(),
                  });
              }}
            >
              {expanded === mission.id ? '閉じる' : '内容を見る'}
            </button>
            {expanded === mission.id ? (
              <div className="mission-detail">
                <MissionIdea mission={mission} />
                <MissionTrendContext mission={mission} />
                <MissionGuide mission={missionWithSelectedVariant(mission)} />
                <MissionContent mission={missionWithSelectedVariant(mission)} />
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
                      <a href={`/points?workspaceId=${encodeURIComponent(pointWorkspaceId)}`}>
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
                            mission.id,
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
                      <button
                        type="button"
                        disabled={pendingAction !== null || mission.platform === null}
                        onClick={() => void markPosted(mission)}
                      >
                        投稿しました
                      </button>
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
        ))}
      </ul>
    </section>
  );
}

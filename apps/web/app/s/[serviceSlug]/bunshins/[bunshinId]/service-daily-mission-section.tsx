'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  MissionContent,
  MissionGuide,
  MissionIdea,
  MissionTrendContext,
  copyOptions,
  rejectionReasons,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';

const platformLabels = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
} as const;

export function ServiceDailyMissionSection({
  endpoint,
  profiles,
  missions,
  active,
}: {
  endpoint: string;
  profiles: Array<{
    id: string;
    platform: keyof typeof platformLabels;
    status: 'ACTIVE' | 'INACTIVE';
  }>;
  missions: DailyMissionView[];
  active: boolean;
}) {
  const router = useRouter();
  const activeProfiles = profiles.filter(({ status }) => status === 'ACTIVE');
  const [socialProfileId, setSocialProfileId] = useState(activeProfiles[0]?.id ?? '');
  const [missionDate, setMissionDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          missionDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
          socialProfileId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setMessage(
        response.ok
          ? '今日の投稿案を作りました。'
          : response.status === 409
            ? 'この日の投稿案は、すでに作成済みです。'
            : '投稿案を作れませんでした。SNS戦略と確定済みの週間計画を確認してください。',
      );
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  const key = () => crypto.randomUUID();

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
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setMessage('コピーできませんでした。ブラウザの設定を確認してください。');
      return;
    }
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

  return (
    <section className="mission-experience">
      <header className="mission-experience__header">
        <p className="eyebrow">今日のおすすめ</p>
        <h2>今日の投稿案</h2>
        <p>確定した1週間の予定をもとに、今日使える内容を作ります。</p>
      </header>
      {active ? (
        <div className="mission-generator">
          <label>
            日付
            <input
              type="date"
              value={missionDate}
              onChange={(event) => setMissionDate(event.target.value)}
            />
          </label>
          <label>
            SNS
            <select
              value={socialProfileId}
              onChange={(event) => setSocialProfileId(event.target.value)}
            >
              {activeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {platformLabels[profile.platform]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !missionDate || !socialProfileId}
            onClick={() => void generate()}
          >
            {pending ? '考えています…' : '今日の投稿案を作る'}
          </button>
          {activeProfiles.length === 0 ? <p>先に、使いたいSNSを登録してください。</p> : null}
        </div>
      ) : null}
      {message ? <p className="notice">{message}</p> : null}
      {missions.length === 0 ? <p>今日の投稿案はまだありません。</p> : null}
      <ul className="mission-list">
        {missions.map((mission) => (
          <li className="mission-card" key={mission.id}>
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
                <MissionGuide mission={mission} />
                <MissionContent mission={mission} />
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
                    {copyOptions(mission).map((option, index) => (
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

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  MissionContent,
  MissionGuide,
  MissionIdea,
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
              onClick={() => setExpanded(expanded === mission.id ? null : mission.id)}
            >
              {expanded === mission.id ? '閉じる' : '内容を見る'}
            </button>
            {expanded === mission.id ? (
              <div className="mission-detail">
                <MissionIdea mission={mission} />
                <MissionGuide mission={mission} />
                <MissionContent mission={mission} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

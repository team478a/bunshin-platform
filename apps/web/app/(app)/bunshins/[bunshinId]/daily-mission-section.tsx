'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type DailyMissionView = {
  id: string;
  missionDate: string;
  status: 'GENERATED' | 'VIEWED' | 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED';
  format: 'TEXT' | 'SLIDE' | 'IMAGE' | 'LIVE_ACTION' | 'AI_VIDEO_PROMPT';
  estimatedMinutes: number;
  topic: string;
  angle: string;
  reason: string;
  qualityScore: number | null;
  content: Record<string, unknown>;
};

function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}
function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}
function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function MissionContent({ mission }: { mission: DailyMissionView }) {
  const content = mission.content;
  if (mission.format === 'TEXT') {
    return (
      <div>
        <p>{text(content['body'])}</p>
        {strings(content['threadParts']).map((part, index) => (
          <p key={index}>{part}</p>
        ))}
        {text(content['cta']) && <p>CTA: {text(content['cta'])}</p>}
      </div>
    );
  }
  if (mission.format === 'SLIDE') {
    return (
      <ol>
        {records(content['slides']).map((slide, index) => (
          <li key={index}>
            <strong>{text(slide['headline'])}</strong>
            <p>{text(slide['body'])}</p>
          </li>
        ))}
      </ol>
    );
  }
  if (mission.format === 'LIVE_ACTION') {
    return (
      <div>
        <p>撮影指示: {text(content['shootingInstruction'])}</p>
        <ol>
          {records(content['script']).map((part, index) => (
            <li key={index}>
              {text(part['seconds'])}: {text(part['text'])}
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return (
      <div>
        <p>動画生成Prompt:</p>
        <p>{text(content['prompt'])}</p>
        {text(content['caption']) && <p>投稿文: {text(content['caption'])}</p>}
      </div>
    );
  }
  return (
    <div>
      <p>画像制作指示: {text(content['imageInstruction'])}</p>
      {text(content['overlayText']) && <p>画像内テキスト: {text(content['overlayText'])}</p>}
      <p>投稿文: {text(content['caption'])}</p>
    </div>
  );
}

export function DailyMissionSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  missions,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | null;
  missions: DailyMissionView[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = capabilityStatus === 'ACTIVE';
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/daily-missions`;

  async function transition(id: string, action: string) {
    setError(null);
    const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      setError('Missionを更新できませんでした。状態を確認して再度お試しください。');
      return false;
    }
    router.refresh();
    return true;
  }

  async function view(mission: DailyMissionView) {
    if (expanded === mission.id) {
      setExpanded(null);
      return;
    }
    if (mission.status === 'GENERATED' && active) {
      if (!(await transition(mission.id, 'viewed'))) return;
    }
    setExpanded(mission.id);
  }

  return (
    <section>
      <h2>Daily Mission</h2>
      <p>今日やることを確認し、進行状態を記録します。採用判断やコピーは後続機能です。</p>
      {error && <p role="alert">{error}</p>}
      {missions.length === 0 ? (
        <p>Missionはまだありません。</p>
      ) : (
        <ul>
          {missions.map((mission) => (
            <li key={mission.id}>
              <h3>
                {mission.missionDate} — {mission.topic}
              </h3>
              <p>
                {mission.format} / 目安{mission.estimatedMinutes}分 / {mission.status}
              </p>
              <p>{mission.reason}</p>
              <button type="button" onClick={() => void view(mission)}>
                {expanded === mission.id ? '閉じる' : '内容を見る'}
              </button>{' '}
              {active && ['GENERATED', 'VIEWED'].includes(mission.status) && (
                <button type="button" onClick={() => void transition(mission.id, 'started')}>
                  開始する
                </button>
              )}{' '}
              {active && ['GENERATED', 'VIEWED', 'STARTED'].includes(mission.status) && (
                <>
                  <button type="button" onClick={() => void transition(mission.id, 'completed')}>
                    完了
                  </button>{' '}
                  <button type="button" onClick={() => void transition(mission.id, 'skipped')}>
                    今日は見送る
                  </button>
                </>
              )}
              {expanded === mission.id && (
                <div>
                  <p>狙い: {mission.angle}</p>
                  <MissionContent mission={mission} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

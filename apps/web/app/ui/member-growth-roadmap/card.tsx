'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GrowthReadError,
  readGrowthSnapshot,
  type GrowthSnapshot,
  type RoadmapDisplay,
} from './data';
import './roadmap.css';

const labels = { COMPLETED: '達成済み', AVAILABLE: '利用可能', PREPARING: '準備中' } as const;
function checkedAt(value: string, timezone: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function evidence(item: RoadmapDisplay['stages'][number]['milestones'][number]) {
  if (item.achievement === 'UNKNOWN') return '達成状況は未確認です';
  if (item.achievement === 'COMPLETED')
    return item.availability.state === 'AVAILABLE'
      ? 'これまでの達成を確認しました'
      : '達成済みです。現在の利用可否は確認が必要です';
  if (item.availability.state === 'UNAVAILABLE') return '現在は利用できません';
  if (item.availability.state === 'PREPARING') return '利用の準備が整い次第ご案内します';
  return `${item.progress.current ?? '未確認'} / ${item.progress.target}`;
}
function Snapshot({ value }: { value: GrowthSnapshot }) {
  const { roadmap, usage } = value;
  const completed = roadmap.stages.reduce((sum, stage) => sum + stage.progress.completed, 0);
  const total = roadmap.stages.reduce((sum, stage) => sum + stage.progress.total, 0);
  const next = roadmap.nextRecommended;
  const nextItem = next
    ? roadmap.stages
        .find((stage) => stage.id === next.stageId)
        ?.milestones.find((item) => item.id === next.milestoneId)
    : null;
  return (
    <div className="member-growth__content">
      <section className="member-growth__next" aria-label="次のおすすめ">
        <p className="member-growth__eyebrow">次のおすすめ</p>
        {nextItem ? (
          <>
            <h3>{nextItem.title}</h3>
            <p>今の活動状況に合わせた次の一歩です。</p>
            {nextItem.id === 'FIRST_DECISION' ? <a href="#today-post">投稿案を確認する</a> : null}
          </>
        ) : (
          <p>
            今は新しいおすすめはありません。「今日やること」を進めながら、ご自身のペースで利用できます。
          </p>
        )}
      </section>
      <section aria-label="利用実績">
        <h3>これまでの活動</h3>
        <dl className="member-growth__metrics">
          <div>
            <dt>直近7日の活動</dt>
            <dd>
              {usage.last7Days.activeDays}
              <small>日</small>
            </dd>
          </div>
          <div>
            <dt>直近30日の活動</dt>
            <dd>
              {usage.last30Days.activeDays}
              <small>日</small>
            </dd>
          </div>
          <div>
            <dt>投稿案の生成</dt>
            <dd>
              {usage.allTime.generated}
              <small>回</small>
            </dd>
          </div>
          <div>
            <dt>投稿案の不採用</dt>
            <dd>
              {usage.allTime.rejected}
              <small>回</small>
            </dd>
          </div>
          <div>
            <dt>投稿案の採用</dt>
            <dd>
              {usage.allTime.accepted}
              <small>回</small>
            </dd>
          </div>
          <div>
            <dt>投稿完了の報告</dt>
            <dd>
              {usage.allTime.selfReportedPosts}
              <small>回</small>
            </dd>
          </div>
        </dl>
        <p className="member-growth__note">
          活動日は投稿案の生成・採否・投稿完了報告などを行った日です。ログインだけの日は含みません。投稿完了報告はSNSでの公開確認とは異なります。
        </p>
        {usage.allTime.unknownTriggerGenerations > 0 ? (
          <p className="member-growth__note">
            起動元を確認できない旧生成が{usage.allTime.unknownTriggerGenerations}
            件あります。旧生成だけでは活動日と判定しません。
          </p>
        ) : null}
      </section>
      <section aria-label="成長の進捗">
        <h3>5つのステップ</h3>
        <p>
          {total}項目中{completed}項目を達成
        </p>
        <progress aria-label="全体の達成進捗" value={completed} max={total} />
        <ol className="member-growth__stages">
          {roadmap.stages.map((stage, index) => (
            <li key={stage.id}>
              <div className="member-growth__stage-heading">
                <span className="member-growth__step">STEP {index + 1}</span>
                {roadmap.currentStageId === stage.id ? (
                  <span className="member-growth__current">現在のステップ</span>
                ) : null}
              </div>
              <h4>{stage.title}</h4>
              <p>
                {stage.progress.completed} / {stage.progress.total} 達成
                {stage.progress.unknown ? `・未確認 ${stage.progress.unknown}項目` : ''}
              </p>
              <ul>
                {stage.milestones.map((item) => (
                  <li key={item.id}>
                    <div className="member-growth__item-heading">
                      <strong>{item.title}</strong>
                      <span
                        className={`member-growth__badge member-growth__badge--${item.status.toLowerCase()}`}
                      >
                        {labels[item.status]}
                      </span>
                    </div>
                    <p>{evidence(item)}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="紹介と特典" className="member-growth__referral">
        <h3>紹介と特典</h3>
        <p>有効紹介人数・ロードマップ特典は集計準備中です。</p>
        <p className="member-growth__note">紹介をしなくても、SNSの基本機能を利用できます。</p>
      </section>
      <p className="member-growth__note">
        進捗と活動はそれぞれ取得時点の記録です。利用時には現在の状態を確認します。日付の基準：
        {roadmap.timezone}
      </p>
      <p className="member-growth__note">
        進捗の確認：<time dateTime={roadmap.asOf}>{checkedAt(roadmap.asOf, roadmap.timezone)}</time>
        <br />
        活動の確認：<time dateTime={usage.asOf}>{checkedAt(usage.asOf, usage.timezone)}</time>
      </p>
    </div>
  );
}

function GrowthCard({ endpointBase }: { endpointBase: string }) {
  const [snapshot, setSnapshot] = useState<GrowthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );
  async function load() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    try {
      const value = await readGrowthSnapshot(endpointBase, controller.signal);
      if (!controller.signal.aborted) setSnapshot(value);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof GrowthReadError && cause.status === 429
            ? '少し時間をおいてから、もう一度お試しください。'
            : cause instanceof GrowthReadError && [401, 403, 404].includes(cause.status)
              ? '現在の利用状態を確認できません。ページを開き直してお試しください。'
              : '進捗を取得できませんでした。時間をおいて、もう一度お試しください。',
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (pending.current === controller) pending.current = null;
    }
  }
  return (
    <section className="member-growth" aria-label="成長ロードマップ" aria-busy={loading}>
      <h2>あなたの成長ロードマップ</h2>
      <p>できたことを確かめて、次の一歩へ。すべてを順番に終える必要はありません。</p>
      <button
        type="button"
        onClick={() => {
          void load();
        }}
        disabled={loading}
      >
        {loading ? '進捗を確認中…' : snapshot ? '最新の進捗を確認' : '成長ロードマップを見る'}
      </button>
      {loading ? <p role="status">活動と進捗を確認しています。</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {snapshot ? <Snapshot value={snapshot} /> : null}
    </section>
  );
}

export function MemberGrowthRoadmap({ endpointBase }: { endpointBase: string }) {
  return <GrowthCard key={endpointBase} endpointBase={endpointBase} />;
}

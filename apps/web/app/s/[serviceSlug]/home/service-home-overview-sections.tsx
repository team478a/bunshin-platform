import type { BusinessGrowthProgramStatus } from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { progressStatusLabel } from '../../../../src/activity-progress';
import type { MissionProgressView, weeklyCalendar } from '../../../../src/activity-progress';

interface ServiceHomeHeaderProps {
  displayName: string;
  logoUrl: string | null;
  memberName: string;
}

export function ServiceHomeHeader({ displayName, logoUrl, memberName }: ServiceHomeHeaderProps) {
  return (
    <header className="service-entry__header">
      {logoUrl && (
        <div
          className="service-entry__logo"
          role="img"
          aria-label={`${displayName}のロゴ`}
          style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
        />
      )}
      <p className="eyebrow">あなたのサービスホーム</p>
      <h1>{displayName}</h1>
      <p>{memberName}さん、今日も一緒に進めましょう。</p>
    </header>
  );
}

export function ServiceAnnouncementSection({ title, message }: { title: string; message: string }) {
  return (
    <section className="service-entry__card" aria-labelledby="service-announcement-title">
      <p className="eyebrow">サービスからのお知らせ</p>
      <h2 id="service-announcement-title">{title}</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
    </section>
  );
}

export function ProfileRefinementSection({
  question,
  serviceSlug,
}: {
  question: string;
  serviceSlug: string;
}) {
  return (
    <section className="service-entry__card" aria-labelledby="profile-refinement-title">
      <p className="eyebrow">あなた向けの内容をもっと正確に</p>
      <h2 id="profile-refinement-title">今日は1つだけ教えてください</h2>
      <p>{question}</p>
      <p>回答は次回以降の投稿案づくりに使います。</p>
      <Link
        className="button button--secondary button--full"
        href={`/s/${serviceSlug}/onboarding?refine=1` as Route}
      >
        1問に答える
      </Link>
    </section>
  );
}

export function BusinessRoadmapSummary({
  program,
  serviceSlug,
}: {
  program: BusinessGrowthProgramStatus;
  serviceSlug: string;
}) {
  return (
    <section className="service-entry__card business-roadmap-summary">
      <p className="eyebrow">90日計画 / 第{program.cycleNumber}期</p>
      <h2>
        {program.day}日目 / {program.phase.label}
      </h2>
      <div
        className="business-roadmap__progress"
        role="progressbar"
        aria-label="90日計画の進み具合"
        aria-valuemin={1}
        aria-valuemax={90}
        aria-valuenow={program.day}
      >
        <span style={{ width: `${program.progressPercent}%` }} />
      </div>
      <p>{program.phase.description}</p>
      <Link
        className="button button--secondary button--full"
        href={`/s/${serviceSlug}/roadmap` as Route}
      >
        90日計画と現在地を見る
      </Link>
    </section>
  );
}

interface ServiceActivity {
  bunshin: { id: string; name: string };
  progress: MissionProgressView;
  calendar: ReturnType<typeof weeklyCalendar>;
}

export function WeeklyActivitySection({
  activities,
  bunshinCount,
  isBusinessDailyService,
  serviceSlug,
}: {
  activities: ServiceActivity[];
  bunshinCount: number;
  isBusinessDailyService: boolean;
  serviceSlug: string;
}) {
  return (
    <section className="service-entry__card">
      <h2>今週の進み具合</h2>
      {bunshinCount === 0 ? (
        <div className="empty-state">
          <p>まずは、投稿を一緒に考えるパートナーを作りましょう。</p>
          <Link
            className="button button--primary button--full"
            href={`/s/${serviceSlug}/bunshins/new` as Route}
          >
            投稿パートナーを作る
          </Link>
        </div>
      ) : activities.length === 0 ? (
        <div className="empty-state">
          <p>
            {isBusinessDailyService
              ? '今日の集客活動が届くと、ここに今週の記録が表示されます。'
              : '投稿の準備が整うと、ここに今週の記録が表示されます。'}
          </p>
          <Link
            className="button button--primary button--full"
            href={`/s/${serviceSlug}/bunshins` as Route}
          >
            投稿パートナーを見る
          </Link>
        </div>
      ) : (
        <div className="service-activity-list">
          {activities.map(({ bunshin, progress, calendar }) => (
            <section className="activity-progress" key={bunshin.id}>
              <div className="activity-progress__summary">
                <div>
                  <small>{bunshin.name}</small>
                  <h3>今週 {progress.weekly.confirmedDays}日進みました</h3>
                </div>
                <strong>目標 {progress.weeklyGoal}日</strong>
              </div>
              <div className="activity-calendar" aria-label={`${bunshin.name}の今週の記録`}>
                {calendar.map((day) => (
                  <div
                    className={`activity-calendar__day activity-calendar__day--${day.status.toLowerCase()}`}
                    key={day.missionDate}
                  >
                    <time dateTime={day.missionDate}>
                      {new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(
                        new Date(`${day.missionDate}T00:00:00.000Z`),
                      )}
                    </time>
                    <span>{progressStatusLabel[day.status]}</span>
                  </div>
                ))}
              </div>
              <p>
                {progress.remainingConfirmations === 0
                  ? '今週の目標を達成しました。よく続けられています。'
                  : `あと${progress.remainingConfirmations}日で今週の目標です。`}
              </p>
              <Link
                className="button button--primary button--full"
                href={`/s/${serviceSlug}/bunshins/${bunshin.id}` as Route}
              >
                {isBusinessDailyService ? '今日やることを見る' : '今日の投稿案を見る'}
              </Link>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

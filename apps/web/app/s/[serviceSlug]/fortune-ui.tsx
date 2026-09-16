import type { Route } from 'next';
import Link from 'next/link';
import type { FortuneReadingView } from '@bunshin/capability-fortune';
import { FortuneFeedbackButtons } from './fortune-actions';

export const themeLabel = (theme: FortuneReadingView['theme']) =>
  ({ LOVE: '恋愛', WORK: '仕事', RELATIONSHIPS: '人間関係' })[theme];

export function FortuneNav({ serviceSlug }: { serviceSlug: string }) {
  return (
    <nav className="fortune-nav" aria-label="占いメニュー">
      <Link href={`/s/${serviceSlug}/today` as Route}>今日の占い</Link>
      <Link href={`/s/${serviceSlug}/history` as Route}>過去の結果</Link>
      <Link href={`/s/${serviceSlug}/settings` as Route}>設定</Link>
    </nav>
  );
}

export function ReadingCard({
  reading,
  linked = false,
  serviceSlug,
}: {
  reading: FortuneReadingView;
  linked?: boolean;
  serviceSlug: string;
}) {
  const card = (
    <article className="settings-card fortune-reading-card">
      <p className="eyebrow">
        {reading.localDate.replaceAll('-', '/')}・{themeLabel(reading.theme)}
      </p>
      <h2>
        {reading.cardNameJa}{' '}
        <small>（{reading.orientation === 'UPRIGHT' ? '正位置' : '逆位置'}）</small>
      </h2>
      {reading.title && <h3>{reading.title}</h3>}
      {!linked && reading.body && <p className="fortune-reading-body">{reading.body}</p>}
      {!linked && reading.actionStep && (
        <div className="fortune-action-step">
          <strong>今日できること</strong>
          <p>{reading.actionStep}</p>
        </div>
      )}
      {!linked && reading.body && (
        <FortuneFeedbackButtons
          serviceSlug={serviceSlug}
          readingId={reading.id}
          current={reading.feedbackRating}
          currentIssue={reading.feedbackIssue}
        />
      )}
    </article>
  );
  return linked ? (
    <Link
      className="fortune-reading-link"
      href={`/s/${serviceSlug}/readings/${reading.id}` as Route}
    >
      {card}
    </Link>
  ) : (
    card
  );
}

import type { Route } from 'next';
import Link from 'next/link';
import type { FortuneReadingView } from '@bunshin/capability-fortune';
import { dailyCardDetails } from '../../../src/fortune/daily-card-details';
import type { FortuneGuidanceSettings } from '../../../src/fortune/guidance-settings';
import { FortuneCharacterBadge } from './fortune-character';
import { FortuneCardArtwork } from './fortune-card-artwork';
import { FortuneFeedbackButtons } from './fortune-actions';
import { FortuneFollowUps } from './fortune-follow-ups';
import { FortuneOracleBook } from './fortune-oracle-book';
import { FortunePersonalFit } from './fortune-personal-fit';

export const themeLabel = (theme: FortuneReadingView['theme']) =>
  ({ LOVE: '恋愛', WORK: '仕事', RELATIONSHIPS: '人間関係' })[theme];

export function FortuneNav({
  serviceSlug,
  inFlow = false,
}: {
  serviceSlug: string;
  inFlow?: boolean;
}) {
  return (
    <nav
      className={inFlow ? 'fortune-nav fortune-nav--in-flow' : 'fortune-nav'}
      aria-label="占いメニュー"
    >
      <Link href={`/s/${serviceSlug}/today` as Route}>今日の占い</Link>
      <Link href={`/s/${serviceSlug}/history` as Route}>過去の結果</Link>
      <Link href={`/s/${serviceSlug}/credits` as Route}>クレジット</Link>
      <Link href={`/s/${serviceSlug}/settings` as Route}>設定</Link>
      <Link href={`/s/${serviceSlug}/manual` as Route}>使い方</Link>
    </nav>
  );
}

export function ReadingCard({
  reading,
  linked = false,
  showFollowUps = false,
  showCreditFollowUps = false,
  oracleBook = false,
  serviceSlug,
  characters,
}: {
  reading: FortuneReadingView;
  linked?: boolean;
  showFollowUps?: boolean;
  showCreditFollowUps?: boolean;
  oracleBook?: boolean;
  characters?: FortuneGuidanceSettings['characters'];
  serviceSlug: string;
}) {
  const deep = linked ? undefined : reading.deepReading;
  const insight =
    !linked &&
    !deep &&
    reading.body &&
    (reading.status === 'READY_BASIC' || reading.status === 'READY_AI')
      ? dailyCardDetails(reading.cardCode, reading.theme)
      : undefined;
  const character = linked ? undefined : deep ? characters?.deep : characters?.daily;
  const showBook = oracleBook && Boolean(deep) && reading.status === 'READY_AI';
  const context = `${reading.localDate.replaceAll('-', '/')}・${themeLabel(reading.theme)}`;
  const characterBadge = character && (
    <FortuneCharacterBadge
      character={character}
      expression={reading.status === 'GENERATING' ? 'thinking' : 'result'}
      compact={!deep}
    />
  );
  const content = (
    <>
      {!linked && reading.status === 'READY_AI' && (
        <p className="fortune-note">
          {deep ? '深層パーソナル鑑定・AI' : 'AIが文章を整えた鑑定です。'}
        </p>
      )}
      {!showBook && reading.title && <h3>{reading.title}</h3>}
      {reading.status === 'GENERATING' && (
        <p role="status">
          AIが結果を整えています。先に標準の結果をご覧いただけます。しばらくしてページを更新してください。
        </p>
      )}
      {reading.status === 'FAILED' && (
        <p role="status">結果を表示できませんでした。今日は引き直さず、明日またお試しください。</p>
      )}
      {deep && (
        <>
          {deep.consultationSummary && (
            <section>
              <h3>今回確認した相談</h3>
              <p className="fortune-reading-body">{deep.consultationSummary}</p>
            </section>
          )}
          {deep.importantValue && (
            <section>
              <h3>大切にしたいこと</h3>
              <p>{deep.importantValue}</p>
            </section>
          )}
          <section>
            <h3>カードからの象徴的な視点</h3>
            <p>{deep.approvedPerspective}</p>
          </section>
        </>
      )}
      {!linked &&
        reading.body &&
        (deep ? (
          <section>
            <h3>今の状況に当てはめると</h3>
            <p className="fortune-reading-body">{reading.body}</p>
          </section>
        ) : (
          <p className="fortune-reading-body">{reading.body}</p>
        ))}
      {insight && (
        <section>
          <h3>{reading.cardImageUrl ? '標準デッキの象徴' : 'カードの象徴'}</h3>
          <p>{insight.imageDetail}</p>
          <p>{insight.situation}</p>
          <p>
            <strong>{insight.question}</strong>
          </p>
        </section>
      )}
      {deep && (
        <section>
          <h3>考えられる選択肢</h3>
          <ul>
            {deep.alternatives.map((alternative) => (
              <li key={alternative}>{alternative}</li>
            ))}
          </ul>
        </section>
      )}
      {!linked && reading.actionStep && (
        <section className="fortune-action-step">
          <h3>今日の提案</h3>
          <p>{reading.actionStep}</p>
          {deep && <p>{deep.actionReason}</p>}
        </section>
      )}
      {!linked && reading.reflectionPrompt && (
        <details className="fortune-action">
          <summary>次回の振り返りを見る</summary>
          <p>{reading.reflectionPrompt}</p>
        </details>
      )}
      {!linked && reading.status === 'READY_AI' && (showFollowUps || reading.personalFitRating) && (
        <FortunePersonalFit
          key={reading.id}
          serviceSlug={serviceSlug}
          readingId={reading.id}
          rating={reading.personalFitRating}
          canRate={showFollowUps}
        />
      )}
      {!linked && reading.body && reading.status !== 'GENERATING' && (
        <FortuneFeedbackButtons
          serviceSlug={serviceSlug}
          readingId={reading.id}
          current={reading.feedbackRating}
          currentIssue={reading.feedbackIssue}
        />
      )}
    </>
  );
  const card = showBook ? (
    <FortuneOracleBook reading={reading} context={context}>
      {characterBadge}
      {content}
    </FortuneOracleBook>
  ) : (
    <article className="settings-card fortune-reading-card">
      {characterBadge}
      <p className="eyebrow">{context}</p>
      <h2>
        {reading.cardNameJa}{' '}
        <small>（{reading.orientation === 'UPRIGHT' ? '正位置' : '逆位置'}）</small>
      </h2>
      {!linked && reading.body && (oracleBook || reading.cardImageUrl) && (
        <FortuneCardArtwork card={reading} />
      )}
      {content}
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
    <>
      {card}
      {(showFollowUps || showCreditFollowUps) &&
        (reading.status === 'READY_AI' || reading.status === 'READY_BASIC') && (
          <FortuneFollowUps key={reading.id} serviceSlug={serviceSlug} readingId={reading.id} />
        )}
    </>
  );
}

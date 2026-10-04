import type { BusinessOutcomes } from '../../../../../src/services/business-outcomes';

interface BusinessResponseMission {
  id: string;
  missionDate: string;
  topic: string;
  postedAt: string | null;
  businessOutcomes?: BusinessOutcomes;
}

const outcomeLabels: Array<[keyof BusinessOutcomes, string]> = [
  ['inquiries', '問い合わせ'],
  ['reservations', '予約'],
  ['visits', '来店'],
  ['repeatReservations', '再予約'],
  ['repeatVisits', '再来店'],
  ['orders', '購入・申込'],
  ['other', 'その他'],
];

const outcomeTotal = (outcomes?: BusinessOutcomes) =>
  outcomes ? Object.values(outcomes).reduce((total, count) => total + count, 0) : 0;

export function buildBusinessResponseInsight(missions: BusinessResponseMission[]) {
  const posted = missions
    .filter((mission) => mission.postedAt)
    .sort((left, right) => right.missionDate.localeCompare(left.missionDate))
    .slice(0, 8);
  const totals: BusinessOutcomes = {
    inquiries: 0,
    reservations: 0,
    visits: 0,
    repeatReservations: 0,
    repeatVisits: 0,
    orders: 0,
    other: 0,
  };

  for (const mission of posted) {
    if (!mission.businessOutcomes) continue;
    for (const [key] of outcomeLabels) totals[key] += mission.businessOutcomes[key];
  }

  const bestMission = posted.reduce<BusinessResponseMission | null>((best, mission) => {
    if (!best || outcomeTotal(mission.businessOutcomes) > outcomeTotal(best.businessOutcomes)) {
      return mission;
    }
    return best;
  }, null);
  const total = outcomeTotal(totals);

  if (!posted.length || total === 0) {
    return {
      postedCount: posted.length,
      total,
      totals,
      bestTopic: null,
      title: posted.length ? '投稿後の反応を記録しましょう' : 'まずは1回投稿してみましょう',
      guidance: posted.length
        ? '投稿カードを開き、問い合わせや予約などの件数を分かる範囲だけ入力します。反応がなければ0のままで大丈夫です。'
        : '投稿すると、お客様の反応をここで振り返り、次の投稿に生かせるようになります。',
    };
  }

  const actionCount =
    totals.reservations +
    totals.visits +
    totals.repeatReservations +
    totals.repeatVisits +
    totals.orders;
  if (actionCount > 0) {
    return {
      postedCount: posted.length,
      total,
      totals,
      bestTopic: bestMission?.topic ?? null,
      title: '反応があった内容をもう一度使いましょう',
      guidance:
        '同じ内容を、写真や最初の一言だけ変えてもう一度投稿してみましょう。うまくいった形を繰り返すことが近道です。',
    };
  }

  return {
    postedCount: posted.length,
    total,
    totals,
    bestTopic: bestMission?.topic ?? null,
    title:
      totals.inquiries > 0
        ? '届いた質問を次の投稿にしましょう'
        : 'お客様の反応を次の投稿に使いましょう',
    guidance:
      'お客様から届いた質問や言葉を、そのまま下の「今日の材料」に残してください。次の投稿案を作る材料として使います。',
  };
}

export function BusinessResponseInsights({ missions }: { missions: BusinessResponseMission[] }) {
  const insight = buildBusinessResponseInsight(missions);
  if (!insight.postedCount) return null;
  const recorded = outcomeLabels.filter(([key]) => insight.totals[key] > 0);

  return (
    <section
      className="business-response-insights service-entry__card"
      aria-labelledby="business-response-insights-title"
    >
      <header>
        <p className="eyebrow">投稿後のふり返り</p>
        <h2 id="business-response-insights-title">次の投稿に生かす</h2>
        <p>直近の投稿に記録した、お客様の反応をまとめています。</p>
      </header>

      {recorded.length ? (
        <dl className="business-response-insights__counts">
          {recorded.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{insight.totals[key]}件</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="business-response-insights__next">
        <strong>{insight.title}</strong>
        {insight.bestTopic ? (
          <p>
            反応が多かった内容：<b>{insight.bestTopic}</b>
          </p>
        ) : null}
        <p>{insight.guidance}</p>
      </div>

      <div className="business-response-insights__actions">
        {insight.total === 0 ? (
          <a className="button button--primary button--full" href="#today-post">
            投稿の反応を記録する
          </a>
        ) : (
          <a className="button button--primary button--full" href="#daily-action">
            質問や反応を今日の材料にする
          </a>
        )}
      </div>
    </section>
  );
}

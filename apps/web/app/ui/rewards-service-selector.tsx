import type { Route } from 'next';
import Link from 'next/link';
import type { RewardsServiceContext } from '../../src/rewards/rewards-service-context';

export function RewardsServiceSelector({
  destination,
  contexts,
  selected,
}: {
  destination: 'points' | 'badges';
  contexts: RewardsServiceContext[];
  selected?: RewardsServiceContext | null;
}) {
  if (contexts.length < 2) return null;
  const duplicateNames = new Set(
    contexts
      .filter(
        (context, index) =>
          contexts.findIndex((candidate) => candidate.serviceName === context.serviceName) !==
          index,
      )
      .map((context) => context.serviceName),
  );
  return (
    <section className="settings-card" aria-labelledby={`${destination}-service-selector-title`}>
      <h2 id={`${destination}-service-selector-title`}>
        {selected ? '別のサービスを見る' : '表示するサービスを選ぶ'}
      </h2>
      <p>サービスごとに利用できる特典や試験期間が異なります。</p>
      <div className="service-home-actions">
        {contexts.map((context) => {
          const current =
            selected?.workspaceId === context.workspaceId &&
            selected.serviceSlug === context.serviceSlug;
          return (
            <Link
              key={`${context.workspaceId}:${context.groupId}`}
              className={`button ${current ? 'button--primary' : 'button--secondary'}`}
              aria-current={current ? 'page' : undefined}
              href={
                `/${destination}?workspaceId=${encodeURIComponent(context.workspaceId)}&serviceSlug=${encodeURIComponent(context.serviceSlug)}` as Route
              }
            >
              {context.serviceName}
              {duplicateNames.has(context.serviceName) ? `（${context.workspaceName}）` : ''}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

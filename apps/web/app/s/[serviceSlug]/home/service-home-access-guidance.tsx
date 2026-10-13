import type { CSSProperties } from 'react';
import Link from 'next/link';
import { PublicShell } from '../../../ui/public-shell';

export type ServiceHomeAccessState = 'LOGIN_REQUIRED' | 'MEMBERSHIP_REQUIRED' | 'LINK_UNAVAILABLE';

export function ServiceHomeAccessGuidance({
  state,
  serviceName,
  serviceSlug,
}: {
  state: ServiceHomeAccessState;
  serviceName?: string;
  serviceSlug: string;
}) {
  const returnTo = `/s/${serviceSlug}/home`;
  const serviceEntry = `/s/${serviceSlug}`;
  const copy = {
    LOGIN_REQUIRED: {
      title: `${serviceName ?? 'サービス'}を利用するにはログインが必要です`,
      description:
        'LINE内のブラウザでは、通常のブラウザのログイン状態が引き継がれないことがあります。ログイン後、この画面へ戻ります。',
    },
    MEMBERSHIP_REQUIRED: {
      title: `${serviceName ?? 'サービス'}への参加登録を確認できません`,
      description:
        '参加登録に使ったアカウントでログインしているか確認してください。初めて利用する場合は、サービスの参加案内から登録してください。',
    },
    LINK_UNAVAILABLE: {
      title: 'サービスの利用状態を確認できません',
      description:
        'このLINEメニューのリンク先、またはサービスの参加状態を確認できませんでした。時間をおいて再度お試しいただくか、サービスの運営者へお問い合わせください。',
    },
  }[state];

  return (
    <PublicShell narrow>
      <section
        className="service-entry__card"
        aria-labelledby="service-home-access-title"
        style={{ '--service-primary': 'var(--color-primary)' } as CSSProperties}
      >
        <p className="eyebrow">LINEからのご利用</p>
        <h1 id="service-home-access-title">{copy.title}</h1>
        <p>{copy.description}</p>
        {state === 'LOGIN_REQUIRED' && (
          <Link
            className="button button--primary button--full"
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            ログインして続ける
          </Link>
        )}
        {state !== 'LINK_UNAVAILABLE' && serviceName && (
          <Link className="service-entry__login-link" href={serviceEntry}>
            {state === 'MEMBERSHIP_REQUIRED' ? '参加案内を確認する' : 'サービスの案内を見る'}
          </Link>
        )}
        <p className="service-home-access__help">
          解決しない場合は、この画面のスクリーンショットを添えて運営者へご連絡ください。
        </p>
      </section>
    </PublicShell>
  );
}

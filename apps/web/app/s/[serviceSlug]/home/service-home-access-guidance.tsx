import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { PublicShell } from '../../../ui/public-shell';
import { ServiceAuthBranding } from '../../../ui/service-auth-branding';
import type { ServiceAuthBrand } from '../../../../src/services/service-auth-brand';

export type ServiceHomeAccessState =
  'LOGIN_REQUIRED' | 'MEMBERSHIP_REQUIRED' | 'MANAGEMENT_REQUIRED' | 'LINK_UNAVAILABLE';

export function ServiceHomeAccessGuidance({
  state,
  serviceName,
  serviceSlug,
  serviceLogoUrl = null,
  poweredBy = false,
  brand = null,
}: {
  state: ServiceHomeAccessState;
  serviceName?: string;
  serviceSlug: string;
  serviceLogoUrl?: string | null;
  poweredBy?: boolean;
  brand?: ServiceAuthBrand | null;
}) {
  const returnTo = `/s/${serviceSlug}/home`;
  const displayServiceName = brand?.serviceName ?? serviceName;
  const serviceEntry = `/s/${serviceSlug}` as const;
  const copy = {
    LOGIN_REQUIRED: {
      title: `${displayServiceName ?? 'サービス'}を利用するにはログインが必要です`,
      description:
        'LINE内のブラウザでは、通常のブラウザのログイン状態が引き継がれないことがあります。ログイン後、この画面へ戻ります。',
    },
    MEMBERSHIP_REQUIRED: {
      title: `${displayServiceName ?? 'サービス'}への参加登録を確認できません`,
      description:
        '参加登録に使ったアカウントでログインしているか確認してください。初めて利用する場合は、サービスの参加案内から登録してください。',
    },
    MANAGEMENT_REQUIRED: {
      title: `${displayServiceName ?? 'サービス'}の管理画面を利用できません`,
      description:
        'この画面はサービス管理者専用です。サービス管理者として登録されたアカウントでログインするか、運営者に管理権限の付与を依頼してください。',
    },
    LINK_UNAVAILABLE: {
      title: `${displayServiceName ?? 'サービス'}の利用設定を確認できません`,
      description: `ログインは完了していますが、${displayServiceName ?? 'このサービス'}の公開設定または参加登録を確認できません。メールとLINEのアカウントは別の認証方法です。何度もログインし直さず、運営者にこの画面を見せて、${displayServiceName ?? 'サービス'}の公開設定と参加登録を確認してもらってください。`,
    },
  }[state];
  const brandName = displayServiceName;
  const brandLogoUrl = brand?.logoUrl ?? serviceLogoUrl;
  const showPoweredBy = brand?.poweredBy ?? poweredBy;

  return (
    <PublicShell narrow showPlatformBrand={!brandName}>
      {brandName && (
        <ServiceAuthBranding
          serviceName={brandName}
          logoUrl={brandLogoUrl}
          poweredBy={showPoweredBy}
        />
      )}
      <section
        className="service-entry__card"
        aria-labelledby="service-home-access-title"
        style={{ '--service-primary': 'var(--color-primary)' } as CSSProperties}
      >
        <p className="eyebrow">
          {state === 'LINK_UNAVAILABLE' ? 'サービスの利用確認' : 'LINEからのご利用'}
        </p>
        <h1 id="service-home-access-title">{copy.title}</h1>
        <p>{copy.description}</p>
        {state === 'LOGIN_REQUIRED' && (
          <Link
            className="button button--primary button--full"
            href={`/login?returnTo=${encodeURIComponent(returnTo)}` as Route}
          >
            ログインして続ける
          </Link>
        )}
        {state === 'MANAGEMENT_REQUIRED' && serviceName && (
          <Link
            className="button button--primary button--full"
            href={`/s/${serviceSlug}/home` as Route}
          >
            {serviceName}の利用画面へ
          </Link>
        )}
        {brandName && state !== 'MANAGEMENT_REQUIRED' && (
          <Link className="service-entry__login-link" href={serviceEntry}>
            {state === 'LOGIN_REQUIRED'
              ? 'サービスの案内を見る'
              : state === 'LINK_UNAVAILABLE'
                ? 'サービスの案内を確認する'
                : '参加案内を確認する'}
          </Link>
        )}
        {state === 'MANAGEMENT_REQUIRED' && serviceName && (
          <Link className="service-entry__login-link" href={serviceEntry}>
            参加案内を確認する
          </Link>
        )}
        <p className="service-home-access__help">
          解決しない場合は、この画面のスクリーンショットを添えて運営者へご連絡ください。
        </p>
      </section>
    </PublicShell>
  );
}

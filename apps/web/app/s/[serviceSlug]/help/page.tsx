import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

async function serviceContext(slug: string) {
  try {
    return await resolvePublicServiceContext(slug);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  const { configuration } = await serviceContext(serviceSlug);
  return { title: `${configuration.displayName}｜ヘルプ` };
}

const contentModeLabel = {
  IDEA: '発信のテーマ・切り口となるアイデア',
  PROMPT: '投稿を作る手順・台本・プロンプト',
  READY_TO_USE: '確認して使える完成した投稿案',
} as const;

const mediaModeLabel = {
  TEXT_ONLY: '文章',
  IMAGE: '文章と画像',
  VIDEO: '文章と動画',
  IMAGE_AND_VIDEO: '文章・画像・動画',
} as const;

export default async function ServiceHelpPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await serviceContext(serviceSlug);
  const user = await (await currentUserProvider()).getCurrentUser();
  const db = await import('@bunshin/database');
  const membership = user
    ? await db.prisma.groupMembership.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: user.userId,
          status: 'ACTIVE',
        },
        select: { serviceRole: true },
      })
    : null;
  const settings = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  const delivery = settings.dailyIdeaDelivery;
  const isManager = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(membership?.serviceRole ?? '');
  const isContentEditor = membership?.serviceRole === 'CONTENT_EDITOR';
  const serviceBase = `/s/${service.configuration.slug}`;
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-help" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">使い方・困ったとき</p>
          <h1>{service.configuration.displayName} ヘルプ</h1>
          <p>はじめ方、投稿案の受け取り方、運営方法を確認できます。</p>
          <div className="service-help__header-actions">
            <Link
              className="button button--primary"
              href={
                membership
                  ? `/s/${service.configuration.slug}/home`
                  : `/s/${service.configuration.slug}`
              }
            >
              {membership ? 'サービスホームへ戻る' : 'サービス案内へ戻る'}
            </Link>
            {isManager && (
              <Link className="button" href={`${serviceBase}/manage` as Route}>
                運営管理を開く
              </Link>
            )}
          </div>
        </header>

        <nav className="service-help__nav" aria-label="ヘルプ内メニュー">
          <a href="#start">はじめ方</a>
          <a href="#delivery">配信の違い</a>
          <a href="#daily">毎日の使い方</a>
          <a href="#media">画像・動画</a>
          <a href="#trouble">困ったとき</a>
          {(isManager || isContentEditor) && <a href="#operation">運営マニュアル</a>}
        </nav>

        <section className="service-entry__card service-help__section" id="start">
          <p className="eyebrow">初めての方</p>
          <h2>利用を始めるまで</h2>
          <ol className="service-help__steps">
            <li>LINEまたはメールでログインし、このサービスへの参加を完了します。</li>
            <li>SNS、発信したい相手、紹介したい活動などの初回質問に答えます。</li>
            <li>投稿を一緒に考える「投稿パートナー」を作ります。</li>
            <li>投稿する曜日や頻度を決め、1週間の予定を確定します。</li>
            <li>予定日に届く案内から内容を確認し、ご自身のSNSへ投稿します。</li>
          </ol>
          {membership && (
            <Link
              className="button button--primary button--full"
              href={`${serviceBase}/bunshins` as Route}
            >
              投稿パートナーを確認する
            </Link>
          )}
        </section>

        <section className="service-entry__card service-help__section" id="delivery">
          <p className="eyebrow">現在の配信設定</p>
          <h2>
            {delivery.enabled
              ? `${delivery.cadence === 'WEEKDAYS' ? '平日' : '毎日'}、${contentModeLabel[delivery.contentMode]}をお届けします`
              : '投稿予定がある日に、投稿案をお届けします'}
          </h2>
          <div className="service-help__current-setting">
            <strong>
              {delivery.enabled ? '毎日のアイデア配信：利用中' : '毎日のアイデア配信：停止中'}
            </strong>
            <span>標準の内容：{contentModeLabel[delivery.contentMode]}</span>
            <span>標準の形式：{mediaModeLabel[delivery.mediaMode]}</span>
            {delivery.enabled && (
              <span>標準の通知時刻：{delivery.defaultNotificationTime}ごろ</span>
            )}
          </div>
          <div className="service-help__comparison">
            <article>
              <h3>投稿予定に基づく通常配信</h3>
              <p>
                確定した1週間の予定に投稿がある日だけ届きます。完成した投稿案を受け取る使い方です。
              </p>
            </article>
            <article>
              <h3>毎日のアイデア配信</h3>
              <p>
                週間予定に関係なく、毎日または平日に届きます。今日発信するテーマや切り口を受け取る使い方です。
              </p>
            </article>
          </div>
          <p className="service-help__note">
            「毎日のアイデア配信：停止中」でも、通常配信まで停止しているとは限りません。投稿予定がある日は通常の投稿案が届きます。
          </p>
        </section>

        <section className="service-entry__card service-help__section" id="daily">
          <p className="eyebrow">利用者マニュアル</p>
          <h2>投稿案が届いたら</h2>
          <ol className="service-help__steps">
            <li>LINEの案内、またはサービスホームから「今日の投稿案」を開きます。</li>
            <li>内容を読み、「採用する」または「今回は使わない」を選びます。</li>
            <li>採用した投稿文や指示文をコピーし、必要に応じて整えます。</li>
            <li>ご自身のSNSへ投稿します。SNSへの自動公開は行われません。</li>
            <li>
              SNSへ実際に投稿した後で「投稿しました」を押し、感想を記録します。この記録は自己申告で、SNSへの投稿は自動確認されません。
            </li>
          </ol>
          <details className="service-help__details">
            <summary>紹介URL・ポイント・バッジについて</summary>
            <div>
              <p>紹介機能が有効なサービスでは、活動ページに専用URLやQRコードが表示されます。</p>
              <p>
                ポイント、バッジ、画像作成回数はサービスごとに管理され、別サービスへ移すことはできません。
              </p>
            </div>
          </details>
        </section>

        <section className="service-entry__card service-help__section" id="media">
          <p className="eyebrow">画像・動画</p>
          <h2>利用できる場合の流れ</h2>
          <p>
            画像・動画のボタンは、サービスと参加者の両方に利用権限があり、作成回数が残っている場合に表示されます。
          </p>
          <ul className="service-help__list">
            <li>画像は生成結果を確認してダウンロードし、ご自身でSNSへ投稿します。</li>
            <li>
              動画は企画・台本・場面を確認してから生成します。完成まで時間がかかる場合があります。
            </li>
            <li>人物、商品、ロゴ、音楽など、利用する権利がある素材だけを登録してください。</li>
            <li>生成に失敗して回数だけ減った場合は、再実行せず運営者へ連絡してください。</li>
          </ul>
        </section>

        <section className="service-entry__card service-help__section" id="trouble">
          <p className="eyebrow">よくある質問</p>
          <h2>困ったとき</h2>
          <div className="service-help__faq">
            <details>
              <summary>予定時刻になってもLINEが届きません</summary>
              <div>
                <p>
                  まず、その日が週間予定の投稿日か確認してください。予定がない日は通常配信されません。
                </p>
                <p>
                  予定日である場合は、LINEの友だち状態、通知同意、サービスの参加状態を確認し、運営者へ連絡してください。
                </p>
              </div>
            </details>
            <details>
              <summary>「今日の投稿案はまだありません」と表示されます</summary>
              <div>
                <p>
                  1週間の予定が未確定、選んだ日が投稿日ではない、または生成処理中の可能性があります。投稿パートナーの設定と次回予定日を確認してください。
                </p>
              </div>
            </details>
            <details>
              <summary>画像・動画の作成ボタンがありません</summary>
              <div>
                <p>
                  現在のプランで対象機能が停止中か、作成回数が付与されていない可能性があります。サービス運営者へ確認してください。
                </p>
              </div>
            </details>
            <details>
              <summary>ログインできません</summary>
              <div>
                <p>
                  サービス案内を開き直し、LINEログインまたは最新のメールログインリンクを使用してください。古いメールリンクは使用できない場合があります。
                </p>
              </div>
            </details>
          </div>
        </section>

        {(isManager || isContentEditor) && (
          <section className="service-entry__card service-help__section" id="operation">
            <p className="eyebrow">運営者マニュアル</p>
            <h2>安全に運営する順番</h2>
            <ol className="service-help__steps">
              <li>サービス名、運営者、問い合わせ先、規約、公開状態を確認します。</li>
              <li>運営担当者を追加し、必要な役割だけを付与します。</li>
              <li>公式LINEを接続確認して使用中にし、標準リッチメニューを公開します。</li>
              <li>公式資料、FAQ、商品情報、必須表記、避ける表現を登録します。</li>
              <li>テスト参加者1名で、登録から投稿案の確認、LINE通知まで試します。</li>
              <li>開始後は配信失敗、生成失敗、承認待ち、利用枠を毎日確認します。</li>
            </ol>
            <div className="service-home-actions">
              {isManager && (
                <>
                  <Link className="button button--primary" href={`${serviceBase}/manage` as Route}>
                    開始準備を確認する
                  </Link>
                  <Link className="button" href={`${serviceBase}/manage/line` as Route}>
                    LINE運用を確認する
                  </Link>
                  <Link className="button" href={`${serviceBase}/manage/members` as Route}>
                    参加者と権限を確認する
                  </Link>
                </>
              )}
              <Link className="button" href={`${serviceBase}/manage/knowledge` as Route}>
                公式資料・FAQを管理する
              </Link>
              <Link className="button" href={`${serviceBase}/manage/product-packs` as Route}>
                公式商品情報を管理する
              </Link>
            </div>
          </section>
        )}

        <footer className="service-entry__details">
          <span>運営：{service.configuration.operatorName}</span>
          {service.configuration.contactEmail ? (
            <a href={`mailto:${service.configuration.contactEmail}`}>運営者へ問い合わせる</a>
          ) : (
            <span>お問い合わせ先はサービス運営者へご確認ください</span>
          )}
          {service.configuration.poweredByEnabled && <small>Powered by ワタシワークス</small>}
        </footer>
      </article>
    </PublicShell>
  );
}

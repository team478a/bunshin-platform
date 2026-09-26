import type { Route } from 'next';
import Link from 'next/link';

interface MemberFeatureLinksProps {
  imageAvailable: boolean;
  isBusinessDailyService: boolean;
  isServiceOperator: boolean;
  promptOnlyImages: boolean;
  rewardsAvailable: boolean;
  serviceSlug: string;
  trackingLinkAvailable: boolean;
  videoAvailable: boolean;
}

export function MemberFeatureLinks(props: MemberFeatureLinksProps) {
  const {
    imageAvailable,
    isBusinessDailyService,
    isServiceOperator,
    promptOnlyImages,
    rewardsAvailable,
    serviceSlug,
    trackingLinkAvailable,
    videoAvailable,
  } = props;
  return (
    <section className="service-entry__card">
      <h2>{isBusinessDailyService ? '毎日の集客を進める' : '利用できる機能'}</h2>
      {!isBusinessDailyService &&
        !promptOnlyImages &&
        !imageAvailable &&
        !videoAvailable &&
        !rewardsAvailable &&
        !isServiceOperator && (
          <p>現在、利用できる機能を準備しています。サービス運営者からの案内をお待ちください。</p>
        )}
      <div className="service-home-actions">
        {promptOnlyImages && (
          <div className="notice">
            <strong>画像は、画像用の文章をコピーして作ります</strong>
            <p>
              投稿パートナーに届く「画像用の文章」をコピーし、ChatGPTなどの画像を作れるサービスへ貼り付けて送ってください。
            </p>
            <Link className="button button--primary" href={`/s/${serviceSlug}/bunshins` as Route}>
              投稿パートナーを見る
            </Link>
          </div>
        )}
        {rewardsAvailable && (
          <Link
            className="button button--primary"
            href={`/s/${serviceSlug}/activity#rewards` as Route}
          >
            ポイント・バッジを見る
          </Link>
        )}
        <Link className="button button--primary" href={`/s/${serviceSlug}/weekly-report` as Route}>
          今週できたことを見る
        </Link>
        {isBusinessDailyService && (
          <>
            <Link className="button button--primary" href={`/s/${serviceSlug}/diagnosis` as Route}>
              SNS集客の準備を確認する
            </Link>
            <Link
              className="button button--primary"
              href={`/s/${serviceSlug}/90-day-report` as Route}
            >
              90日間の成果を見る
            </Link>
            <Link className="button button--primary" href={`/s/${serviceSlug}/roadmap` as Route}>
              90日計画を見る
            </Link>
          </>
        )}
        {!isBusinessDailyService && (
          <>
            <Link className="button button--primary" href={`/s/${serviceSlug}/activity` as Route}>
              活動・紹介を見る
            </Link>
            <Link className="button button--primary" href={`/s/${serviceSlug}/programs` as Route}>
              参加中のプログラムと目標
            </Link>
          </>
        )}
        <Link className="button button--primary" href={`/s/${serviceSlug}/bunshins` as Route}>
          投稿パートナーを作る・見る
        </Link>
        <Link className="button" href={`/s/${serviceSlug}/help` as Route}>
          使い方・困ったとき
        </Link>
        {!isBusinessDailyService && !promptOnlyImages && (
          <Link className="button" href={`/s/${serviceSlug}/credits` as Route}>
            画像作成回数を見る
          </Link>
        )}
        {trackingLinkAvailable && (
          <Link className="button" href={`/s/${serviceSlug}/tracking-link` as Route}>
            自分の代理店URLを登録する
          </Link>
        )}
        {imageAvailable && (
          <Link className="button button--primary" href={`/s/${serviceSlug}/images` as Route}>
            投稿に使う画像を作る
          </Link>
        )}
        {videoAvailable && (
          <Link className="button button--primary" href={`/s/${serviceSlug}/videos` as Route}>
            投稿に使う動画を作る
          </Link>
        )}
      </div>
    </section>
  );
}

export function ServiceOperatorLinks({
  isBusinessDailyService,
  serviceSlug,
}: {
  isBusinessDailyService: boolean;
  serviceSlug: string;
}) {
  return (
    <section className="service-entry__card service-management-card">
      <p className="eyebrow">運営者用メニュー</p>
      <h2>サービスを管理する</h2>
      <p>
        最初は「開始準備」を開き、設定漏れを確認してください。以降は目的にあわせて下のメニューを使います。
      </p>
      <div className="service-home-actions">
        <a className="button button--primary" href={`/s/${serviceSlug}/manage`}>
          開始準備・設定漏れを確認する
        </a>
        <a className="button" href={`/s/${serviceSlug}/manage/settings`}>
          サービスの見た目・登録設定
        </a>
        <a className="button" href={`/s/${serviceSlug}/manage/line`}>
          サービス専用LINE
        </a>
        <a className="button" href={`/s/${serviceSlug}/manage/members`}>
          参加者と利用機能
        </a>
        {!isBusinessDailyService && (
          <>
            <a className="button" href={`/s/${serviceSlug}/manage/programs`}>
              実践プログラム
            </a>
            <a className="button" href={`/s/${serviceSlug}/manage/program-goals`}>
              支援方法と目標候補
            </a>
          </>
        )}
        <a className="button" href={`/s/${serviceSlug}/manage/characters`}>
          AIキャラクター
        </a>
        <a className="button" href={`/s/${serviceSlug}/manage/knowledge`}>
          公式資料・FAQ
        </a>
        <a className="button" href={`/s/${serviceSlug}/manage/legal`}>
          利用規約
        </a>
        {!isBusinessDailyService && (
          <>
            <a className="button" href={`/s/${serviceSlug}/manage/badges`}>
              バッジ
            </a>
            <a className="button" href={`/s/${serviceSlug}/manage/product-packs`}>
              公式商品情報
            </a>
            <a className="button" href={`/s/${serviceSlug}/manage/campaigns`}>
              参加募集
            </a>
            <a className="button" href={`/s/${serviceSlug}/manage/external-tracking`}>
              参加者の専用URL
            </a>
          </>
        )}
      </div>
    </section>
  );
}

export function ContentEditorLinks({
  isBusinessDailyService,
  serviceSlug,
}: {
  isBusinessDailyService: boolean;
  serviceSlug: string;
}) {
  return (
    <section className="service-entry__card">
      <h2>公式コンテンツを管理する</h2>
      <p>
        {isBusinessDailyService
          ? '投稿案の作成に使う公式資料とFAQを管理します。'
          : '公式資料、商品情報、参加募集だけをこのサービスの範囲で管理します。'}
      </p>
      <div className="service-home-actions">
        <a className="button" href={`/s/${serviceSlug}/manage/knowledge`}>
          公式資料・FAQ
        </a>
        {!isBusinessDailyService && (
          <>
            <a className="button" href={`/s/${serviceSlug}/manage/product-packs`}>
              公式商品情報
            </a>
            <a className="button" href={`/s/${serviceSlug}/manage/campaigns`}>
              参加募集
            </a>
          </>
        )}
      </div>
    </section>
  );
}

export function ServiceHomeFooter({
  contactEmail,
  operatorName,
  poweredByEnabled,
  serviceSlug,
}: {
  contactEmail: string | null;
  operatorName: string;
  poweredByEnabled: boolean;
  serviceSlug: string;
}) {
  return (
    <footer className="service-entry__details">
      <span>運営：{operatorName}</span>
      <Link href={`/s/${serviceSlug}/help` as Route}>使い方・ヘルプ</Link>
      {contactEmail && <a href={`mailto:${contactEmail}`}>お問い合わせ</a>}
      {poweredByEnabled && <small>Powered by ワタシワークス</small>}
    </footer>
  );
}

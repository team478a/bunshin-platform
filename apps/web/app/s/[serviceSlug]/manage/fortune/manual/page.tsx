import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { fortuneOperatorStatus } from '../../../../../../src/fortune/operator';
import { PublicShell } from '../../../../../ui/public-shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '占い運営マニュアル' };

function StepHeader({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <header className="easy-manual__step-header">
      <span aria-hidden="true">{number}</span>
      <h2>{children}</h2>
    </header>
  );
}

export default async function FortuneOperatorManualPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const returnTo = `/s/${serviceSlug}/manage/fortune/manual`;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  const status = await fortuneOperatorStatus(serviceSlug, actor.userId).catch(() => null);
  if (!status) notFound();
  const base = `/s/${serviceSlug}`;
  const style = {
    '--service-primary': '#5d50e6',
    '--service-secondary': '#ef5b55',
    '--service-font': "'Noto Sans JP'",
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="easy-manual" style={style}>
        <header className="easy-manual__hero">
          <p className="eyebrow">サービス管理者向け</p>
          <h1>占い運営マニュアル</h1>
          <p>初回の公開準備と、公開後に確認する場所を順番に説明します。</p>
          <a className="button button--primary button--full" href="#operator-step-1">
            公開準備をはじめる
          </a>
        </header>

        <nav className="easy-manual__nav" aria-label="運営マニュアル内メニュー">
          <a href="#launch">公開準備</a>
          <a href="#operation">公開後</a>
          <a href="#stop">停止・更新</a>
        </nav>

        <section className="easy-manual__before">
          <h2>現在の状態</h2>
          <ul>
            <li>
              <span>1</span>パッケージ：{status.configured ? '導入済み' : '未導入'}
            </li>
            <li>
              <span>2</span>利用者への公開：{status.enabled ? '公開中' : '停止中'}
            </li>
            <li>
              <span>3</span>導入版：
              {status.packageRelease.installedVersion === null
                ? '未設定'
                : `v${status.packageRelease.installedVersion}`}
            </li>
          </ul>
          <p>利用者の氏名や占い内容は、運用品質の集計画面には表示されません。</p>
        </section>

        <div className="easy-manual__steps" id="launch">
          <section className="easy-manual__card" id="operator-step-1">
            <StepHeader number={1}>占いパッケージを準備する</StepHeader>
            <ol>
              <li>「占いの公開準備」を開きます。</li>
              <li>「占いパッケージを準備する」を1回だけ押します。</li>
              <li>占い担当と安全確認済みの標準解釈468件が「準備済み」になったことを確認します。</li>
            </ol>
            <p className="easy-manual__tip">この操作だけでは利用者へ公開されません。</p>
            <Link className="easy-manual__next" href={`${base}/manage/fortune` as Route}>
              占いの公開準備を開く
            </Link>
          </section>

          <section className="easy-manual__card" id="operator-step-2">
            <StepHeader number={2}>サービス情報と利用文書を整える</StepHeader>
            <ol>
              <li>「ロゴ・問い合わせ先」で、利用者向けロゴと連絡先メールを保存します。</li>
              <li>「利用規約」を入力して公開します。</li>
              <li>「プライバシーポリシー」を入力して公開します。</li>
              <li>利用者として読んでも意味が分かる文章か確認します。</li>
            </ol>
            <div className="button-row">
              <Link className="button button--secondary" href={`${base}/manage/settings` as Route}>
                ロゴ・連絡先を設定
              </Link>
              <Link className="button button--secondary" href={`${base}/manage/legal` as Route}>
                利用文書を設定
              </Link>
            </div>
          </section>

          <section className="easy-manual__card" id="operator-step-3">
            <StepHeader number={3}>公式LINEを確認する</StepHeader>
            <ol>
              <li>「公式LINE」を開きます。</li>
              <li>接続確認が「確認済み」になっていることを確認します。</li>
              <li>専用LINEの場合は、テスト利用が有効で配信停止になっていないことを確認します。</li>
              <li>自分のLINEで友だち追加し、サービス画面を開けるか確認します。</li>
            </ol>
            <Link className="easy-manual__next" href={`${base}/manage/line` as Route}>
              公式LINEを確認する
            </Link>
          </section>

          <section className="easy-manual__card" id="operator-step-4">
            <StepHeader number={4}>公開する</StepHeader>
            <ol>
              <li>公開までの準備が「5/5」になったことを確認します。</li>
              <li>「準備完了後に公開する」を押します。</li>
              <li>自分のLINEから年齢確認、テーマ選択、結果表示まで試します。</li>
              <li>利用者へ渡す案内には、公式LINEの友だち追加URLを使います。</li>
            </ol>
            <p className="easy-manual__warning">
              公開前に、利用規約、プライバシーポリシー、問い合わせ先が正しい運営者情報になっているか確認してください。
            </p>
          </section>
        </div>

        <div className="easy-manual__steps" id="operation">
          <section className="easy-manual__card" id="operator-step-5">
            <StepHeader number={5}>公開後の数字を確認する</StepHeader>
            <ol>
              <li>「占いの公開準備」を週1回開きます。</li>
              <li>新規登録、初回利用、再訪、退会を確認します。</li>
              <li>運用品質が「対応が必要」のときは、失敗理由と止まっている処理を確認します。</li>
              <li>「今回は違った」の理由が増えた場合は、標準解釈や表現を見直します。</li>
            </ol>
            <p className="easy-manual__tip">
              個別の利用者や占い内容を探さず、集計だけで改善を判断します。
            </p>
          </section>

          <section className="easy-manual__card" id="operator-step-6">
            <StepHeader number={6}>週1回のお知らせを使う</StepHeader>
            <ol>
              <li>占いを公開した後、配信する曜日と時刻を選びます。</li>
              <li>「週1回のお知らせ」を有効にします。</li>
              <li>通知を希望した利用者だけが配信対象になります。</li>
              <li>LINE本文には占い結果や氏名が入らないことを確認します。</li>
            </ol>
          </section>
        </div>

        <div className="easy-manual__steps" id="stop">
          <section className="easy-manual__card" id="operator-step-7">
            <StepHeader number={7}>停止とパッケージ更新</StepHeader>
            <ol>
              <li>問題が起きた場合は「利用者への公開を停止する」を押します。</li>
              <li>最新版がある場合は、内容を確認して更新ボタンを押します。</li>
              <li>更新後も公開状態、独自解釈、AI、通知設定は保持されます。</li>
              <li>パッケージ履歴で、日時、版、担当者を確認します。</li>
            </ol>
            <p className="easy-manual__warning">
              利用者の結果や設定を消す操作は、停止や更新とは分けて扱ってください。
            </p>
          </section>
        </div>

        <footer className="easy-manual__footer">
          <Link
            className="button button--primary button--full"
            href={`${base}/manage/fortune` as Route}
          >
            占いの公開準備へ戻る
          </Link>
          {status.enabled && (
            <Link href={`${base}/manual` as Route}>利用者向けマニュアルを見る</Link>
          )}
          <small>2026年9月版</small>
        </footer>
      </article>
    </PublicShell>
  );
}

import type { CSSProperties } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { PublicShell } from '../../../ui/public-shell';

function ActionLabel({ children }: { children: React.ReactNode }) {
  return <strong className="easy-manual__action">{children}</strong>;
}

function StepHeader({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <header className="easy-manual__step-header">
      <span aria-hidden="true">{number}</span>
      <h2>{children}</h2>
    </header>
  );
}

export function FortuneManual({
  serviceSlug,
  serviceName,
  contactEmail,
}: {
  serviceSlug: string;
  serviceName: string;
  contactEmail: string | null;
}) {
  const serviceBase = `/s/${serviceSlug}`;
  const style = {
    '--service-primary': '#5d50e6',
    '--service-secondary': '#ef5b55',
    '--service-font': "'Noto Sans JP'",
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="easy-manual" style={style}>
        <header className="easy-manual__hero">
          <p className="eyebrow">はじめての方へ</p>
          <h1>
            {serviceName}
            <br />
            かんたん使い方
          </h1>
          <p>ボタンの名前を見比べながら、上から順番に進めてください。</p>
          <a className="button button--primary button--full" href="#step-1">
            はじめから見る
          </a>
          <p className="easy-manual__hero-note">一度に全部覚える必要はありません。</p>
        </header>

        <nav className="easy-manual__nav" aria-label="マニュアル内メニュー">
          <a href="#start">利用開始</a>
          <a href="#daily">今日の占い</a>
          <a href="#history">履歴・通知</a>
          <a href="#trouble">困ったとき</a>
        </nav>

        <section className="easy-manual__before" aria-labelledby="fortune-before-title">
          <h2 id="fortune-before-title">先に知っておくこと</h2>
          <ul>
            <li>
              <span>1</span>利用は18歳以上の方が対象です
            </li>
            <li>
              <span>2</span>カードを引けるのは1日1回です
            </li>
            <li>
              <span>3</span>結果は今日を考えるためのヒントです
            </li>
          </ul>
          <p>
            <strong>大切：</strong>
            医療・法律・投資などの重要な判断は、占いだけで決めず専門家へご相談ください。
          </p>
        </section>

        <div className="easy-manual__steps" id="start">
          <section className="easy-manual__card" id="step-1">
            <StepHeader number={1}>LINEからサービスを開く</StepHeader>
            <ol>
              <li>運営者から案内された公式LINEを友だち追加します。</li>
              <li>トーク画面の下にあるメニューを開きます。</li>
              <li>「今日の占い」またはサービスを開くボタンを押します。</li>
              <li>LINEの確認画面が出たら、内容を確認して許可またはログインを押します。</li>
            </ol>
            <p className="easy-manual__tip">
              <strong>メニューが見えない：</strong>
              トーク画面の一番下にある「メニュー」またはキーボードのマークを押します。
            </p>
            <a className="easy-manual__next" href="#step-2">
              次へ：サービスへ参加する ↓
            </a>
          </section>

          <section className="easy-manual__card" id="step-2">
            <StepHeader number={2}>サービスへ参加する</StepHeader>
            <ol>
              <li>
                最初の画面で <ActionLabel>このサービスをはじめる</ActionLabel> を押します。
              </li>
              <li>利用規約とプライバシーポリシーを開いて確認します。</li>
              <li>同意欄にチェックを付けます。</li>
              <li>
                <ActionLabel>参加してはじめる</ActionLabel> を押します。
              </li>
            </ol>
            <p className="easy-manual__tip">
              <strong>参加ボタンを押せない：</strong>
              利用規約とプライバシーポリシーの両方にチェックが付いているか確認してください。
            </p>
            <a className="easy-manual__next" href="#step-3">
              次へ：年齢を確認する ↓
            </a>
          </section>

          <section className="easy-manual__card" id="step-3">
            <StepHeader number={3}>最初の1回だけ年齢を確認する</StepHeader>
            <ol>
              <li>「今日の占い」を開きます。</li>
              <li>18歳以上であることを確認します。</li>
              <li>確認欄にチェックを付けます。</li>
              <li>
                <ActionLabel>18歳以上として利用を始める</ActionLabel> を押します。
              </li>
            </ol>
            <p className="easy-manual__tip">次回から年齢確認は表示されません。</p>
            <a className="easy-manual__next" href="#step-4">
              次へ：カードを引く ↓
            </a>
          </section>
        </div>

        <div className="easy-manual__steps" id="daily">
          <section className="easy-manual__card" id="step-4">
            <StepHeader number={4}>今日のカードを引く</StepHeader>
            <ol>
              <li>「恋愛」「仕事」「人間関係」から、気になるテーマを1つ選びます。</li>
              <li>画面が変わるまで、そのまま少し待ちます。</li>
              <li>カード名、今日のヒント、今日できることを読みます。</li>
              <li>下にある3つの感想から、一番近いものを選びます。</li>
            </ol>
            <p className="easy-manual__warning">
              <strong>1日1回です：</strong>
              テーマを選んだ後の引き直しはできません。翌日になると新しいカードを引けます。
            </p>
            <Link className="easy-manual__next" href={`${serviceBase}/today` as Route}>
              今日の占いを開く
            </Link>
          </section>
        </div>

        <div className="easy-manual__steps" id="history">
          <section className="easy-manual__card" id="step-5">
            <StepHeader number={5}>過去の結果を見る</StepHeader>
            <ol>
              <li>画面下の「過去の結果」を押します。</li>
              <li>見たい日付のカードを押します。</li>
              <li>不要な結果は、個別画面の「この結果を削除する」から削除できます。</li>
            </ol>
            <p className="easy-manual__tip">
              保存期間を過ぎた結果は自動で表示されなくなります。削除した結果は元に戻せません。
            </p>
          </section>

          <section className="easy-manual__card" id="step-6">
            <StepHeader number={6}>週1回のお知らせを設定する</StepHeader>
            <ol>
              <li>画面下の「設定」を押します。</li>
              <li>「週1回のお知らせを受け取る」をオンにします。</li>
              <li>停止したいときは、同じ場所でオフにします。</li>
            </ol>
            <p className="easy-manual__tip">
              運営者がお知らせを停止しているサービスでは、この設定は表示されません。
            </p>
          </section>
        </div>

        <section className="easy-manual__trouble" id="trouble">
          <h2>困ったとき</h2>
          <details>
            <summary>404と表示されます</summary>
            <p>LINEへ戻り、最新のメニューまたは最新の案内から開き直してください。</p>
          </details>
          <details>
            <summary>今日のカードを引けません</summary>
            <p>
              すでに今日のカードを引いていないか「過去の結果」で確認します。翌日になると新しく引けます。
            </p>
          </details>
          <details>
            <summary>お知らせが届きません</summary>
            <p>「設定」でお知らせがオンか確認し、公式LINEをブロックしていないか確認します。</p>
          </details>
          <details>
            <summary>占いサービスだけ退会したいです</summary>
            <p>
              「設定」の一番下にある「この占いサービスを退会する」を押します。他サービスの登録は残ります。
            </p>
          </details>
          {contactEmail && (
            <div className="easy-manual__contact">
              <strong>自分で解決できないとき</strong>
              <p>画面に出た言葉と起きた日時を添えて、運営者へご連絡ください。</p>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              <small>LINEのパスワードや認証番号は送らないでください。</small>
            </div>
          )}
        </section>

        <footer className="easy-manual__footer">
          <Link
            className="button button--primary button--full"
            href={`${serviceBase}/today` as Route}
          >
            今日の占いへ進む
          </Link>
          <Link href={`/s/${serviceSlug}` as Route}>{serviceName}へ戻る</Link>
          <small>2026年9月版</small>
        </footer>
      </article>
    </PublicShell>
  );
}

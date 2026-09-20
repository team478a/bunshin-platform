import type { CSSProperties } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { PublicShell } from '../../../ui/public-shell';

const SENNOKUNI_SLUG = 'sennokuni-media';

function ActionLabel({
  children,
  tone = 'blue',
}: {
  children: React.ReactNode;
  tone?: 'blue' | 'green' | 'coral';
}) {
  return <strong className={`easy-manual__action easy-manual__action--${tone}`}>{children}</strong>;
}

function StepHeader({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <header className="easy-manual__step-header">
      <span aria-hidden="true">{number}</span>
      <h2>{children}</h2>
    </header>
  );
}

export function SennokuniManual() {
  const serviceBase = `/s/${SENNOKUNI_SLUG}`;
  const style = {
    '--service-primary': '#123f73',
    '--service-secondary': '#ef5b55',
    '--service-font': "'Noto Sans JP'",
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="easy-manual" style={style}>
        <header className="easy-manual__hero">
          <p className="eyebrow">会員向け</p>
          <h1>
            千ノ国メディア
            <br />
            はじめ方と使い方
          </h1>
          <p>画面の文字と見比べながら、上から順番に進めてください。</p>
          <a className="button button--primary button--full" href="#step-1">
            はじめから見る
          </a>
          <p className="easy-manual__hero-note">一度に全部覚える必要はありません。</p>
        </header>

        <nav className="easy-manual__nav" aria-label="マニュアル内メニュー">
          <a href="#register">登録</a>
          <a href="#setup">最初の設定</a>
          <a href="#daily">毎日の投稿</a>
          <a href="#points">ポイント</a>
          <a href="#trouble">困ったとき</a>
        </nav>

        <section className="easy-manual__before" aria-labelledby="before-title">
          <h2 id="before-title">用意するもの</h2>
          <ul>
            <li>
              <span>1</span>スマートフォン
            </li>
            <li>
              <span>2</span>いつも使っているLINE
            </li>
            <li>
              <span>3</span>運営者から届いた友だち追加URL
            </li>
          </ul>
          <p>
            <strong>大切：</strong>
            千ノ国メディアの公式LINEを使います。ワタシワークスの共通LINEとは別のアカウントです。
          </p>
        </section>

        <div className="easy-manual__steps" id="register">
          <section className="easy-manual__card" id="step-1">
            <StepHeader number={1}>公式LINEを友だち追加する</StepHeader>
            <ol>
              <li>運営者から届いた青いURLを押します。</li>
              <li>
                LINEの画面で <ActionLabel tone="green">追加</ActionLabel> を押します。
              </li>
              <li>
                追加済みになったら <ActionLabel tone="green">トーク</ActionLabel> を押します。
              </li>
              <li>画面の下にメニューが出れば完了です。</li>
            </ol>
            <p className="easy-manual__tip">
              <strong>メニューが見えない：</strong>
              トーク画面の一番下にある「メニュー」またはキーボードのマークを押します。
            </p>
            <a className="easy-manual__next" href="#step-2">
              次へ：利用を始める ↓
            </a>
          </section>

          <section className="easy-manual__card" id="step-2">
            <StepHeader number={2}>千ノ国メディアの利用を始める</StepHeader>
            <ol>
              <li>
                LINEメニューの <ActionLabel>今日やること</ActionLabel> を押します。
              </li>
              <li>
                千ノ国メディアの画面で{' '}
                <ActionLabel tone="green">このサービスをはじめる</ActionLabel> を押します。
              </li>
              <li>LINEの確認画面が出たら、内容を確認して許可またはログインを押します。</li>
              <li>千ノ国メディアの画面へ戻るまで、そのまま待ちます。</li>
            </ol>
            <p className="easy-manual__tip">
              <strong>画面が閉じた：</strong>
              LINEのトークへ戻り、もう一度「今日やること」を押してください。最初からやり直す必要はありません。
            </p>
            <a className="easy-manual__next" href="#step-3">
              次へ：利用条件を確認する ↓
            </a>
          </section>

          <section className="easy-manual__card" id="step-3">
            <StepHeader number={3}>利用条件を確認して参加する</StepHeader>
            <ol>
              <li>「利用規約を読む」を押して内容を確認します。</li>
              <li>確認したら「利用規約に同意します」の四角を押します。</li>
              <li>プライバシーポリシーも同じように確認して、四角を押します。</li>
              <li>
                <ActionLabel>参加してはじめる</ActionLabel> を押します。
              </li>
            </ol>
            <p className="easy-manual__tip">
              <strong>ボタンを押せない：</strong>
              2つの同意欄にチェックが付いているか確認してください。
            </p>
            <a className="easy-manual__next" href="#step-4">
              次へ：質問に答える ↓
            </a>
          </section>
        </div>

        <div className="easy-manual__steps" id="setup">
          <section className="easy-manual__card" id="step-4">
            <StepHeader number={4}>最初の3つの質問に答える</StepHeader>
            <p>迷ったときは、一番近い答えを選べば大丈夫です。</p>
            <div className="easy-manual__questions">
              <div>
                <strong>質問1</strong>
                <span>千ノ国メディアを知ったきっかけ</span>
                <small>知人の紹介、説明会、イベント、SNSなど</small>
              </div>
              <div>
                <strong>質問2</strong>
                <span>SNSでつながっている人</span>
                <small>友人、家族、地域の方、仕事関係、同じ趣味の方など</small>
              </div>
              <div>
                <strong>質問3</strong>
                <span>感じたことや伝えたいこと</span>
                <small>まだない場合は「まだありません」で大丈夫です</small>
              </div>
            </div>
            <ol>
              <li>画面に大きな選択肢が出たら、一番近いものを押します。</li>
              <li>当てはまるものがないときだけ「その他」を選び、短く入力します。</li>
              <li>
                <ActionLabel>保存して次へ</ActionLabel> を押します。
              </li>
            </ol>
            <a className="easy-manual__next" href="#step-5">
              次へ：投稿パートナーを選ぶ ↓
            </a>
          </section>

          <section className="easy-manual__card" id="step-5">
            <StepHeader number={5}>投稿パートナーを選ぶ</StepHeader>
            <p>回答をもとに、投稿を一緒に考えるパートナーが3案表示されます。</p>
            <ol>
              <li>3つの案を上から順番に読みます。</li>
              <li>
                一番わかりやすい案の <ActionLabel>この案を選ぶ</ActionLabel> を押します。
              </li>
              <li>「選択中」と表示されたことを確認します。</li>
              <li>
                <ActionLabel>この案で作る</ActionLabel> を押します。
              </li>
            </ol>
            <p className="easy-manual__tip">
              <strong>案が出ない：</strong>少し待ってから「もう一度準備する」を1回だけ押します。
            </p>
            <a className="easy-manual__next" href="#step-6">
              次へ：配信を設定する ↓
            </a>
          </section>

          <section className="easy-manual__card" id="step-6">
            <StepHeader number={6}>投稿するSNSと受信時刻を決める</StepHeader>
            <ol>
              <li>Instagramなど、実際に使うSNSを1つ選びます。</li>
              <li>投稿するペースを選びます。初めての方は「週1回から始める」がおすすめです。</li>
              <li>LINEを受け取りたい時刻を選びます。</li>
              <li>
                <ActionLabel tone="green">LINE配信を始める</ActionLabel> を押します。
              </li>
            </ol>
            <p className="easy-manual__tip">
              受信時刻は午前7時から午後8時59分まで選べます。あとから変更できます。
            </p>
            <a className="easy-manual__next" href="#step-7">
              次へ：毎日の使い方 ↓
            </a>
          </section>
        </div>

        <div className="easy-manual__steps" id="daily">
          <section className="easy-manual__card" id="step-7">
            <StepHeader number={7}>届いた投稿案をSNSへ投稿する</StepHeader>
            <ol>
              <li>LINEに届いた案内を押します。届いていない場合は「今日やること」を押します。</li>
              <li>
                投稿案を読み、使う場合は <ActionLabel>採用する</ActionLabel> を押します。
              </li>
              <li>
                画像を使う場合は <ActionLabel>画像用の文章をコピー</ActionLabel> を押します。
              </li>
              <li>ChatGPTなど、画像を作れるサービスを開き、コピーした文章を貼り付けて送ります。</li>
              <li>
                作成された画像をスマートフォンへ保存します。続きの画像が必要なときは「次」と送ります。
              </li>
              <li>
                千ノ国メディアへ戻り、<ActionLabel>投稿文をコピー</ActionLabel> を押します。
              </li>
              <li>Instagramなどを開き、保存した画像と投稿文を入れて内容を確認します。</li>
              <li>SNSへ投稿した後、千ノ国メディアへ戻ります。</li>
              <li>
                <ActionLabel tone="coral">投稿しました</ActionLabel> を押します。
              </li>
            </ol>
            <p className="easy-manual__warning">
              <strong>順番に注意：</strong>
              「投稿しました」は、実際にSNSへ投稿したことを確認してから押します。
            </p>
            <p className="easy-manual__tip">
              <strong>画像について：</strong>
              千ノ国メディアの中では画像を作りません。「画像用の文章」をChatGPTなどへ送って作ります。
            </p>
            <details className="easy-manual__details">
              <summary>iPhoneでコピーできないとき</summary>
              <ol>
                <li>投稿文が入っている白い枠の中を長押しします。</li>
                <li>「すべてを選択」を押します。</li>
                <li>「コピー」を押します。</li>
                <li>SNSの入力欄を長押しして「ペースト」を押します。</li>
              </ol>
            </details>
            <a className="easy-manual__next" href="#step-8">
              次へ：ポイントを確認する ↓
            </a>
          </section>
        </div>

        <div className="easy-manual__steps" id="points">
          <section className="easy-manual__card" id="step-8">
            <StepHeader number={8}>ポイントとバッジを確認する</StepHeader>
            <p>
              登録と利用規約への同意を終えた参加者には、対象の行動をすると自動でポイントが付きます。申請は不要です。
            </p>
            <div className="easy-manual__point-list">
              <div>
                <strong>+10 WP</strong>
                <span>その日に初めて投稿案を見る</span>
                <small>1日1回</small>
              </div>
              <div>
                <strong>+10 WP</strong>
                <span>SNS投稿後に「投稿しました」を押す</span>
                <small>1日1回</small>
              </div>
              <div>
                <strong>+10 WP</strong>
                <span>1週間に3回「投稿しました」を記録する</span>
                <small>1週間に1回</small>
              </div>
            </div>
            <ol>
              <li>LINEメニューの「今日やること」を押します。</li>
              <li>千ノ国メディアのホームまで戻ります。</li>
              <li>
                <ActionLabel>ポイント・バッジを見る</ActionLabel> を押します。
              </li>
              <li>「いま使えるポイント」と「もらったバッジ」を確認します。</li>
            </ol>
            <p className="easy-manual__tip">
              <strong>すぐ増えない：</strong>
              通常1分ほど待ってから、ポイント画面を開き直してください。同じ行動のポイントは原則1日1回です。
            </p>
            <details className="easy-manual__details">
              <summary>ポイントの使い道を見る</summary>
              <div className="easy-manual__uses">
                <p>
                  <strong>30 WP</strong>
                  <span>別の投稿案を1回作る</span>
                </p>
              </div>
              <small>
                ポイント数と使い道は運営者が変更する場合があります。画面に表示される数字が最新です。
              </small>
              <small>画像用の文章をコピーして使うとき、画像作成回数やWPは消費しません。</small>
            </details>
          </section>
        </div>

        <section className="easy-manual__trouble" id="trouble">
          <h2>困ったとき</h2>
          <details>
            <summary>LINEが届きません</summary>
            <p>友だち追加と通知設定を確認し、その日が投稿予定日か確認します。</p>
          </details>
          <details>
            <summary>今日の投稿案がありません</summary>
            <p>準備中の場合があります。少し待ってから画面を開き直してください。</p>
          </details>
          <details>
            <summary>404と表示されます</summary>
            <p>LINEへ戻り、最新のメニューまたは最新の案内から開き直してください。</p>
          </details>
          <details>
            <summary>ログインできません</summary>
            <p>千ノ国メディアの案内を開き直し、LINEログインをやり直してください。</p>
          </details>
          <div className="easy-manual__contact">
            <strong>自分で解決できないとき</strong>
            <p>
              押したボタン、画面に出た言葉、起きた日時を添えてご連絡ください。可能であれば画面の写真も送ってください。
            </p>
            <a href="mailto:support@sennokuni.com">support@sennokuni.com</a>
            <small>LINEのパスワード、認証番号、クレジットカード番号は送らないでください。</small>
          </div>
        </section>

        <footer className="easy-manual__footer">
          <Link className="button button--primary button--full" href={`${serviceBase}` as Route}>
            千ノ国メディアへ戻る
          </Link>
          <Link href={`${serviceBase}/help` as Route}>詳しいヘルプを見る</Link>
          <span>運営：和愛株式会社</span>
          <small>2026年9月版</small>
        </footer>
      </article>
    </PublicShell>
  );
}

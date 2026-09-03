import Link from 'next/link';
import { getServerEnvironment } from '@bunshin/config';
import { PublicShell } from '../ui/public-shell';

export default function HomePage() {
  const lineUrl = getServerEnvironment().LINE_OFFICIAL_ACCOUNT_URL;
  return (
    <PublicShell>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <p className="eyebrow">あなたのための企画担当</p>
          <h1 id="landing-title">毎日の発信を、あなたの分身と。</h1>
          <p>
            あなた専用のSNS戦略を考え、今日やることと投稿案を届けます。内容を選んでコピーし、投稿するだけです。
          </p>
          <div className="landing-actions">
            {lineUrl ? (
              <a className="button button--primary" href={lineUrl} rel="noreferrer">
                公式LINEを友だち追加してはじめる
              </a>
            ) : (
              <Link className="button button--primary" href="/login">
                ワタシワークスをはじめる
              </Link>
            )}
            <a className="button button--secondary" href="#how-it-works">
              使い方を見る
            </a>
          </div>
          <small>
            {lineUrl
              ? '友だち追加後、LINEの案内から登録できます'
              : 'メールリンクでログイン・パスワード不要'}
          </small>
        </div>
        <div className="landing-visual" aria-hidden="true">
          <span className="landing-visual__circle landing-visual__circle--one" />
          <span className="landing-visual__circle landing-visual__circle--two" />
          <div className="landing-mission-preview">
            <span>今日やること</span>
            <strong>専門知識を1つ、短い言葉で届ける</strong>
            <small>X ・ 文章 ・ 約5分</small>
          </div>
        </div>
      </section>
      <section className="landing-steps" id="how-it-works" aria-labelledby="steps-title">
        <p className="eyebrow">使い方</p>
        <h2 id="steps-title">迷わず発信できる3ステップ</h2>
        <ol>
          <li>
            <span>1</span>
            <strong>戦略を作る</strong>
            <p>目的と届けたい相手から、SNSの育て方を整理します。</p>
          </li>
          <li>
            <span>2</span>
            <strong>今日の案を選ぶ</strong>
            <p>毎日の具体的な投稿案を確認し、採用する案を選びます。</p>
          </li>
          <li>
            <span>3</span>
            <strong>コピーして投稿</strong>
            <p>文章や台本をコピーし、ご自身のSNSへ投稿します。</p>
          </li>
        </ol>
      </section>
    </PublicShell>
  );
}

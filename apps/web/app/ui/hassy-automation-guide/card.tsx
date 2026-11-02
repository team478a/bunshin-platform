'use client';

import { useState } from 'react';
import './guide.css';

export const HASSY_AUTOMATION_PLANNING_PROMPT = `SNS投稿の準備作業を小さく分ける相談です。
投稿先：[自分で入力]
負担に感じる作業：[自分で入力]
使える時間：[自分で入力]
公開してよい情報だけを使い、手動でできる方法を先に1つ提案してください。
自動化する場合は、開始条件、実行内容、渡す情報、費用、止め方、本人の確認が必要な箇所を分けてください。
投稿・アプリ接続・アカウント設定変更は実行せず、提案だけにしてください。`;

/** Hassy-only static guidance. No user data, API requests, or connection state. */
export function HassyAutomationGuide() {
  const [copied, setCopied] = useState<'IDLE' | 'COPYING' | 'COPIED' | 'FAILED'>('IDLE');
  async function copy() {
    setCopied('COPYING');
    try {
      await navigator.clipboard.writeText(HASSY_AUTOMATION_PLANNING_PROMPT);
      setCopied('COPIED');
    } catch {
      setCopied('FAILED');
    }
  }
  return (
    <section className="hassy-automation-guide" aria-label="投稿準備と自動化のガイド">
      <h2>投稿の負担を小さくする</h2>
      <p>まずは今日の投稿を1件。外部サービスに登録しなくても、ハッシーをいつもどおり使えます。</p>
      <details>
        <summary>ハッシーだけで投稿を準備する</summary>
        <ol>
          <li>
            「今日の投稿案」を確認し、使いたい案を採用します。合わない場合は不採用や別案を選びます。
          </li>
          <li>文章をコピーし、写真・表現・公開してよい情報を自分で確認します。</li>
          <li>使っているSNSを自分で開き、文章と画像を用意して、公開前に最終確認します。</li>
          <li>
            SNSへの投稿後、ハッシーで投稿完了を報告します。報告はSNS側の公開確認とは異なります。
          </li>
        </ol>
        <p>時間がない日は、確認や下書きの準備までで大丈夫です。</p>
      </details>
      <details>
        <summary>Zapierで省力化を考える</summary>
        <p>
          Zapierは「きっかけ（トリガー）」に応じて「処理（アクション）」を行う外部サービスです。例えば、自分の作業表への追加をきっかけに、自分宛ての準備通知を送る構成を検討できます。対応アプリと利用条件はZapierで確認します。
        </p>
        <ol>
          <li>繰り返している作業を1つ選び、開始条件と、最後に自分で確認する内容を決めます。</li>
          <li>
            利用したいアプリの対応状況、アクセス権限、プラン・タスク上限・追加料金を公式ページで確認します。
          </li>
          <li>
            本人が接続を選び、テスト用アカウントと架空の情報を用意します。アクションのテストも実際の送信や更新を行う場合があります。
          </li>
          <li>
            実行先と渡す情報を確認してから、本人の判断で有効化します。停止・接続解除の方法も確認します。
          </li>
        </ol>
        <p>
          ハッシーとの直接接続・予約投稿・自動投稿を提供するガイドではありません。この画面から接続やテストは実行しません。外部サービスの料金はハッシーの画像クレジットとは別です。
        </p>
        <ul>
          <li>
            <a
              href="https://help.zapier.com/hc/en-us/articles/8496309697421-What-is-a-Zap"
              target="_blank"
              rel="noopener noreferrer"
            >
              Zapier公式：仕組みと始め方（外部サイト）
            </a>
          </li>
          <li>
            <a
              href="https://help.zapier.com/hc/en-us/articles/18811411817741-Test-Zap-steps"
              target="_blank"
              rel="noopener noreferrer"
            >
              Zapier公式：テスト時の動作（外部サイト）
            </a>
          </li>
          <li>
            <a href="https://zapier.com/pricing" target="_blank" rel="noopener noreferrer">
              Zapier公式：現在のプランと料金（外部サイト）
            </a>
          </li>
        </ul>
        <p>公式仕様の確認日：2026年11月2日。利用時は最新の公式情報をご確認ください。</p>
      </details>
      <details>
        <summary>相談用の指示文をコピーする</summary>
        <p>
          ご自身で選んだAIに相談するときのひな形です。空欄は公開してよい範囲でご自身で入力してください。
        </p>
        <textarea
          aria-label="自動化の相談用指示文"
          readOnly
          value={HASSY_AUTOMATION_PLANNING_PROMPT}
          rows={10}
        />
        <button
          type="button"
          disabled={copied === 'COPYING'}
          onClick={() => {
            void copy();
          }}
        >
          相談用の指示文をコピー
        </button>
        <p role="status" aria-live="polite">
          {copied === 'COPIED'
            ? '指示文をコピーしました。相談先はご自身で選んでください。'
            : copied === 'FAILED'
              ? 'コピーできませんでした。入力欄の文章を選択してコピーしてください。'
              : copied === 'COPYING'
                ? 'コピーしています。'
                : 'ボタンを押すと、このひな形だけをコピーします。'}
        </p>
      </details>
      <p>
        外部へ渡す前に、顧客情報・未公開情報・他の人の写真・APIキーやTokenが含まれていないか確認してください。接続先の保存・削除・連携解除の条件も確認しましょう。
      </p>
    </section>
  );
}

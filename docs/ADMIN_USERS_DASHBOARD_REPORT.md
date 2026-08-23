# ユーザー管理・運用ダッシュボード 実装報告

## 調査した内容

- 既存のWorkspace単位FREE MVP指標
- LINE配信状況とLINE Funnel
- AI使用量、投稿完了、Mission Activity、退会処理
- Platform Admin権限と管理画面Shell

## 実装範囲

- Platform Admin専用のユーザー一覧
- 名前・メール検索、要確認ユーザー絞り込み
- 登録から投稿完了までの全体Funnel
- ユーザー数、新規登録、投稿、LINE接続、AI回数・失敗・見積原価
- ユーザーごとの到達段階、最終利用、投稿回数、LINE状態
- BUNSHIN未作成、7日以上未利用、AI連続失敗、退会処理待ちの検出
- ユーザー詳細と本文を含まない直近50件の行動履歴

## 設計判断

- 投稿本文、Knowledge、Memory、Mission本文、LINE user ID、Provider応答を管理画面へ出さない。
- 読み取り専用から開始し、ユーザー停止や代理操作は別の監査付きPRへ分離する。
- LINE状態は現在の実行環境と一致するConnectionだけを使用する。
- Funnelは期間内に登録したユーザーを対象とし、期間終了後の行動を混ぜない。
- 一覧は最大200人、Funnel cohortは最大5,000人とし、超過時は一部表示であることを明示する。

## 検証

- 非Platform Adminの場合、User tableを問い合わせる前に拒否するテスト
- 不正な期間、検索長、User IDをApplication境界で拒否するテスト
- TypeScript、ESLint、Vitest、Prettier、`git diff --check`

## 後続候補

- ページ送りとCSV出力
- 日別推移グラフ
- 理由付きユーザー停止・再開
- サポート対応メモと担当者
- 管理操作Audit

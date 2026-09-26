# HASSY SNS継続支援 事業者集計 実装報告

## 1. 調査した内容

- 既存の事業者向け「個別化の確認」画面とService管理者認可を確認した。
- 障壁・支援の既存状態からリアルタイム集計できるため、集計テーブルやmigrationは不要と判断した。

## 2. 変更したファイル

- `packages/database/src/social-activity-barrier-summary.ts`
- `packages/database/test/social-activity-barrier-summary.test.ts`
- `packages/capability-social/src/activity-barrier-support.ts`
- `apps/web/app/s/[serviceSlug]/manage/personalization/page.tsx`
- `apps/web/test/social-activity-barrier-admin-summary.test.ts`
- `apps/web/app/styles.css`
- `docs/DECISION_LOG.md`

## 3. 主要な設計判断

- Workspace / Service / Active Membershipの範囲だけを集計する。
- 確認済みCategory、本人確認待ち、支援中、完了、見送り、解決済みを件数で表示する。
- User ID、氏名、回答本文、投稿本文、支援内容Snapshotは返さない。
- 既存の「個別化の確認」画面へ統合する。

## 4. 実行した検証

- Service scopeを含むRepository queryと集計値のDatabase test。
- 管理画面に内部回答・Snapshotを表示しない静的test。
- Capability Social、Database、Webのtypecheck / lint / test / build。

## 5. 未解決事項

- Barrier推定を定期実行するJob接続。
- 実運用データでの集計件数照合。
- 件数が増えた場合の月次Snapshotは実測後に判断する。

## 6. 次Phaseへ進める条件

- Service管理者だけが画面を閲覧できることをレビューする。
- 次PRでは既存Job基盤を利用し、推定をService・Bunshin単位で冪等実行する。

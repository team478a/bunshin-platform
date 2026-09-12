# ポイント失効前のお知らせ 実装報告

## 1. 調査した内容

未使用ポイントの自動失効、ポイント画面の30日以内の失効予定、最も近い期限は実装済みだった。一方、利用者がポイント画面を自分で開かなければ期限へ気づけず、実装計画にある失効予告はLINEへ接続されていなかった。

## 2. 変更したファイル

- `apps/web/src/services/weekly-progress-report.ts`
- `apps/web/src/services/weekly-progress-report-data.ts`
- `apps/web/src/services/weekly-report-line-delivery.ts`
- `apps/web/src/services/weekly-report-line-scheduler.ts`
- `apps/web/app/s/[serviceSlug]/weekly-report/page.tsx`
- `apps/web/app/(app)/points/page.tsx`
- `apps/web/app/styles.css`
- 週間レポート関連テスト

## 3. 主要な設計判断

- 新しい通知先やCronを増やさず、運営者が有効にした既存の週間レポートLINE配信へ追加する。
- 30日以内に期限を迎える`GRANT`から、すでに使用した分を差し引いた未使用ポイントだけを集計する。
- 合計値と最も近い期限を分けて表示し、複数の失効日がある場合に全ポイントが同じ日に失効するような誤解を防ぐ。
- ポイントはWorkspace共通残高のため、特定サービス由来だけに限定せず、本人の同じWorkspace内の失効予定を知らせる。
- LINE通知は既存の参加状態、通知同意、友だち状態、サービスLINE接続、配信設定のGateをそのまま使用する。

## 4. 実行した検証

- 一部使用済みの付与から未使用分だけを集計するテスト
- 複数期限から最も近い日を選ぶテスト
- 失効予定がある場合だけLINE文面へ追記するテスト
- 週間レポートの本人・サービス境界テスト
- Webの全テスト、型検査、lint、production build

## 5. 未解決事項

- LINEへの到達は、各サービスで週間レポート配信が有効である場合に限る。
- 本番で期限が30日以内のテストポイントを用意し、週間レポート画面とLINEの双方で日付と未使用量を確認する。

## 6. 次Phaseへ進める条件

- 失効予定がない利用者の週間LINE文面が従来どおりである。
- 失効予定がある利用者だけに、30日以内の未使用量と最も近い期限が表示される。
- LINEから認証済みの週間レポートを開き、ポイント履歴へ移動できる。

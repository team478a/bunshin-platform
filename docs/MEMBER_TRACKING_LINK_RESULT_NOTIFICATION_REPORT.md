# Member Tracking Link Result Notification Report

## 調査した内容

- 参加者本人が専用URLを下書き登録し、運営者が使用開始できる機能は実装済みだった。
- 確認待ちURLに修正依頼を出す操作と、確認結果を参加者へ知らせる機能がなかった。
- サービス専用LINEの一斉配信基盤は、宛先を参加者単位で永続化し、既存ジョブで安全に配信できる。

## 変更したファイル

- `packages/database/src/index.ts`
- `apps/web/src/services/member-tracking-link-notification.ts`
- `apps/web/src/http/external-tracking-links.ts`
- `apps/web/app/api/services/[serviceSlug]/external-tracking/[[...path]]/route.ts`
- `apps/web/app/(app)/admin/external-tracking/external-tracking-operations.tsx`
- `apps/web/test/service-member-tracking-link-notification.test.ts`

## 主要な設計判断

- 使用開始と修正依頼の結果を、対象となる参加者1人だけへ専用LINEで通知する。
- 既存のサービスLINE配信テーブル、監査記録、ジョブワーカーを再利用する。
- LINE連携、友だち状態、通知同意、専用LINE設定が揃う場合だけ通知を予約する。
- LINE通知を予約できなくてもURLの状態変更は成功させ、参加者画面の状態を正本とする。
- 修正依頼は既存の `SUSPENDED` 状態を使用し、参加者が登録し直すと新しい確認待ちURLを作る。

## 実行した検証

- 専用境界テスト
- Web / Database lint、typecheck、test、build

## 未解決事項

- 本番LINEで使用開始通知と修正依頼通知を各1件確認する必要がある。

## 次へ進める条件

- CI通過後、本番でテスト参加者の専用URLを使って2種類の通知を確認する。

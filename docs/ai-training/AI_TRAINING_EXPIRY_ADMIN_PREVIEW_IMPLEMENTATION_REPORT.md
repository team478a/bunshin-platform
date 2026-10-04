# AI研修 期限終了対象の管理画面Preflight

## 1. 調査した内容

main `581bb1a2e57482c77cf943b6119b020ff732a9df`を基準に、本番の読み取り専用内部Preflight、期限終了の対象条件、AI研修管理画面、保持期限管理画面のDB再認可パターンを確認した。既存内部APIはCron Secret専用で、Service管理者が秘密値を扱わず対象件数を確認する導線がなかった。

## 2. 変更したファイル

- `packages/capability-training/src/enrollment-expiry.ts`: 読み取り結果とService管理者Repositoryの契約。
- `packages/database/src/training-enrollment-expiry.ts`: 同一SnapshotのService管理権限再検証と既存件数集計の再利用。
- `apps/web/src/services/ai-training-enrollment-expiry-admin.ts`: エラー詳細を出さないComposition Service。
- `apps/web/app/s/[serviceSlug]/manage/training/expiry/*`: Service管理者限定の読み取り専用画面。
- Database/Webテスト、Decision Log、Roadmap。

DB schema、Migration、依存関係、Cron、本番設定は変更しない。

## 3. 主要な設計判断

Service Slugの画面認可に加え、DBのRepeatableRead Transaction内でWorkspace、Service、本人、ACTIVE所属、SERVICE_OWNER/ADMIN、User/Group/Workspaceの活動状態を再検証する。認可と件数集計を同じSnapshotで行う。

対象条件は既存の期限終了実行/Preflightと共用する。画面は件数、1回100件の上限、必要回数、確認時刻だけを表示し、受講ID、User、回答、評価、仕事情報は取得・表示しない。Cron Secretと内部APIはブラウザーに渡さない。

## 4. 実行した検証

- Database Unit: 管理者認可と件数の同一Transaction、権限喪失時の集計未実行、DB障害伝播。
- Web Unit: ログイン/Service Scope、DB再認可、集計のみの表示、障害時の0件誤表示防止、100件超過案内、認証後の戻り先。
- Node.js 24でformat、typecheck、lint、architecture、全Unit Test、production build、`git diff --check`を実行した。Webは407ファイル・2,571件、Databaseは173ファイル・666件が成功した。
- ローカル環境に`DATABASE_URL`がないためDB統合テストは未実行。実DBの値は読まず、PRのDatabase CIで確認する。

## 5. 未解決事項

- 本番の実件数は、本変更のマージ・リリース後に対象Serviceの管理画面から確認する。
- 本番期限終了の停止解除、Cron登録、100件超過時の連続実行、通知、保持期限削除は本PRに含めない。

## 6. 次作業へ進める条件

CIと人間レビュー後にマージ・本番反映し、AI研修Serviceの管理画面で対象件数と必要回数を記録する。実行有効化はその結果と停止/復旧手順、運営承認を受ける別PRとする。

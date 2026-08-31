# Program Foundation Core 実装報告

## 1. 調査内容

既存`Group.id`がサービス識別子、`GroupMembership.id`がサービス参加識別子として利用されていることを確認した。新しいService tableは作らず、この境界をProgramにも適用した。

## 2. 実装内容

- Program Templateと不変のTemplate Version
- サービスが採用Versionを固定するService Program
- 販売・原価・サポート等の責任を分離するOffering Version
- 参加時点のOffering条件とGoalを保存するEnrollment
- 全変更を追跡するProgram Audit Log
- Platform共通／サービス限定Templateの権限制御
- Workspace、Service、Membershipを越えないRepository境界

## 3. 主要な設計判断

Platform共通TemplateはSUPER_ADMINだけが作成する。サービス限定Template、Program採用、Offering、Enrollmentは当該サービスのSERVICE_OWNERまたはSERVICE_ADMINだけが管理する。

利用者は自分のEnrollmentだけを参照できる。サービス管理者は自サービス内だけを参照できる。Template Version、Offering Version、Enrollment Snapshotは過去条件を保つため削除連鎖を使わない。

## 4. 初期範囲

本PRはCore PersistenceとRepositoryまでとする。管理API、管理画面、利用者画面、Checkout、請求、返金、売上分配、代理店報酬は実装しない。

## 5. 検証

- Prisma Schema validation
- Application unit test
- Migration boundary test
- TypeScript typecheck
- 全体format、lint、test、build

## 6. 次Phase

レビューとMigration適用後、AV-2で公式Program作成、サービス採用、無料・招待限定の手動参加をAPI/UIへ接続する。

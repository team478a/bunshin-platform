# OEM商用利用量・料金基盤 実装報告

## 1. 調査した内容

- `Workspace(type=ORGANIZATION)`をOEM契約単位として利用できること
- `GroupMembership`のRoleから参加者と運営者を分離できること
- 投稿支援で利用者の明示操作が確定するHTTP経路
- 既存のOrganization entitlement、管理画面、Cron認証とVercel schedule

## 2. 実装した機能

- 参加者本人の対象操作を保存する`ServiceUsageEvent`
- Workspace単位の月間ユニーク利用者集計
- 0〜3,000 MAUの版管理された料金判定と3,001人以上の個別見積判定
- 請求根拠を保存する`TenantMonthlyUsage`
- 確定済み月次値の更新・削除を防ぐDB trigger
- 毎月1日01:15（Asia/Tokyo）相当の自動月次確定
- システム管理者向け利用量・料金・確定画面
- 運営団体OWNER/ADMIN向け利用人数・料金確認画面

対象操作は、投稿案生成、再生成、採用、今日やることの確認、週間計画の閲覧です。登録・ログインだけの利用、運営者、スタッフ、Platform AdminはMAUへ含めません。

## 3. 主要な設計判断

- 契約・請求単位はService GroupではなくOrganization Workspaceとする。
- Service固有処理は利用イベントを発生させるだけにし、料金計算と月次確定を共通基盤へ置く。
- 月中はイベントからリアルタイム集計し、請求値は月末後の確定スナップショットを正本とする。
- タイムゾーンはAsia/Tokyo、期間は半開区間`[月初, 翌月初)`とする。

## 4. 検証

- Application unit test: 108 files / 496 tests
- Database unit test: 104 files / 330 tests
- Web test: 248 files / 1,160 tests
- Web、Database TypeScript typecheck
- Web、Database、Application lint
- Next.js production build
- Prisma schema validationとclient generation

## 5. 未解決事項

- Stripe等による自動請求、請求書発行、入金消込
- 契約申込・プラン変更・解約のセルフサービス画面
- 料金表を管理画面から改定し、将来月へ適用する機能
- 利用人数や料金帯変更のLINE／メール通知
- API原価とMAU売上を並べた採算画面

## 6. 次の実装条件

本変更のmigration適用と本番計測開始を確認した後、請求・契約管理をこの確定値へ接続する。

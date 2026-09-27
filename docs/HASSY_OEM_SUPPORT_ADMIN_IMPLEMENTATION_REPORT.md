# HASSY OEM支援候補 管理画面実装報告

## 1. 調査した内容

- Service管理者認可、個別化確認画面、OEM支援候補の正本を確認した。
- 候補一覧、対応状態の変更、操作監査が未実装であることを確認した。

## 2. 変更したファイル

- `packages/database/src/social-activity-oem-support-admin.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260927210000_add_social_activity_oem_candidate_audit/migration.sql`
- `apps/web/app/s/[serviceSlug]/manage/personalization/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/personalization/oem-support-candidate-actions.ts`
- 関連テストとSchema readiness。

## 3. 主要な設計判断

- Service Owner / Service Adminだけが自Serviceの候補を参照・更新できる。
- `OPEN -> ACCEPTED / DISMISSED`、`ACCEPTED -> COMPLETED` だけを許可する。
- 状態変更は実行者、前後状態、理由、日時を監査履歴へ保存する。
- 画面は事業名、支援種別、状態、検知日に限定し、投稿本文、Memory、Promptは表示しない。
- 対応開始や完了で自動営業・契約・課金を行わない。

## 4. 実行した検証

- Prisma validate、Database build。
- Database 152 files / 480 tests、lint。
- Web typecheck、管理画面対象テスト、変更ファイルlint。

## 5. 未解決事項

- 実運用データでの一覧表示と状態変更確認。
- 対応内容の自由記録やCRM機能はV1対象外。

## 6. 次Phaseへ進める条件

- MigrationとCIが成功すること。
- 検証用ServiceでService越境不可とAudit作成を確認すること。

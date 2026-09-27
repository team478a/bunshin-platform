# HASSY OEM支援候補 Projection 実装報告

## 1. 調査した内容

- 確認済み障壁、無償支援、行動Evidence、定期Schedulerの既存フローを確認した。
- 無償支援完了後の未改善をOEM支援候補として保存する正本がないことを確認した。

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier-oem-support.ts`
- `packages/database/src/social-activity-oem-support-candidates.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260927190000_add_social_activity_oem_support_candidates/migration.sql`
- `apps/web/src/http/mission-scheduler.ts`
- 関連テストとSchema readinessを更新。

## 3. 主要な設計判断

- `CONFIRMED` の障壁で無償支援が `COMPLETED` になった後だけを対象にする。
- 支援完了後から始まる14有効日以上の新しいEvidenceで、同じ障壁が継続した場合だけ候補化する。
- システム障害日を含むEvidenceは候補化しない。
- `CONTENT` は個別化品質問題と区別できないため、自動の商用候補から除外する。
- 支援Interventionごとの一意制約とupsertで、Scheduler再実行時の二重作成を防ぐ。
- 候補には投稿本文、Memory、Prompt、Knowledge本文を保存しない。

## 4. 実行した検証

- Capability Socialのルールテスト、typecheck、lint。
- DatabaseのProjectionテスト、schemaテスト、typecheck、lint。
- Web Scheduler接続テストとtypecheck。
- Prisma generate / build / schema readiness。

## 5. 未解決事項

- Service Adminが候補を確認し、`ACCEPTED / DISMISSED / COMPLETED` へ変更する画面と監査履歴。
- 実運用の14日再観測データによる候補数の確認。

## 6. 次Phaseへ進める条件

- MigrationとCIが成功すること。
- 次PRでService管理者専用の最小一覧、状態変更、Audit Logを追加すること。

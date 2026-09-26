# HASSY SNS支援 H2-B Barrier Persistence実装報告

## 1. 調査した内容

- Serviceの正本である`Group` / `GroupMembership`
- Bunshin所有境界
- `DailyMission`、`MissionActivity`、`MissionDecision`、`PostRecord`
- `SocialInsightSnapshot`とLINE配信履歴
- 生成失敗・LINE失敗から利用不能日を除外する方法
- 既存Migration、RLS、Database Readinessの規約

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier.ts`
- `packages/capability-social/src/activity-barrier-persistence.ts`
- `packages/capability-social/src/index.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260926220000_add_social_activity_barriers/migration.sql`
- `packages/database/src/social-activity-barrier-repository.ts`
- `packages/database/src/index.ts`
- `packages/database/src/schema-readiness.ts`
- 関連テスト、Decision Log

## 3. 主要な設計判断

### 既存イベントを集計する

Barrier専用Activityテーブルは追加していません。既存のMission、投稿完了、投稿結果、LINE配信から観測値を作ります。

### スコープをDBとRepositoryの両方で検証する

CaseはWorkspace / Group / Membership / User / Bunshinを必須にします。複合外部キーに加え、RepositoryはActive Membership、対象Service、Bunshin所有者を確認してから読み書きします。

### 障害日を利用者要因にしない

Daily Mission生成失敗日とLINE配信失敗日は観測から除外します。有効観測日が0日の場合、H2-Aルールは候補を生成しません。

### 本文を保存しない

Evidenceは期間、集計値、閾値、Rule Versionだけを保持します。投稿・回答・Memory・Promptの本文は保持しません。

## 4. 実行した検証

- Database build / typecheck
- Database lint
- Database tests: 147 files / 466 tests passed
- Capability Social tests
- Migration RLS検査
- 別Service / Membership / Bunshinを拒否するRepositoryテスト
- 生成失敗日とLINE失敗日の除外テスト

## 5. 未解決事項

- 定期Projection Jobと対象Service Feature設定
- 本人へ確認する1問UI
- `CONFIRMED` / `DISMISSED`遷移と監査
- 無料支援の選択・実施・改善確認
- LINE以外の全体障害を統合するAvailability Projection

## 6. 次Phaseへ進める条件

Migrationを含むため、CIのDatabase Jobとレビュー完了後にマージします。その後H3として本人確認と無料支援を実装します。

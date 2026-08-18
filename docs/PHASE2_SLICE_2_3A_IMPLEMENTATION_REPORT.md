# Phase 2 Slice 2.3-A Core Persistence 実装報告

## 調査・変更

Bunshin固有Memoryのdomain型、application port/use case、Prisma model/migration/repositoryを追加した。全queryを`workspaceId + bunshinId`でscopeし、inactive/deleted Memoryを通常取得から除外する。

## 設計判断

- `workspaceId`を冗長保持してtenant境界を明示した。
- 削除は`active=false`と`deletedAt`を同時記録するsoft deleteとした。
- 作成元は`USER_INPUT`固定とした。
- confidenceとimportanceはapplication validationとDB CHECK制約の両方で保護した。
- embeddingはD-018に従いPhase 6まで追加しない。

## 対象外

API、UI、AI抽出、要約、embedding、pgvector、RAG、Mission連携、Capability、SOCIAL、LINE、BLOG、Jobは実装していない。

## Rollback

本番適用後はデータ退避を確認し、`bunshin_memories`、追加enumの順に削除するforward-fix migrationを作成する。適用済みmigrationを直接編集しない。

## 次の条件

lint、typecheck、unit、PostgreSQL integration、buildと人間レビューを完了する。API/UIはSlice 2.3-Bの別指示書承認後に開始する。

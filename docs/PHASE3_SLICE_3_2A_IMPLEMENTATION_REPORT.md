# Phase 3 Slice 3.2-A Content Pillar Core Persistence 実装報告

## 1. 実装範囲

Content Pillarのdomain型、validation、repository port、use case、Prisma永続化、migration、unit/integration testだけを実装した。API/UI、AI、Weekly Plan、Mission、Provider、Jobは実装していない。

## 2. 主要設計

- Content PillarはWorkspace/Bunshin scopeされたUUID resourceとした。
- titleはBunshin内で一意、weightは1..100の相対値とした。
- active状態とsoft deleteを分離し、deleted rowは通常read/mutationから除外した。
- mutationはACTIVE SOCIAL Assignmentと既存Bunshin管理policyを必須とした。
- Assignment停止中もactive Workspace Memberによるreadを許可した。
- 複合FKとDB CHECKでWorkspace不一致とweight範囲をDBでも拒否した。

## 3. 検証

- Prisma generate / validate
- format / lint / typecheck / unit / build
- 空PostgreSQLへの全migration適用
- PostgreSQL integration test
- tenant/Bunshin/Capability境界、重複、weight CHECK、soft delete冪等性

## 4. Rollback

本番適用後に戻す場合は参照導入前であることとデータ退避を確認し、外部キー、index、check、`content_pillars`を削除するforward-fix migrationを作る。適用済みmigrationは編集しない。

## 5. 次のSlice

本PRのreview/merge後、3.2-B authenticated API/UIのHTTP contractを別指示書で承認する。

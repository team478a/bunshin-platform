# Phase 3 Slice 3.3-A Weekly Plan Core Persistence 実装報告

## 1. 実装範囲

WeeklyPlan / WeeklyPlanItemのdomain型、validation、repository port、use case、Prisma永続化、migration、unit/integration testを実装した。API/UI、AI、Daily Mission、Provider、LINE、BLOG、Jobは実装していない。

## 2. 主要設計

- local calendar dateを厳密な`YYYY-MM-DD`として扱い、PostgreSQL DATEへ保存する。
- 週はIANA timezone snapshot上の月曜から日曜とした。
- 同一Bunshin/週は1 Plan、同一Plan/日は1 Itemに制限した。
- DRAFTだけを編集可能とし、confirm/expireを明示的かつ冪等な状態遷移とした。
- Itemとconfirmは同一Bunshinのactive Content Pillarを要求する。
- mutationはACTIVE SOCIAL Assignmentと既存Bunshin管理policyを必須とし、停止後もreadを許可する。

## 3. 検証

- Prisma generate / validate
- format / lint / typecheck / unit / build
- 空PostgreSQLへの全migration適用
- PostgreSQL integration test
- local DATE、状態遷移、tenant/Bunshin/Capability/Pillar境界

## 4. Rollback

本番適用後はデータ退避を行い、Item、Plan、enum、追加unique indexを削除するforward-fix migrationを作る。適用済みmigrationは編集しない。

## 5. 次のSlice

本PRのreview/merge後、3.3-B authenticated API/UIのHTTP contractを別指示書で承認する。

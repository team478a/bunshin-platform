# Phase 2 Slice 2.2-A Core Persistence 実装報告

## 調査・実装内容

Owner KnowledgeとBunshin Knowledge Grantを、default DENY、Workspace境界、監査可能な失効を維持するCore Persistenceとして追加した。

## 主要な設計判断

- Grant不在をDENYとし、ACTIVE Grantだけを通常取得する。
- revokeは物理削除せずREVOKEDと`revokedAt`を記録する。
- Knowledge archiveとACTIVE Grantの失効を同一transactionで行う。
- Cross Workspaceはrepository transactionで拒否し、複合一意制約で重複rowを防ぐ。
- sourceTypeは将来拡張用enumを持つが、本Sliceの作成経路はMANUALだけとする。

## 変更範囲

- platform-domain型
- application port/use case
- Prisma schema/migration/repository
- Coreテスト

API、UI、AI、embedding、import、file upload、Memory、Capability、SOCIAL、LINE、BLOG、Jobは追加していない。

## Rollback

本番適用前はmigrationを修正して再検証する。本番適用後はデータ退避を確認し、grant table、knowledge table、追加enumの順に落とすforward-fix migrationを作成する。適用済みmigrationを直接編集しない。

## 次のGate

lint、typecheck、unit test、PostgreSQL integration test、buildを完了し、本PRを人間がレビューする。認証済みAPI/UIはSlice 2.2-Bの別指示書承認後に開始する。

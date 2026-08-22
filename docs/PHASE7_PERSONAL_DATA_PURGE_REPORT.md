# Phase 7 Personal Data Purge Core 実装報告

更新日: 2026-08-22

## 完了範囲

- Auth削除成功後専用のApplication Use Case / Repository Port
- request、User、worker、未失効lease、SUSPENDED状態の再検証
- AuthIdentity、LINE Connection、通知設定、Deep Link stateの削除
- User email消去、固定displayName、DELETED化
- 全MembershipのREVOKED化
- Personal Workspace / Bunshin / Capabilityの停止・ARCHIVED化
- Personal Workspace内のObjective、Audience、Personality、Knowledge、Memory、Social Profile、Strategy、Plan、Mission Contentの匿名化
- Post URL、externalPostId、manualMetrics、Mission Activity metadataの消去
- Organization資産の非変更と本人所有資産の再BLOCKED
- purgeとAccountDeletionRequest COMPLETED確定の単一transaction

## 保持するデータ

監査整合性のため、匿名化済みUser IDへの参照、Legal Consent、AI usage、Job、配信・試行履歴等の非本文履歴は保持する。request summaryには削除・更新件数だけを保存する。

## 再実行と原子性

正しい有効leaseを持つPROCESSING requestだけを処理する。transaction途中の障害は全変更をrollbackする。COMPLETED後の再呼び出し、異なるUser、異なるworker、期限切れleaseは処理しない。

## 未接続範囲

本CoreはSupabase Auth Adapter、Scheduler、API、管理画面へまだ接続していない。このPRをdeployしても不可逆な自動退会処理は開始されない。

次のPR Dで、少量batch、Auth削除からpurgeへのorchestration、BLOCKED確認、理由付き再試行、dry-run、運用Runbookを実装する。

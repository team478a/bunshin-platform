# AI研修 Skill Lifecycle V1 Persistence 実装報告

日付: 2026-10-05（Asia/Tokyo）

状態: Code implemented / Production未反映

## 1. 調査した内容

- PR #1132で承認されたLifecycle設計
- PR #1134で承認されたPure ContractとRepository Port
- 既存AI研修のProgram / Assignment / Event境界
- Service管理Membership、Workspace / Service Isolation、PrismaのCAS・idempotency実装
- 隔離PostgreSQLのpreflightとintegration fixture cleanup

## 2. 変更した範囲

- `TrainingSupportSkill`: Workspace + Service + skill keyで所有する論理Skill
- `TrainingSupportSkillVersion`: 人間承認済みのimmutable version本文
- `TrainingSupportSkillActivation`: 採用・有効化・停止・rollback・revoke・廃止のappend-only監査
- additive migration、Prisma Repository、canonical SHA-256 digest計算
- rollback互換性snapshotをLifecycle Eventへ追加
- schema境界テストと実PostgreSQLテスト

API、UI、Job、LINE、Delivery、Exposure Event、Provider、外部API、課金は追加していない。

## 3. 主要な設計判断

- RepositoryはService行と管理Membershipをlockし、ACTIVEな`SERVICE_OWNER / SERVICE_ADMIN`をcommit前に再確認する。
- Program Template Versionが同じWorkspaceの同じService Programへ接続され、AI研修moduleであることを再確認する。
- Skill更新、version追加・状態変更、監査追加をSerializable Transactionへまとめ、revision CASとidempotencyで競合をfail-closedにする。
- Repositoryが保存projectionからdigestを再計算し、呼出側が渡したdigestを信頼しない。
- rollback互換性5軸は全てPASSEDの場合だけLifecycle Eventへ残し、UNKNOWN / BLOCKEDをDB制約でも拒否する。
- version本文はDB triggerで更新不可とし、監査行はappend-onlyとする。履歴を自動削除しない。
- 参加者回答、自由文、写真、Memory、User / Bunshin所有情報をRegistry本文へ保存しない。

## 4. 実行した検証

- Prisma schema format / validate
- capability-training typecheck / 89 tests
- database lint / typecheck / schema境界5 tests
- 使い捨てPostgreSQL 16へ全227 migrationを適用
- database integration 91 tests
- Service越境拒否
- 同時CASは1件だけ成功
- rollback全PASSED snapshot保存とUNKNOWN拒否
- 不正digest拒否
- version本文更新拒否

最終隔離DB run IDは`c78128244b93`。loopbackだけへ公開したtask専用コンテナを試験後に削除した。本番・共有DBは使用していない。

## 5. 未解決事項

- 管理者review / approve / activate / suspend / rollback API・UI
- Skill提示と`TRAINING_SUPPORT_SKILL_PRESENTED` Exposure Event
- Outcomeのread-only集計とPilot最小件数・期間
- 本番migration適用と本番確認

## 6. 次Phaseへ進める条件

本Persistence PRを人間が確認・承認した後、Admin Adoptionを独立PRで開始する。Delivery、Exposure、Provider、自動採用、自動rollback、自動改善は同PRへ混在させない。

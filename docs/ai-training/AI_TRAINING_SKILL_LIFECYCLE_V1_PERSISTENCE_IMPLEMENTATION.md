# AI研修 Skill Lifecycle V1 Persistence 実装報告

日付: 2026-10-05（Asia/Tokyo）

状態: Production reflected as part of Skill Lifecycle V1 release / Exposure Pilot default disabled

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

本Persistence PRでは、API、UI、Job、LINE、Delivery、Exposure Event、Provider、外部API、課金は追加していない。API / UIと限定Exposureは後続のPR #1136、#1137で追加した。

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

## 5. 実装時点の未解決事項と後続状況

- 管理者review / approve / activate / suspend / rollback API・UI: PR #1136で実装済み
- Skill提示と`TRAINING_SUPPORT_SKILL_PRESENTED` Exposure Event: PR #1137で限定Service Pilotとして実装済み
- Outcomeのread-only集計とPilot最小件数・期間
- 本番migration適用と本番確認: release PR #1138で完了

## 6. 次Phaseへ進める条件

Persistence、Admin Adoption、限定Exposure Pilotは、それぞれ独立PRで人間レビュー後にマージされ、本番へ反映された。Production commit `28782a5f27bd22a62f0e1f101330913a041a7844`でmigrationとschema readinessに成功し、公開healthとProduction Health Smokeも成功した。

Exposure Pilotは既定無効であり、Skillのapprove / activateだけでは参加者へ提示しない。次Phaseへ進むには、対象Service / Program / Mission、観測期間、最小件数、少数データの非表示条件、停止条件を人間が承認し、限定運用で十分な観測を得る必要がある。その後だけ、既存Eventを使うread-only Outcome Reviewを独立PRとして検討する。

Provider、外部AI実行、課金、自動採用、自動rollback、自動改善、共通Core化、ハッシーや他Packageへの横展開には進まない。

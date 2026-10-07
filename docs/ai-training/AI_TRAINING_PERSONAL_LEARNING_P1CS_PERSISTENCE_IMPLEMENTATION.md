# Personal Learning P1-C-S 永続化 実装報告

- 基準main SHA: `b7b99241204ba14fda9b6f54e8b297c26651767b`（#1148 merge、作業開始時にfetch済み）。
- branch: `feat/personal-learning-persistence-v1`
- 実装commit: `b099b156dc63555d9c84359def68ac2d38fd2ac0`。本報告のcommitは実装commitとは分ける。
- 範囲: server-internal Application Service / Prisma Repositoryと最小永続化。HTTP API、UI、既存Runtimeへの登録はない。保存・復元は認可済みサーバー呼出を前提とし、ログアウト後の実画面UXは未実装・未検証。
- 本番Migration適用、merge、deploy、backfill、人間によるDefinition承認は行っていない。隔離した使い捨てPostgreSQLでMigrationと保存処理を検証する。

## 調査・保存先の判断

既存`ProgramMemberGoal`をGoalの状態・本文の正本として維持する。`TrainingParticipantProfile`をP1-B projectionで読む。Enrollment / Assignment / Progressは既存Program Runtimeの実行正本のまま。Event payloadは操作事実であり、Planの正本にしない。既存モデルでは版固定Definition経路・Revision履歴・本人確認証跡・承認ゲートを独立して表せないため、次の3モデルだけを追加する。新package、汎用Memory、Chat履歴、Definition本文保存はない。

| 正本                             | 責務                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 既存 ProgramMemberGoal           | Goal本文・ACTIVE / ACHIEVED / PAUSED / CANCELLED。学習Goalと契約期間は別                                                             |
| PersonalLearningGoalConfirmation | 既存Goal IDへの一対一証跡。5軸scope、意味参照、Scope / Consultation Rule版、本人、server confirmedAt                                 |
| PersonalLearningPlanRevision     | `(planId, revision)`ごとの構造化経路。前Revision、変更理由、Goal証跡参照、版固定Definition参照、前提、選択理由code、status、確認日時 |
| LearningDefinitionApproval       | Serviceごとのcode-defined Definition版に対するDRAFT / REVIEWED / APPROVED / DEPRECATEDと人間の承認者・日時                           |
| 既存 ProgramActionEvent          | Goal confirmed / Plan created・confirmed・revisedの操作receiptとdigest。Plan本文・相談本文を入れない                                 |

Migration: `packages/database/prisma/migrations/20261006021000_personal_learning_persistence/migration.sql`。追加テーブル、複合scope FK / index / CHECKのみ。既存データの変更・削除・承認seedはない。3テーブルともRLSを有効にし、匿名・一般クライアント向け直接アクセスpolicyは付けない。Prisma schema-readinessの既存最新Migration定数も更新する。したがって将来deployする場合にはMigration適用順序のレビューが必要であり、未適用DBへこのコードだけを本番配備する承認ではない。

## Confirmation / Goal正本 / Primary Goal

保存時に本人と5軸scopeを検証し、DBの現在Profile、Goal、人間承認記録からP1-Dを再実行する。入力candidateKeyやクライアントが主張する承認参照を保存根拠にしない。`LEARNER_SELECTED_CANDIDATE`、意味版、Scope / Consultation Rule、Definition版の整合を再確認する。サーバー認証で解決したactorUserIdを渡す必要があり、この内部契約自体をHTTP認証tokenとは扱わない。

同Enrollmentに既存ACTIVE Goalがあれば、旧30日V1のGoalを含めてrejectする。暗黙の置換・取消・二重Primaryはない。明示replace UI / operationは今回未実装。旧Goal CANCELLED履歴は消さず、参照は現在のGoal状態を返す。Plan内は確認時のGoal参照snapshotであり、別途返す`goalActive`を現在状態の判断に使う。履歴中のsnapshotを新規実行認可へ流用しない。

## Definition Approval / version

P1-Cの3 review fixtureは未承認のまま。Migrationにも承認データを入れない。code-defined DefinitionのpackageKey + definitionKey + versionが完全一致し、同Workspace / GroupでAPPROVED、承認時刻が未来でなく、承認者が現在ACTIVEなSERVICE_OWNER / SERVICE_ADMINかつACTIVE Userの場合だけ新規保存・Plan確認で利用できる。

承認操作のHTTP API / UIは作らない。将来、人間レビューを実施した承認者を認証する管理手順が別途必要。Repositoryの承認読み取りは、その手順を代替しない。テストのAPPROVEDレコードは合成テスト値であり、本番fixture承認の証拠ではない。

DEPRECATED / 未承認は新規Plan・新Revision・確認で拒否する。過去Planは承認状態を再適用せず、保存した版固定参照を履歴として読む。将来V2を追加する場合も旧Definition版をPackage内で解決可能に保持する方針が必要。Definition Factory、版の自動生成・自動昇格はない。

## Plan / Revision / CAS / Idempotency

P1-CのDraft契約を正規化して保存し、本人のPlan確認は別operation。Confirmed Goalの存在とACTIVE状態をDBで確認する。stepsにはDefinition参照、前提参照、許可した選択理由codeだけを保存し、CoreへAI固有Skill名を追加しない。任意ruleVersion、未知Definition版、改変前提、教材本文など余分なfieldを拒否する。

Revisionはappend-onlyの経路履歴。既存経路本文を更新せず、確認・SUPERSEDEDへのstatus遷移だけを行う。`expectedRevision`と最新行を比較し、後続はrevision+1、previousRevisionは直前を要求する。既存Enrollmentの共通data lockとSerializable transactionで保存を直列化する。Plan headの別テーブルは不要とした。DBへ直接書く管理者権限の利用まで不変性を保証するtriggerではなく、公開Repositoryの書込規則である。

既存ProgramActionEventのService内unique idempotency keyを再利用し、PERSONAL_LEARNING prefixで名前空間を分ける。actor / Enrollment / operation / canonical SHA-256 digestを照合する。同一の再送は同じreceiptを返し、別操作・変更入力へのkey流用はreject。並行競合のP2002 / P2034はCONFLICTとして返す。利用側は同じkeyで再送可能だが、認可・期限・承認の再検証を迂回しない。Plan全体や相談本文をEventに保存しない。

## Tenant Boundary / Enrollment / V1

Workspace / Group(Service) / Enrollment / Membership / Userの5軸を複合FKとtransaction内照合で検証する。本人一致、ACTIVE participant / User / Group / Workspace、対象Service ProgramのAI_TRAINING_V1所属、書込時のACTIVE Enrollmentと開始・終了期間を確認する。別Serviceの承認でunlockしない。読取は履歴のためEnrollment終了後も許容するが、所属・User失効や全個人データ削除後は拒否する。

Plan COMPLETED / Goal ACHIEVEDはEnrollment終了ではない。Enrollment endsAtを習得済み状態へ投影しない。既存data lockのupdatedAt自己代入以外、Enrollmentの期間・状態は変更しない。Mission / Assignment / LINE / 評価 / Profile / 旧30日V1の選定・実行処理は変更せず、既存ユーザーへの自動Plan作成・backfillはない。

## Privacy / Audit / Export・削除

相談全文、自由会話、個別業務相談、教材本文、個別例・練習・Hint・回答、Provider responseは保存しない。意味参照、固定版の経路、code化した理由、本人確認証跡だけ。企業管理者画面や汎用Bunshin Memoryへの公開もない。

本人向け既存Exportに、データが存在する場合だけ`personalLearning`を追加し、既存のrow / byte上限に含める。旧V1でデータがない場合の出力shapeは維持する。既存のGoal削除・retention purgeにFK CASCADEで確認証跡とPlan Revisionを連動させ、全削除Audit後は再保存を拒否する。部分回答削除を全削除とは扱わない。既存Eventは操作事実を記録し、既存個人データ削除の対象でもある。独立のAudit基盤やPlan正本payloadは作らない。

Goal replace / cancellation、Plan invalidateの新しい操作入口は未実装。今回の保存操作とRevisionによるsupersessionを記録し、将来の明示操作追加時に既存Auditへ事実を追記する。

## 変更ファイル

- `docs/DECISION_LOG.md`、本報告。
- `packages/application/src/personal-learning-persistence.ts`、公開`index.ts`、Application境界unit test。
- `packages/database/prisma/schema.prisma`、上記Migration。
- `packages/database/src/personal-learning-persistence.ts`、公開`index.ts`、`schema-readiness.ts`。
- `packages/database/test/personal-learning-persistence.integration-cases.ts`、既存integration登録。
- `packages/capability-training/src/personal-data-export.ts`、Database側Export adapter・既存Export mock更新。

## 検証

専用Docker PostgreSQL 16、loopback接続、合成User / Service / Enrollmentのみを使う。専用container labelとDB live markerを確認し、既存integrationのDB名・live marker preflightを通過してからfixture cleanupを実施した。一般ローカルDB・本番DBには接続していない。テストDBの承認は合成値のみ。

- Prisma schema validate成功。最終SQLを含む228 Migrationを新規隔離DBへ適用成功。3新規テーブルのRLS enabledとMigration finishedを実SQLで確認。
- Application: 130 files / 796 tests成功（P1-A/B/C/Dを含む）。
- capability-training: 20 files / 240 tests成功。
- database unit: 187 files / 838 tests成功（schema-readiness / 新規テーブルRLS / 既存Exportを含む）。
- PostgreSQL integration: 108 tests成功。最終実行は`vitest run test/database.integration.test.ts --testTimeout 30000`。既存3ケースがローカル並行検証中に5秒でタイムアウトしたため、実行時だけ30秒へ変更して再検証した。テストassertionやCIのtimeoutは変更していない。
- architecture check成功、architecture否定テスト10件成功。
- repository全体format:check成功、git diff --check成功。
- 関連3 packageの`tsc --noEmit` typecheck、lint、buildすべて成功。rootの全package typecheck / lint / test / Web buildではなく、変更に関係する3 packageの検証結果である。

開発中にはfixtureの既存DB CHECK不足、Promise拒否assertion、テスト後片付け、Migration RLS / 最新Migration定数の不足を修正した。一時parse errorと未使用importを解消後、最終固定版でlintを再実行し成功した。WindowsのDB統合テストと同時のPrisma generateではDLL rename EPERMが発生したため、統合テスト終了後にbuildを再実行し成功した。これら失敗した試行を成功の証拠にはしない。検証後は専用container / networkをidentityとtask labelで確認して削除済み。削除したのは再生成可能な合成テストデータだけであり、他のDBや元のdirty checkoutは変更していない。

新規16 DBケース: Goal保存・再送 / ACTIVE拒否 / Draft保存・別確認 / Revision履歴・stale CAS / 同時Revision競合 / key流用拒否 / 未承認・偽候補拒否 / deprecated新規拒否と履歴読取 / 5軸read-write拒否 / 本文非保存・Export・V1非変更 / 人間承認者失効・未来承認拒否 / CANCELLED Goal・COMPLETED PlanとEnrollment分離 / 既存legacy ACTIVE Goal保持 / 所属失効・期限・全削除後の再作成拒否。

Application境界4ケース: 本人read委譲、他人拒否、自由文operation key拒否、異常Plan拒否。P1-A/B/C/D、Training Profile / Program Goalを含む既存Application、capability-training、database unit / PostgreSQL integrationを回帰対象とする。

## 未実装 / P1-Eへの引継ぎ / 停止条件

UI / HTTP API / 認証入口組立、実ログアウト後の画面復元、Goal明示replace、Plan完了・invalidate操作、Definition承認管理手順、承認者認証UIは未実装。保存・復元用Service / Repositoryまでで停止する。

P1-E開始には本PRの人間レビュー、Definitionの実人間承認、利用入口での認証・所属解決、Migration適用計画の承認が必要。Router / Runtime / Assignment / Teaching / Content / Definition Factory / Codexへは未着手。承認済みPlanが存在しても自動実行しない。

## Rollback

未接続なのでまず利用入口を追加せず本PRをrevertできる。本番へ将来適用した場合、機能入口を停止してコードrollbackをレビューする。追加テーブルを即DROPせず、既存Goal正本と確認・Plan履歴を保持し、schema-readinessとの整合を別途確認する。データ削除やdown migrationを本報告の自動手順にしない。今回の隔離DBは合成データのみで、検証後に専用container / networkを削除する。

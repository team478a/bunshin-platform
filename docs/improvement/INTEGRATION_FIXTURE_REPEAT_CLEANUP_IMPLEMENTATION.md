# DB統合fixture: 同一使い捨てDBでの連続実行

## 結論と範囲

2026-10-03 Asia/Tokyo、最新main `6900fb29bb62d1bb20a0df491dc3246dd0b4877d`（PR #1101 merge）を基準に、既存DB統合試験の2回目の前処理失敗を再現した。受講関連fixtureの削除漏れと、Weekly Planより先にSNS戦略を削除する順序をテスト専用コードで修正した。最終状態では**同じ使い捨てDBを再作成せず、別プロセスで2回連続87件成功**した。

変更はテスト3ファイルと本報告/ロードマップのみ。本番アプリ、Repository、schema/migration、依存/lockfile、CI/CD、本番設定は変更しない。既存の環境/URL/run ID/live DB marker preflightを維持し、制約無効化、TRUNCATE、skip、期待失敗指定は追加しない。これは現行fixtureの再実行可能性の確認であり、本番削除機能や実認証E2Eの安全性を証明するものではない。

## 調査と削除順序

`database.integration.test.ts` の既存beforeAllと実fixture、Prisma schemaに加え、program foundation/goals/runtime trackingとtraining関連migrationの外部キーを確認した。Prisma relationの記載だけでは判断せず、使い捨てPostgreSQLの制約もread-onlyで照合した。

テスト専用 `cleanupProgramFixtures` はlive preflight後、GroupMembership削除前に呼ぶ。

1. TrainingToolkitItem、TrainingMissionAnswer、TrainingParticipantProfile、TrainingDataRetentionState。
2. ProgramActionEvent、ProgramProgressSnapshot、ProgramMissionAssignment。
3. ProgramMemberGoal、ProgramMemberPreference、ProgramEnrollment。
4. ProgramOffering、ServiceProgramSupportPolicy、ProgramGoalDefinition、ServiceProgram、ProgramTemplateVersion、ProgramTemplate、ProgramAuditLog。

イベント/進捗→割当→受講、受講→参加者のRESTRICT制約を守る。FKのない研修回答/プロフィール/Toolkitも明示削除し、cascade任せの孤立データ残存を避ける。既存のWeeklyPlanItem→WeeklyPlan削除の後へSocialAccountStrategy削除を移動し、`weekly_plans_workspace_id_bunshin_id_strategy_id_fkey`を守る。

helper単体試験は17モデルの順序、空状態での再実行、子削除失敗の伝播と親削除停止を確認する。実DB試験に6モデルの残存0件確認を追加した。全テーブルの汎用リセットではなく、現在の試験fixtureで確認した依存関係に限定する。将来fixture追加時は削除順序と連続実行を再確認する。

## 今回の実行結果

Windows / Node24.21.0 / pnpm10.10.0 / Vitest4.1.11 / Docker29.8.0 / cached PostgreSQL16。run ID `b71a09c2f6e8`、DB `bunshin_disposable_b71a09c2f6e8`。task専用container/network、127.0.0.1:18998へのloopback公開、合成資格情報とデータのみ。host bind mount/共有volumeなし。既存226 migrationをこの一時DBへ適用した。

| 状態                                  | 開始 JST | 結果                                                                                                                      |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 未変更main、1回目                     | 21:10:21 | 86件成功、34.37秒                                                                                                         |
| 未変更main、同じDBの2回目             | 21:10:56 | beforeAllが`program_enrollments_membership_fkey`で失敗。独立auth suiteの2件成功、84件未実行（runner表示skipped）、11.67秒 |
| program cleanup追加、戦略順序は旧状態 | 21:11:51 | beforeAllが`weekly_plans_workspace_id_bunshin_id_strategy_id_fkey`で失敗。2件成功、85件未実行、15.51秒                    |
| 最終削除順序、連続1回目               | 21:12:33 | 87件成功、38.36秒                                                                                                         |
| 同じDB・新プロセス、連続2回目         | 21:13:13 | 87件成功、36.07秒                                                                                                         |

失敗後もDBを初期化し直さず、最終連続実行で前回fixtureを削除して再生成した。途中失敗を隠さず、試験のassertionを弱めない。追加helperと既存preflight単体は2ファイル40件成功（最終21:14:17）。初回lintはmockメソッド参照のunbound-method指摘で失敗し、親削除がイベント列にないことを直接assertする形へ修正した。

## 再実行と検証コマンド

一時DBの作成・既存migration・comment・process限定env・識別確認は前回の`INTEGRATION_DATABASE_PREFLIGHT_IMPLEMENTATION.md`の手順に従う。ただし今回の連続試験では、**同一runの専用使い捨てDB内に限って2回目を実行**し、間でDB/volume/fixtureを手動初期化しない。前回報告の「以前の作業DBを使わない」という隔離要件は維持する。

```text
pnpm --filter @bunshin/database test:integration
pnpm --filter @bunshin/database exec vitest run test/database.integration.test.ts
pnpm --filter @bunshin/database exec vitest run test/program-fixture-cleanup.test.ts test/integration-database-preflight.test.ts
pnpm --filter @bunshin/database exec tsc --noEmit
pnpm --filter @bunshin/database exec eslint test/program-fixture-cleanup.ts test/program-fixture-cleanup.test.ts test/database.integration.test.ts
pnpm architecture:check
git diff --check
```

今回は最初のmain実行でpackage scriptによるPrisma generateを確認し、最終2回は生成済みclientで上記vitestコマンドを別プロセスで続けて実行した。1回目が非zeroなら2回目へ進まない。変更ファイルにはPrettierも適用・確認する。全体verify/database CIの結果は作成PRの最新headで別途確認し、過去headの成功を流用しない。

検証終了後、専用container/networkの完全IDとtask labelを照合して当該containerだけstopし、`--rm`により合成DB/匿名volumeを除去した。専用networkも除去し、task labelの残存なしを確認した。共有pruneや他container停止はしていない。この使い捨て試験データは復元対象ではない。

## 未完と次の最小タスク

今回のゴールは現行DB統合fixtureの2回連続成功まで。実Supabase Auth＋実Next＋実DB＋browser E2E、スマートフォン、本番migration/worker停止・drain・backup/復元後再削除のgateは未完で、本番NO-GOを維持する。

次は`IMPROVEMENT_FEEDBACK_E2E_READINESS.md`に従い、**ローカル実Auth runtimeの取得・合成アカウント・ネットワーク制限の実行条件を承認確認すること**。認証bypassやfake sessionを実認証E2Eとして扱わない。今回、実API課金、画像/動画/音声生成、Storage/LINE/SNS、本番DB/資格情報、merge/deployは実施しない。切り戻しはテスト/helperと文書のみで可能だが、元の連続実行失敗が戻る。

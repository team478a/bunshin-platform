# 人手Candidate保存・保持・削除 — 内部Repository V1

## 結論・承認・調査基準

2026-10-03 Asia/Tokyo、最新main `4d9bfaa1d2316a62b11cee71726e2f9228903648`（PR #1091 merge後）、ブランチ `codex/improvement-triage-persistence`。Windows / Node24.21.0 / pnpm10.10.0。別checkoutの未コミット変更には触れていない。

ユーザーへ原本受付90日、候補週終了90日、最小監査操作180日、本人削除/退会完了時の原本削除・候補失効・監査本人参照除去、組織所有の手動確認維持を提示し、「進めてください」と承認を受けた。サーバー内の方針版は `feedback-retention-v1`。これは運用方針の承認であり法的適合性の判定・本番適用・自動実装承認ではない。既存設計文書の「未承認」は過去時点の記録として残す。

追加はCandidate/最小操作監査2表、migration、内部Repository・限定purge、既存退会完了連携、対象テスト。**HTTP/UIへの書込接続、実装承認、STALE再開、定期purgeスケジューラは追加していない**。管理ページは読み取り専用のまま。実API、Storage、秘密情報、本番DB、実生成/配信、merge/deployは使用しない。

## 保存・実行経路

- `PrismaImprovementFeedbackTriageRepository` はclientとtrustedな全6要素scopeを必須注入。既存 `ReviewImprovementFeedbackCandidate` がそのPortを使い、同Service OWNER/ADMIN、現行User/Workspace/Serviceと設定を再確認する。
- Transaction内の同Service行 `FOR UPDATE` が原本変更triggerと共通の直列境界。管理Membership/User/Workspace/ServiceConfiguration行を `FOR SHARE` で保持し、失効処理とのcommit順序を固定する。ReadCommittedの各読取はロック取得後の現在状態。待機上限10秒、Transaction20秒。deadlock/timeoutを隠さずrollbackし、利用者の判断を自動再実行しない。
- 現行Observation AdapterはPrisma TransactionClientも受け入れ、同じTransactionで実Evidence Use Caseを使う。限定select/所有照合/limit+1/認可/UNKNOWN分類を維持。期限超過原本はpurge前でも `createdAt > now - 90日` で除外。
- 内部 `createCandidate` は完了JST月曜週・12週内・全bucket5人以上・COMPLETE・要確認bucketだけ。原本ID/本文/素材/count/報告者を候補へ複製しない。同scope/cluster一意、既存候補の同一根拠再取得で期限を延長しない。STALEは競合とし再開しない。
- 確認/対象外はOPENだけ。CASとoperation UUID・固定action/reason・結果CAS/state・時刻・期限の最小auditを単一Transactionで保存。監査失敗ならCASもrollback。DB整数上限前で拒否する。後続更新/失効/根拠変更後の再送は旧receiptを適用しない。
- CHECKとFKで固定週、90/180日、状態/理由/版、Service/Workspace対応を制約。監査候補参照の全6要素scope一致はDB triggerでも検証。候補purge時はauditのcandidateIdをNULLにし、古いIDをreceipt JSON等へ複製しない。

## 原本変更・削除・保持

進行中の`record()`は保存前の認可だけでは退会後INSERTを防げないため、DB INSERT triggerでも現行ACTIVE本人・自Bunshin/Service/Workspaceをロック付きで再確認する。既にDELETED/ARCHIVEDの所有範囲への再INSERTは拒否。先にINSERTが成立した場合は退会側を待機させ、後の削除commitでその原本も消去する。認可前読取と保存の間の退会を「常に先の認可が有効」としない。

migrationは既にDELETEDになっているUserのactor/実所有Feedbackだけを除去する。trigger導入前の削除漏れを残さないためで、組織資産自体は削除しない。原本actor/Bunshinの索引も加える。このcleanupは隔離CIで実行するが、本番の件数・時間は未確認なので本番migration承認前に負荷確認が必要。90日超の全既存原本の物理削除はmigration内で一括実行せず、bounded purgeの運用接続で扱う。

| 起点                              | 実装した境界                                                                                      | 留意点                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Feedback INSERT/UPDATE/DELETE     | BEFORE triggerでService lock、対象週の候補をSTALE化/CAS更新、両Evidence hashをNULL                | 直接SQL・cascadeでも同Transaction。個人由来hash/旧原本IDを監査へ複製しない       |
| Bunshin所有/Workspace/Service変更 | 旧原本stampの対象週を同様に失効                                                                   | 原本読取で所有不一致も拒否。状態変更だけでは履歴所有を移動しない                 |
| Bunshin物理削除                   | 原本cascadeが上記triggerを実行                                                                    | source link表は追加しない                                                        |
| 退会完了                          | 既存lease・組織安全条件の後、同txでactor又は実所有BunshinのFeedback削除、本人audit actor NULL     | User soft deleteだけで完了としない。ORGANIZATION所有は既存MANUAL_REVIEW_REQUIRED |
| User DELETED/物理削除             | DB triggerでもactor原本削除・audit actor NULL                                                     | SUSPENDED/単なるService所属退会では原本を自動削除しない                          |
| Service/Workspace物理削除         | Service削除triggerで原本削除、新表はGroup複合FKcascade                                            | 別Serviceを移動/継承しない。Workspace削除は既存FK/組織保護が許可した場合だけ     |
| 期限到達                          | 原本読取/既存原本再送/候補操作で拒否。内部purgeでscope限定・表ごと最大100（上限1000）件を同tx削除 | `possiblyMore` は上限到達の保守的通知。新実行で再開。purge失敗は全rollback       |

原本の90日後purgeはsubmissionKeyも消す。**purge後に同UUIDを新しい投稿として送ることを永久に拒否する台帳は作っていない**。期限内再送の保証と無期限の重複抑止を混同しない。候補は12週超で作成/操作不可なので90日purge後の旧週候補を再作成しない。

Candidateのscope/週/clusterRefは個人原本コピーではないが、再識別防止の保証ではない。アクセス制限と期限を維持する。監査actorを消しても、scopeと時刻等の残存記録を完全匿名とは呼ばない。

## 検証・再実行

```text
pnpm --filter @bunshin/database exec vitest run test/improvement-feedback.test.ts test/improvement-feedback-observation-adapter.test.ts test/improvement-feedback-retention.test.ts test/account-deletion-purge-module-boundary.test.ts
pnpm --filter @bunshin/database exec tsc --noEmit
pnpm --filter @bunshin/database exec eslint src/improvement-feedback-triage.ts src/improvement-feedback-retention.ts src/improvement-feedback-observation-adapter.ts src/improvement-feedback.ts src/account-deletion-purge.ts test/improvement-triage.integration-cases.ts test/improvement-feedback-retention.test.ts test/improvement-feedback.test.ts test/database.integration.test.ts
pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-triage.test.ts test/improvement-feedback-review-evidence.test.ts test/improvement-engine.test.ts
pnpm architecture:check
git diff --check
```

初回ローカル4ファイル45件成功、scope/時計のawait中変更を固定するテスト追加後は46件（新規9件含む）。Application回帰3ファイル103件も成功。型チェックでfixtureの不存在MEMBER roleとEvidence rootの不存在sourceRefsを検出し、実PARTICIPANT・bucket sourceRefsへ修正。初回lintのrequire-await/unsafe reflection returnも修正後に成功。最終型/lint/全体CI・実DB結果は最新headのPR検証欄に記録する。

初回CI head `c69cc28e66ca9997ab053690b6ebf1ef0ce755aa` の隔離DBは66成功/3失敗＋未処理拒否1件。fixtureがREVOKEDのrevokedAtとBLOCKED→PROCESSINGのblockedReason消去を欠き、既存DB CHECKが正しく拒否した。これに伴い失効barrierにも到達しなかった。fixtureを実状態契約へ合わせ、失敗時もbarrier解除と並行Promise回収を行う。安全assertion/DB制約は緩めず、skip/期待失敗にしない。旧headの成功ケースだけを最新headの検証完了とは扱わない。

ローカルDocker daemonは未起動。実DB試験をローカル成功として報告しない。通常CIは隔離PostgreSQL16にmigrationを適用し、既存 `pnpm test:integration` が `database.integration.test.ts` から `registerImprovementTriageIntegrationCases` を実行する。既存環境guardを変更していない。テストは合成User/素材なし・fetch guard付き。テスト専用障害triggerはfinallyで復元し、本番へ入れない。

実DBケースは、正常/新インスタンス再送、一勝者CAS、直接原本削除・INSERT/UPDATE・所有移動・Bunshin cascade、Service削除と別Service保存、全scope/役割拒否、削除前後の順序・所属失効の行lock、監査INSERT故障rollback、PERSONAL退会・ORGANIZATION保護・soft DELETED、期限前後/上限batch/再実行、purge途中故障rollback、少数/不完全/当週拒否、CHECK/FK/scope制約。競合はbarrierと実 `pg_blocking_pids` を使い、sleepに依存しない。組織資産の承認済み削除フロー全体、Workspace全cascade、本番E2Eをこの範囲で検証済みとはしない。

## 残条件・切り戻し

次の最小タスクは既存Jobによるscope限定purgeの配信/lease/完了判定を接続し、遅延・再送・期限処理を検証すること。**現時点では定期物理削除を運用保証しない**。保持を守って本番公開するにはこの接続、監視、承認済みmigration適用と既存バックアップ保持/復元時削除再適用の運用確認が必要。UI書込口の前にopaque handle/CSRF/失効/情報非露出も別PRで検証する。

本番負荷（原本row triggerとService直列化）、大量削除の時間/ロック、全テナント運用、ログ/backupのコピー保持は未確認。新Worker/キューは作らない。rollbackは書込接続を止めRepository/exportを戻す。既存Feedback・退会の削除保護を安易に戻さず、DB追加表/triggerの削除は別の承認済みmigrationと検証で扱う。今回本番migration・drop・デプロイは実行しない。

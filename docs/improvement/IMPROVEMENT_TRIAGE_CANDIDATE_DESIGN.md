# 本人Feedbackの人手確認候補 — 最小保存・Revision・削除設計

## 1. 結論・状態・基準

推奨は、**自己申告の人手トリアージ候補だけを独立保存し、改善Issueや実装承認へ自動昇格させない**構成。最初の実装PRは純粋な契約・状態/Revision検証とfakeによる否定テストに限定する。保持・削除・失効条件のレビュー前にschemaや書込口を公開しない。

本書は設計案であり、Candidate保存・トリアージ更新・承認・削除の実装完了を意味しない。2026-10-03 Asia/Tokyo、PR #1089のmergeをGitHubで確認。最新origin/main/調査SHAは`f50f1ee5d58f02f0e9abfc309f8de31f405e963d`。ブランチ`codex/improvement-triage-candidate-design`。Windows、Node 24.21.0、pnpm 10.10.0。既存の別checkoutの変更を取り込まず、専用のクリーンな管理worktreeを使う。

今回は設計文書だけを変更する。アプリ、テスト、DB schema/migration、依存/lockfile、CI/CD、設定は変更しない。本番DB・秘密情報・実ユーザー素材は参照せず、Provider/実生成/LINE/merge/deployを実行しない。本番適用状況は未確認。

## 2. 実コードの監査と再利用

| 現在の実体・根拠                                                                                                          | 確認した挙動                                                                                                                                         | 再利用・不足                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/platform-domain/src/improvement-engine.ts` `canTransitionImprovementIssue` / `isImprovementInstructionEligible` | Issueの合法遷移と同scope・Candidate/Evidence Revision一致の純粋判定                                                                                  | DB認可、保存、失効処理ではない。Candidateの確認済みをAPPROVEDへ接続しない                                                                 |
| `packages/application/src/improvement-feedback-review-evidence.ts` `BuildImprovementFeedbackReviewEvidence.execute`       | scope/版/期間/selectionからclusterRef、原本ID/時刻/User/Bunshin/完全性からbucket Revisionと全体Revision。UNKNOWN/自己申告、3報告/2人の仮の確認ルール | 原本を再読取し既存集約を使う。決定的hashは署名/匿名化/現在権限の証明ではない                                                              |
| `packages/database/src/improvement-feedback-observation-adapter.ts` `readObservations` / `reviewEvidence`                 | 同Service ACTIVE owner/admin、User/Group/Workspace有効性、Bunshin所有対応、半開期間、limit+1。読取はRepeatableRead Transaction                       | 読取Transactionの後でEvidence hashを生成する現状。別Transactionでの候補保存との原子性はない。共有txを扱う最小Repository境界が将来必要     |
| `apps/web/src/services/improvement-feedback-admin-preview.ts` / `improvement-feedback-admin-data.ts`                      | 完了済みJST週12窓、各bucket5人未満なら全体抑制、PARTIAL/UNKNOWN非開示、原本参照/Revisionをprojectionで除く                                           | 開示条件を緩めず再検証する。将来UIへraw hashをhidden inputで渡さない                                                                      |
| `packages/database/prisma/schema.prisma:6374` `ImprovementFeedback`                                                       | 限定コード、actor/Service/Package/Bunshinのstamp、送信UUID、日時。Bunshin複合FKはonDelete Cascade、User/Serviceの専用FKはない                        | 専用原本を複製しない。Bunshin物理削除と、退会処理を混同しない                                                                             |
| `packages/database/src/account-deletion-purge.ts` `PrismaAccountDeletionPurgeRepository.completeAfterAuthDeletion`        | PERSONAL Bunshinは物理削除ではなくARCHIVED/内容消去。UserもDELETEDに更新。ORGANIZATION所有データはMANUAL_REVIEW_REQUIRED                             | **Feedbackの明示削除/匿名化とCandidate失効は確認できない**。cascadeだけで退会時削除済みとは判定しない。後続保存の前提として削除連携が必要 |
| `packages/database/src/social-activity-oem-support-candidates.ts` `projectSocialActivityOemSupportCandidates`             | 完了した個別支援介入＋確認済みBarrierをOEM支援へ投影                                                                                                 | 自己申告の改善候補とは目的/所有範囲/根拠が異なる。保存先や一括Jobを流用しない                                                             |
| `packages/database/src/admin-audit-log.ts` `PrismaAdminAuditLogRepository.list`                                           | Platform Admin向け既存監査の横断一覧                                                                                                                 | Service管理権限の代替にはしない。共通ログへraw Evidence/個人報告を投入しない                                                              |

package公開入口の`improvement-engine`、`improvement-feedback-review-evidence`、Adapter exportsを利用する。共通domain/ApplicationにPrisma、React、ブランド、Providerを混ぜない。既存の3報告/2人ルールとWebの5人開示基準は別の仮値のまま。

## 3. 候補の単位と最小契約（未実装）

初回はSOCIAL/TROUBLE_FEEDBACKのService全体・完了済み週・選択コードbucketだけ。SUBJECT、任意期間、複数Adapter、自由文、写真/Memoryは対象外。EngineがREVIEW_REQUIREDでも画面の週全体開示がSUPPRESSED/INCOMPLETEなら、通常管理者の候補作成/更新口を許可しない。隠れたbucketの存在や件数を操作結果から漏らさない。

```typescript
// 設計例。実際の型・DB列は後続PRで確定する。
type TriageCandidate = {
  id: string; // 無作為opaque ID。clusterRefや原本IDをURLにしない
  scope: ImprovementScope; // trusted resolver正本、全要素を固定
  period: { fromInclusive: Date; toExclusive: Date }; // JST完了週
  labels: { category: string; surface: string; impact: string }; // 既知codeだけ
  adapterVersion: string;
  ruleVersion: string;
  disclosurePolicyVersion: string;
  clusterRef: string; // 内部だけ
  windowEvidenceRevision: string | null; // 週全体の開示変化も検知
  bucketEvidenceRevision: string | null;
  candidateRevision: number; // 単調増加CAS版、hashと別物
  state: 'OPEN' | 'REVIEWED' | 'DISMISSED' | 'STALE';
  staleReason: 'SOURCE_CHANGED' | 'SOURCE_REMOVED' | 'READ_INCOMPLETE' | 'POLICY_CHANGED' | null;
  reasonCode: string | null; // 固定選択。個人を記載する自由文なし
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  retentionPolicyVersion: string;
};
type CandidateSourceLink = {
  candidateId: string;
  feedbackId: string | null; // 原本参照。本文/actor/Bunshin stampを複製しない
  missing: boolean; // 削除後の根拠欠損。元のIDを別JSONへ残さない
};
type TriageMutation = {
  actorUserId: string;
  scope: ImprovementScope; // caller session正本
  candidateId: string;
  expectedCandidateRevision: number;
  expectedWindowEvidenceRevision: string;
  expectedBucketEvidenceRevision: string;
  action: 'MARK_REVIEWED' | 'DISMISS';
  reasonCode: string;
  operationKey: string; // UUID。同一通信再送のキー。RevisionやJob番号ではない
};
```

初回Portは認可済みサーバー内部に限定し、上のRevisionをHTTP入力へ公開しない。将来UIを接続する際は、管理者・scope・Candidate/両Evidence版・期限に束縛した短寿命opaque確認handleを設計する。生hashのhidden input、scope/actorのクライアント指定、hashだけの認可は不可。handle保存/封印方式はUI PRで比較して決定し、今回は新token基盤を先行しない。

保存候補はCandidate、source link、限定操作auditの最大3種。業務列を原本JSONへ押し込まず、Workspace/Service/environment/Package/Adapter/固定週/code/版をDB制約とRepositoryで整合させる。同scope＋clusterRefに一意制約、source linkも重複排除。環境や規則版を跨ぐ同一視は禁止。既存source IDのFKだけでscope一致が保証されるとは考えず、JOINと所有検証を必須にする。

原本IDリンクは内部のみ必要最小限で持つ。原本削除をRestrict FKで止めない。nullable FKのSET NULL等を候補として比較し、削除後の欠損と失効を保持する。FK作用だけではCandidateのRevision/承認失効を実装できない。count/person数/旧source ID/旧Evidence JSONをauditへ複製しない。画面の数値は再集計して現行開示方針を通す。

## 4. 状態・認可・再送・競合

```text
OPEN ──人の確認──> REVIEWED
  └──対象外理由──> DISMISSED
OPEN/REVIEWED/DISMISSED ──根拠/方針変更・削除──> STALE
STALE ──新しい根拠を再確認──> OPEN（旧判断は適用しない）
期限到達 ──全操作拒否──> purge対象（期限を再送で延長しない）
```

REVIEWEDは「人が見た」だけで、TRIAGED/BUG/APPROVED/解決済みではない。DISMISSEDも誤報認定ではなく固定理由付きの確認終了。確定Issue/改善提案の別契約や承認は後続判断。最初のPortからCodex/LLM、実装指示、通知を呼ばない。

1. 入力を限定検証し、trusted session/resolverからscopeを固定。DBでもACTIVE owner/admin・User・Group・Workspaceを照合する。idempotent再送を返す前にも認可する。暗黙本部横断・CONTENT_EDITOR・本人Bunshin権限による管理操作は拒否。
2. 固定窓の全原本を既存契約で再集計し、完全性・所有対応・表示方針・対象bucketを照合する。Candidate CAS版と**週全体/対象bucket双方**のEvidence版が期待値と一致しなければCONFLICT。古い画面の判断を新しい根拠へ自動適用しない。
3. 認可再確認・原本読取・Candidate CAS更新・操作auditを単一Repository Transactionにする。既存Adapterを外から2回呼ぶだけではTOCTOUは解決しない。共通tx read helperを最小分離する候補を検討し、限定select/認可条件を弱めない。
4. 元のRepeatableReadだけで並行削除/所属失効/phantomが解決するとは主張しない。保存/原本削除・保持purgeは共通のscope/Candidate lock順序、所属変更とのrow lock、Serializable/CASと競合再検証を設計する。削除が保存後にcommitした場合も同txで候補をSTALEへする。直接DB削除など連携外変更は毎読取/操作の再集計で検出して拒否する。全変更経路が列挙できなければ永続化を公開しない。
5. 同operationKey＋同内容なら元の結果。同keyでscope/action/版/理由変更はCONFLICT。監査とCandidate更新の片方だけ成功させない。通信応答喪失後の照合を可能にし、並行管理者の二重操作はCASで1件だけ成立。競合再試行は上限を持ち、ユーザーの判断を自動再実行しない。

Service停止/管理者失効は過去の閲覧権限を保証しない。通常の所属退会と、個人情報削除要求は区別する。期限、原本欠損、方針版不一致、完全性不明は拒否/保留で、過去countsを0や成功へ補完しない。

将来の実装承認は別操作。actorの現行権限・Candidate revision・両Evidence版・承認取消/期限・保持期限・削除状態を保存/利用の双方で再検証し、既存`isImprovementInstructionEligible`は最後の純粋な一条件として使う。REVIEWEDから自動的にAPPROVEDへ遷移しない。承認があってもコードの自動実行許可にはならない。

## 5. 保持・削除の案と実装ゲート

**未承認の運用提案値**: Feedback原本は受付から90日、Candidateは対象週終了から90日（保存/再送/確認で延長なし）、限定auditは操作から180日。数値は法的要件や既存の合意済み仕様ではない。責任者の方針レビューと既存法務/運用文書との整合確認後に版を固定する。保存方針を決めるまで新しい保存機能を公開しない。

| 起点                        | 最小の処理案・安全条件                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本人削除要求/退会完了       | actorUserIdまたは実所有Bunshinの対象Feedbackをscope正本で抽出し削除。関連source linkを消去/欠損化、両Evidence hashを消去しCandidate版を更新・STALE。他人の原本を削除しない。Userのsoft deleteだけで完了しない |
| Bunshin物理削除             | 原本cascadeに合わせてCandidate失効。source linkの旧ID・counts・hashをaudit/JSONに残さない。SET NULLのみで成功扱いにしない                                                                                     |
| 期限purge                   | 期限超過の原本/候補は読取段階でも無効。purge実行の遅れで復活しない。再実行・lease切れ・部分失敗は既存Job境界で再開し、新Worker/キューは追加しない                                                             |
| Service/Workspace消滅・停止 | 越境移動や本部への自動継承なし。削除時の候補/参照/audit処理とFK方針をmigration前に確定。停止だけなら通常認可で拒否                                                                                            |
| 操作者自身の削除            | 限定auditのactor参照も削除/非識別化。displayName/emailコピーなし。現行User soft deleteなのでFK SET NULLだけで対応済みとしない                                                                                 |
| 原本削除との競合・障害      | 失効/purgeと原本処理を同tx、または削除未完了をBLOCKEDで再試行。古い確認/承認を利用不可にする。閉鎖状態だけを更新して原本削除失敗を隠さない                                                                    |
| バックアップ・ログ・既存Job | DB削除だけで全コピー即時消滅とは保証しない。保存期間、復旧時の削除再適用、アクセス制限を運用確認する。ここでは本番ログ/バックアップを調査しない                                                               |

既存退会処理はORGANIZATION所有をmanual reviewで止める。この保護を勝手に迂回しない。Serviceだけの退会で原本を自動削除するか、本人データ削除要求で削除するかも方針レビュー対象。auditの最低記録はoperationKey、固定action/reason、scope、時間、結果とCAS版。削除後も保持する監査の範囲は再識別リスク込みで確認し、旧原本ID/hash/私的本文を「監査だから」と無期限保持しない。

## 6. 小さい後続PRと受入条件

| PR単位                            | 変更候補・再利用                                                                                                                           | 完了条件・切り戻し                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1: 純粋契約/否定テスト            | domainのCandidate状態とRevision条件、Application Port/fake。同scope型とEvidence生成再利用。schema/HTTP/UIなし                              | 下記T1〜T6/T10のfake契約。保存/削除の実装済みとはしない。公開export単位で戻せる                                         |
| 2: 保持・削除前提＋保存Repository | 方針承認後のみ、最小schema/migration、原本保持/削除とCandidate失効、既存退会purge/Jobの限定接続、共有tx helper/認可/locks/CAS。HTTP/UIなし | 隔離Postgresで全競合・FK・削除・再送を検証。削除要求漏れなし。新書込停止→既存原本を壊さずrollback。追加表の消去は別承認 |
| 3: 管理者の作成/確認導線          | PR #1089の週/開示方針を再利用、opaque確認handle、Origin/入力サイズ/CSRF/失効、限定操作audit。通常UIだけ                                    | RSC/HTML/Networkの非露出、他Service/役割拒否、実端末/同時操作確認。新route/action導線を外して切り戻す                   |

Issue化・実装承認・指示案・改善前後比較は別ゴール。Provider横展開、AI分類、優先順位スコア、全文検索/CSV、全Packageの一括導入は不要。

| ケース | 受入試験（**将来計画、今回未実行**）                                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | 同一原本/順序違い/重複配信は同Evidence。原本追加/削除/所有変更/完全性/版変更は旧判断失効                                                                                                                                                                          |
| T2     | 同countの別原本へ差替えでもRevision不一致。bucketが同じでも週の別bucketが少人数化したら全開示/操作を拒否                                                                                                                                                          |
| T3     | 越Workspace/Service/environment/Package/Adapter、本人/CONTENT_EDITOR/失効管理者拒否。再送も再認可                                                                                                                                                                 |
| T4     | operationKey同内容再送は1変更/1audit、異内容は競合。応答喪失後を新実行インスタンスで照会                                                                                                                                                                          |
| T5     | barrierで管理者2人のCAS、source削除、所属失効、保存成功前後の順序を固定。sleepに依存せずSerializable/lock競合を実DBで確認                                                                                                                                         |
| T6     | DB/audit保存失敗は全rollback、PARTIAL/UNKNOWN/5人未満/当週/未知入力から書込不可                                                                                                                                                                                   |
| T7     | 物理Bunshin削除、User soft delete、PERSONAL/ORGANIZATION退会、原本保持期限、操作者削除、scope削除。削除対象のsource ID/個人由来Evidence hashが残らず他人の原本が維持される。個人を含まないscope/週/code由来clusterRefも、残存範囲と再識別リスクを方針レビューする |
| T8     | purge部分失敗/lease切れ/重複Jobを新実行から再開、期限超過再送で延長/復活しない。Job結果を削除実体と別観測                                                                                                                                                         |
| T9     | 未ログイン/古いhandle/署名不正/別scope/期限切れ拒否。HTML/RSC/レスポンス/ログに原本ID・hash・本文/写真/Memoryがない                                                                                                                                               |
| T10    | REVIEWED/DISMISSED/STALEから実装指示が出ない。承認なし/取消/旧Candidate・旧Evidence/権限失効は将来の指示案も不可                                                                                                                                                  |

## 7. 今回の検証・未確認

既存コマンドをNode24で、非課金・mock/pureテストだけ実行した。テストやfixtureは変更していない。

```text
pnpm --filter @bunshin/platform-domain exec vitest run test/improvement-engine.test.ts
pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-review-evidence.test.ts test/improvement-engine.test.ts
pnpm --filter @bunshin/database exec vitest run test/improvement-feedback-observation-adapter.test.ts test/account-deletion-purge-module-boundary.test.ts
```

今回の結果: domain 1ファイル4件、Application 2ファイル61件、Database 2ファイル26件、**計5ファイル91件成功**。純粋承認条件、Evidence Revision、Adapter認可と削除モジュール境界の既存回帰であり、Candidate保存/削除連携/実DB競合の検証ではない。後続のT1〜T10を実施済みとして混ぜない。

通常CIは既存development設定と隔離PostgreSQLだけを使用する構成。文書PRの最新headの整形/型/lint/test/build/database結果はPR検証欄に記録する。実DB競合は後続migration PR、実端末/本番E2E/削除対象件数/バックアップは未確認。設定/本番適用/他Provider・実APIの試験は未実行。

必要なレビューは、保持日数と削除要求の扱い、auditの残存範囲、表示/操作の少数セル基準、削除/所属変更とのTransaction境界。これらが未解決でも、次の純粋契約・fakeテストは進められる。schema・永続化・公開書込口は条件がそろってから別PRで開始する。

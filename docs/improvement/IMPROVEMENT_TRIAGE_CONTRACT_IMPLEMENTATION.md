# 人手Candidate契約・否定テスト — 非永続V1

## 結論・基準・範囲

2026-10-03 Asia/Tokyo。PR #1090 merge後の最新main `50523d5fbcc7530a7bb9ecb6e612e0d9faa0069b`を基点に`codex/improvement-triage-candidate-contract`。Windows、Node24.21.0、pnpm10.10.0。既存Candidateの人手確認/対象外操作の純粋契約、原子的Repository Port、Application Use Caseとfakeテストを追加する。

**実DB保存・Candidate作成・削除/purge・STALE再開・実装承認・HTTP/UIは未実装**。既存の管理確認ページとDB Adapterは変更/接続しない。schema/migration/依存/lockfile/設定/CIは変更せず、Provider・本番DB・実生成・送信・merge/deployを使わない。

## 変更・再利用・判断

- `packages/platform-domain/src/improvement-triage-candidate.ts`: OPEN/REVIEWED/DISMISSED/STALEの型、opaque UUID/CAS整数/期間/内部hash/版/期限の検証。OPENから人手確認/対象外のみ。APPROVEDや開発状態への遷移なし。既存scope契約を再利用し、SNS/ブランド/Providerをdomainへ入れない。
- `packages/application/src/improvement-feedback-triage.ts`: `ReviewImprovementFeedbackCandidate`とTransaction/Repository Port。SNS/TROUBLE_FEEDBACKの既知Evidenceを扱う限定Applicationモジュール。両packageの公開入口からexportする。
- 原子的Portへ現行の同Service管理認可、trusted方針、scope限定Candidate/Evidence/再送記録、CASと操作auditの一体commitを要求する。throwは全rollback、falseのCASは無変更。DB実装はなく、現行読取Adapterを別Transactionのまま保存へ組み合わせたことにはしない。
- 方針はRepositoryが提供する承認済み設定だけ。null/未承認/未知表示版/5人未満/不正保持値は拒否。**90日をdefaultに設定しない**。この限定契約の保持日数は1〜90日のbounded値を受け入れるが、値や方針版を実設定として登録していない。audit180日も実装/設定していない。テストはsynthetic-reviewed-v1・20日の架空方針。
- 完了済みJST月曜週、直近12週、最大1,000件、Service全体だけ。scope/版/候補CAS/週全体とbucket双方のEvidence版を照合。少人数の別bucketがあれば操作からも迂回できない。PARTIAL/UNKNOWN/不正count/所有・原本変更/STALE/期限・方針変更は競合/拒否にする。
- requestとscope、返却方針/Candidateをdetachし、await中の入力参照変更で操作を変えない。Evidence再読取後も認可と時計を再確認する。ただし実DBの削除・所属変更との原子性をこれだけで証明しない。将来Repositoryは共通lock/Transactionを実装する必要がある。
- 操作UUID、CAS版、週全体とbucketのhashを区別。同key・同actor/候補/期待CAS/action/reasonで、現在の根拠/権限/期限と直後の保存版が一致するとだけ元のreceiptを返す。別内容/別actor/後続更新後の古い再送は競合。再送で監査やCASを増やさず、期限を延長しない。
- 成功結果は候補UUID・CAS版・REVIEWED/DISMISSEDのみ。scope/sourceRefs/hash/個人参照/本文/素材を返さない。既知理由コードだけを受ける。確認済みはBUG・解決済み・承認済みを意味しない。

## テストと検証

新規`packages/platform-domain/test/improvement-triage-candidate.test.ts`と`packages/application/test/improvement-feedback-triage.test.ts`。Application fakeは、合成原本を実`BuildImprovementFeedbackReviewEvidence`へ渡してRevisionを生成する。ネットワークguardは終了時に復元する。fakeが提供するserialized tx/CAS/audit rollbackを検証するが、Prisma/削除フローが安全化済みという証拠にはしない。

```text
pnpm --filter @bunshin/platform-domain exec vitest run test/improvement-triage-candidate.test.ts test/improvement-engine.test.ts
pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-triage.test.ts test/improvement-feedback-review-evidence.test.ts test/improvement-engine.test.ts
pnpm --filter @bunshin/platform-domain typecheck
pnpm --filter @bunshin/application typecheck
pnpm --filter @bunshin/platform-domain exec eslint src/improvement-triage-candidate.ts test/improvement-triage-candidate.test.ts
pnpm --filter @bunshin/application exec eslint src/improvement-feedback-triage.ts test/improvement-feedback-triage.test.ts
pnpm architecture:check
```

初回はdomain19件、Application100件成功。追加のUNKNOWN・読取中期限到達・CAS overflowを含む再実行はdomain19件、Application103件、計5ファイル122件成功。初回対象lintは制御文字regexのno-control-regexで失敗し、既存scope同様の文字コード判定に置換する。最終の回帰件数、型/lint/整形/境界/diff、最新headの全体CIはPR検証欄に記録し、途中結果と区別する。失敗をskip/期待失敗で隠さない。

設計書T1/T2の原本追加/削除/同count差替え/所有変更は実Evidence生成＋fakeで再確認。T3はscope6要素・役割/失効拒否、T4は新Use Caseからの応答喪失再送/異内容競合、T5はsleepなしのfake直列境界で管理者2実行の一勝者、T6はfake audit失敗/CAS失敗と不完全/少数/期間拒否、T10は非承認状態と未知実装actionの拒否を確認する。T5のPostgreSQL Serializable/row lock、T7/T8の削除・purge・lease、T9のHTTP/handle/実端末は**未実行/未実装**。既存の純粋なIssue承認判定を今回の実承認処理と混同しない。

## 未解決・次条件・切り戻し

保持日数・audit消去・少数セル基準・削除/所属失効とのTransactionがレビュー対象のまま。原本の退会soft delete時削除はまだ保証しない。今回のPortを本番へ接続する前に、原本保持/削除・Candidate失効をまとめた最小Repository/schema PRの条件を確定する。

次の最小タスクは**保持・削除方針をレビューし、既存退会と原本保持の変更対象/受入テストを確定する**。方針未承認のままCandidate保存を追加しない。実装開始には責任者の承認が必要。実DB競合・削除実体・本番/E2E・バックアップは未確認。

切り戻しは新Use Case/domain/テスト/public exportと文書をPR単位で戻す。既存UI/原本/Evidence/DBに差分がないのでデータ巻戻しは不要。

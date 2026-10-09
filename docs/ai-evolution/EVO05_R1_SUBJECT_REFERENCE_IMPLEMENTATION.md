# EVO-05 R1 合成題材の版付き参照 実装報告

## 作業基準

- 基準main: `c8cc448ca3cf1ad778cefe8df3bc55201f7972a3`（R0 / #1195反映済み）
- branch: `codex/ai-evolution-evo05-subject-references`
- commit: 本文と同時に提出するPRのhead commitを正本とする（自己参照SHAは埋め込まない）。
- 設計正本: `EVO05B_REPRODUCTION_BRIDGE_DESIGN.md` のR1。

## 実装と再利用

AI Training Packageに純粋・immutableな参照契約、strict decoder、合成Draft fixture、review lookupを追加。AI固有の題材は共通Coreへ移さない。既存LearningDefinitionReference、3Definition、legacyMissionRef、Mission Quality、再現練習の3題材カテゴリを再利用する。

参照はcontractVersion / subjectKey / subjectVersion / challengeKey / challengeVersion / Definitionのpackage・key・version / MissionのactionKey・qualityVersionのみ。本文、個人情報、承認フラグ、Provider response、Capability Levelを受け付けない。

識別子は最大80文字の大文字・数字・underscoreに限定。rootとnested objectの余剰・不足項目を拒否し、mutable入力をコピーしてfreezeする。形式が正しい未知の版は保持し、lookupでUNKNOWN。既知の全9候補も未承認のためUNKNOWN / HUMAN_REVIEW_REQUIRED。null等の欠落はCHALLENGE_REFERENCE_MISSING。形式不正は例外で拒否し、黙って現行版へ補完しない。

9候補は既存3Definition × 合成3題材の最小検証matrix。完成品・新教材Library・新Definition・新Missionは追加しない。人間用資料は `EVO05_R1_CHALLENGE_REVIEW_SHEET.md`。AIによる承認はなく、mergeも承認ではない。

## 変更ファイル

- `packages/capability-training/src/reproduction-challenge-reference.ts`
- `packages/capability-training/src/reproduction-challenge-fixtures.ts`
- `packages/capability-training/src/index.ts`
- `packages/capability-training/test/reproduction-challenge-reference.test.ts`
- `docs/DECISION_LOG.md`
- `docs/ai-evolution/EVO05_R1_CHALLENGE_REVIEW_SHEET.md`
- この報告書

## 検証

ローカルNode 24 / pnpm 10でcapability-trainingの27ファイル・364テスト成功（追加39ケース）。typecheck、lint、build成功。参照の再現性、immutable、全版固定、既存Definition/Mission対応、未知版・未知対応、旧履歴欠落、本文・個人情報・承認注入拒否、全Draftのfail-closedを検証。

Repository全体のCI結果はPR Checksを正本とする。合成テストのPASSは人間レビュー、Production動作、実モデル品質、題材難易度同等性を保証しない。

## 既存機能・安全境界

既存compareLearningReproduction、Goal、Plan、Router、Assignment、Assessment、保存処理、UI、API、Provider、Pilot/Privacy/LINE Gateを変更しない。新関数の利用箇所は今回のテストのみ。Runtime・本番モデル・Productionへ未接続。DB/schema/migration変更なし、本番操作・課金API呼出しなし。

形式検証は本人確認・権限・Human Approvalではない。review lookupをRuntime教材取得として使ってはいけない。既存比較関数にはsubjectVersionがないため、実履歴の版付き再現判定は今回未実装。

## 未実装・引継ぎ

R2のread-only履歴projection、R3の明示Practice Bridge、R4 UIには着手していない。次工程では同一Learner/Goal/Plan revision/Definition version、本人同意、challenge全参照・人間承認、既存認可Gateを検証する。旧履歴を推測補完しない。題材カテゴリの違いだけで自力再現・応用・Levelを断定しない。

Human Review記録の保存・承認契約、baseline/follow-upの選択、課題配信、成果Evidence保存も別工程。現在の全Draftは利用可能にならない。

## Rollback / 停止

独立PRの追加export・契約・fixture・テストをrevertする。データ移行・DB rollbackは不要。R1で停止し、人間レビューと次指示を待つ。merge・deploy・承認・Pilot enableを自動実行しない。

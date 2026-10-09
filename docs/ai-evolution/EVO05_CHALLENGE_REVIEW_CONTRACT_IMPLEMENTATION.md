# EVO-05 題材Human Review最小契約（R3先行）

## 基準・範囲

- 基準main: `3e253d7645b9613fe8b26f4e0043dee1f18be895`（#1197 merged）。
- branch: `codex/ai-evolution-evo05-challenge-review-contract`。
- commit: 本文を含むPR headを正本とする（自己参照SHAを本文へ固定しない）。
- 人間レビューの記録形式・照合契約のみ。実際の人間判断・認証・永続化・承認操作は行っていない。

## 調査・設計判断

既存`packages/database/src/learning-definition-approval-admin.ts`はDefinition専用で、題材承認の正本ではない。R1の9題材は全DRAFT、レビュー資料はNOT_REVIEWED。R2は整合履歴でもHUMAN_REVIEW_REQUIRED/UNKNOWNを返す。この状態を維持する。

AI固有題材の契約を既存capability-training公開入口へ追加した。Core、新package、汎用Approval Engineは作らない。

## 契約・資料

`reproduction-challenge-review.ts`は`AI_TRAINING_CHALLENGE_REVIEW_V1`としてreview ID、Workspace/Service、reviewer user ID、UTC時刻、40桁commit、資料SHA-256 digest、bounded証跡key、版固定参照、判断とチェック項目を表現する。

判断はAPPROVE / REJECT / REVISION_REQUIRED。APPROVE記録にはobjective / prerequisites / syntheticFacts / learnerTask / rubricAndMission / safetyの全項目trueが必要。strict decoderは余分な本文・承認主張、欠損、無効日時/識別子を拒否し、immutable projectionを返す。自由コメント本文や顧客情報を保持しない。

未知版の形式上有効な参照は記録できるが、現資料との照合はUNKNOWN。別Workspace/Service/reviewer/commit/digestもUNKNOWN。

`serializeReproductionChallengeReviewMaterial`は9既知Draftの各fixtureと対応Definition全体を固定順序JSONへ投影する。Objective、prerequisite、concepts、practice、mistakes、safety、rubric/Mission版と合成題材を含む。承認済み教材配信APIではない。

将来trusted serverはレビュー対象commitからこの文字列を生成し、UTF-8 SHA-256を計算する。DomainはNode crypto/Providerへ依存しない。testだけでWeb Cryptoによる再現性を確認する。比較関数はserver由来expected値との一致のみで、digestを再計算したり、commitと実checkoutの一致を証明したりしない。

MATCHEDはREJECT/REVISION_REQUIREDでも返るbinding一致であり、人間確認済み/APPROVEDではない。全結果で`executionPermission: NOT_GRANTED`。reviewer/digest/checklistをcallerが偽造しても実行許可にはならない。形式検証は認証・権限検証の代替ではない。

## 未実装・次工程条件

trusted操作の認証、Workspace/Service管理権限、実人間のレビュー証跡検証、対象commit/digestのserver計算、append-only保存・履歴・取消/CAS/idempotencyは未実装。既存Definition APPROVEDも題材承認とは別条件。

これらを人間レビュー後に別PRで設計・実装し、実題材の人間承認を確認するまでR3 Assignment Bridgeへ進めない。形式上APPROVEの合成testを実承認に数えない。旧履歴Backfill、R2成功解除、Router/Goal/Plan/Assessmentの仕様変更はない。

## 変更・影響・rollback

変更は新契約、新unit test、公開export、Decision Log、本報告とレビュー資料の参照追記のみ。DB/schema/migration/API/UI/LINE/OEM/Provider/モデル/本番設定は変更なし。実APIを呼ばず、実承認や課題配信なし。旧V1/既存Gate/R1/R2へRuntime接続なし。

rollbackは本PRのrevert。保存データや本番操作がないためDB rollback不要。

## 検証

- capability-training: 29 files / 465 tests成功（新規45 tests）。R1/R2、Learning Scope/Profile/Goal/Plan/Consultation/Router、Guided Practice/再現Evidenceの既存回帰を含む。
- databaseのreproduction-history、training-personal-data-export/deletion: 3 files / 22 tests成功。fake Repositoryの非実DBテスト。
- capability-training typecheck / lint / build成功。
- architecture:check、境界否定test 10件、git diff --check成功。
- 変更ファイルのPrettier整形済み。root全体typecheck/lint/test/buildとdatabase integrationの最終状態はPR CIを正本として確認する。

初回のtest Node crypto importはpackageの型規約に合わずtypecheck/lintで失敗した。testをWeb Cryptoへ変更し、上記を再実行して成功した。依存・tsconfig変更なし。

3判断、確認項目、strict拒否、Scope/actor/commit/digest不一致、未知版、資料再現性、immutable、DRAFT/UNKNOWN維持を確認。合成テストは本番の人間承認・認可・学習効果の保証ではない。

## 変更ファイル

- `packages/capability-training/src/reproduction-challenge-review.ts`
- `packages/capability-training/src/index.ts`
- `packages/capability-training/test/reproduction-challenge-review.test.ts`
- `docs/DECISION_LOG.md`
- `docs/ai-evolution/EVO05_R1_CHALLENGE_REVIEW_SHEET.md`
- 本報告

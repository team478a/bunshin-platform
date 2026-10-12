# EVO-05 R2 再現練習履歴の読み取り専用投影

## 基準・範囲

- 基準main: `3aea60726ac483b7eaf08434de23f5e08aebf423`（R1 / #1196反映済み）
- branch: `codex/ai-evolution-evo05-history-projection`
- commit: この報告と同時提出するPRのhead SHAを正本とする。
- 設計正本: `EVO05B_REPRODUCTION_BRIDGE_DESIGN.md` のR2、R0/R1実装報告。
- 今回は認可済み読取Port、Repository、純粋投影、テストのみ。R3課題配信・保存、R4 UI、実モデル評価、本番操作は含まない。

## 現状との差分

既存Assignmentには題材参照がない。既存完了EventにはGoal / Plan revision / Definition / Answer / 支援量があるが、題材を本文から復元してはいけない。実履歴は `CHALLENGE_REFERENCE_MISSING / UNKNOWN` で正常。

R1の全challengeはDRAFT。Human Approvalの正本・保存処理は未実装。合成履歴が整合しても `HUMAN_REVIEW_REQUIRED / UNKNOWN` を返す。R2は本番の再現成功を有効化しない。

## 公開契約と配置

`packages/capability-training/src/reproduction-history.ts`:

- `ReproductionHistoryRepository`: 認証済みactorのPrivacy scopeと、明示的baseline/follow-up Assignment IDを受ける内部Port。HTTP DTOや本人証明ではない。
- `projectLearningReproductionHistory`: 一つの整合Snapshotから再計算する純粋関数。
- ruleVersion: `AI_TRAINING_REPRODUCTION_HISTORY_V1`。
- 上限: 2Assignment / 2Answer / 2Plan revision、関連Event合計200件。Repositoryは上限+1で打切りを検出し、部分結果を成功扱いしない。
- 結果はruleVersion、UNKNOWN、固定Reason、未測定の支援比較・外部操作・品質・Level・Transferだけ。raw metadata / Answer / 履歴本文を返さない。

AI Package固有の照合をcapability-trainingへ置く。Prisma依存はdatabase Adapterへ閉じ込める。既存 `compareLearningReproduction` / `definePracticeCompletion` / `effectivePracticeSupport` / Definition・Mission・Skill版 / R1 lookupを再利用し、既存比較契約を変更しない。

## Repositoryと認可

`PrismaReproductionHistoryRepository` は一つのRepeatableRead transactionで以下を確認する。

1. ACTIVE User / Workspace / Group / 本人Membership。
2. 同Workspace / Service / Membershipの本人Enrollment（既存Privacyと同じACTIVE / COMPLETED / EXPIRED）。
3. AI_TRAINING_V1かつPersonal Learning Pilot Program。旧V1を対象にしない。
4. PARTICIPANT、またはR0の限定INTERNAL SERVICE_OWNER履歴。管理権限一般・EXTERNALだけでは不可。
5. 明示された2Assignmentだけを同Enrollmentへ絞り、Answerは本人User、Eventは本人actorと対象Assignmentへ絞る。
6. Snapshotで参照した正確なPlan revisionを本人User / Membership付きで読む。現在版や最高scoreへ置き換えない。

STOP、Program停止、Seat取消はPrivacy読取を止める条件にしない。一方、新学習のGateは変更しない。ALL削除でSeatがdetachされた所有者はR0の同一本人/Enrollment削除監査を必要とする。認証無効・退会時の請求経路は既存の別課題。

UUID不正・認可不能はNOT_FOUND。DB障害はUNKNOWNへ握りつぶさずthrowする。transaction中にwrite / lock / Providerを呼ばない。

## 履歴の照合

- R1の全版・対応関係をexact lookupする。読取候補slotは `displaySnapshot.personalLearning.challenge`。**このslotへ書き込む処理・将来の保存schemaは今回実装しない**。
- challengeのDefinitionとAssignment内Definition、Mission key、qualityVersionが一致すること。
- 保存済みPlanの契約/Rule版、同Scope・Goal参照・revision・確認時刻・stepが一致すること。未知Plan版はUNKNOWN。歴史的なSUPERSEDED / COMPLETEDも確認証跡が残る場合に読取可能。現在の実行権とは別。
- COMPLETED Assignment、各1件のSTART / COMPLETE、本人操作、既存Rule、operator / provenance、Plan source / Answer source、時刻範囲を照合する。
- SELF_PROMPTED → SELF_EVALUATED → 任意SELF_REVISEDの記録順序を確認する。本人申告は外部AI操作の独立証明ではない。
- STARTの支援選択とHINT_VIEWED / HELP_REQUESTEDからeffective supportを再計算。過少記録、完了後の支援Event、時刻矛盾はUNKNOWN。
- READY Answerの所有境界、完了EventのAnswer参照、同sourceの唯一ANSWER_EVALUATED監査、評価時刻、5つの評価fieldを照合する。
- PASS、現Skill rule、understandingと対象Skillの60–100、evaluatedSkillKeysを照合する。Profile scoreやmetadataのverified/PASS主張は代替にしない。
- 合成2attemptを既存EVO-05-Aへ渡し、同Goal / Plan revision / Definition版、別Assignment / Answer / 題材カテゴリ、後時点評価・完了を検証する。
- 上記が整合しても題材が未承認なのでUNKNOWN。成功結果をEventへ保存しない。

## Privacy / 削除 / 保持

Answer本文はSELECTしない。既存JSON列のdisplaySnapshot・evaluation・Event metadataは内部照合のため読むが、API / Export / Log / Telemetryへ丸ごと出力しない。新しい履歴コピー、成功台帳、本文保存はない。

片側Answer・完了・監査の削除、Plan/Assignment snapshotのredaction、保持期限による根拠欠落後は、次の読取でUNKNOWNへ戻る。前回結果の再利用なし。既存の保持期間、削除/Exportの仕様・実行処理は変更しない。実DBの保持運用・完全消去・復元後再削除は今回未検証。

## 検証

合成Snapshot unitとfake Prisma Repositoryで、未知参照、削除・redaction、偽PASS、監査欠損/変更、Skill不足、全Scope、操作/確認不足、支援・時刻、revision不一致、打切り、INTERNAL所有者Privacy、旧V1拒否、本文非公開、DBエラー伝播を検証する。

ローカルNode 24 / pnpm 10:

- capability-training: 28 files / 420 tests成功（新規56ケース、全3Definitionと共有MissionのSkill分離を含む）。
- database新規Repository / Privacy関連: 4 files / 30 tests成功（新規Repository 10ケース）。
- application: 136 files / 895 tests成功。
- database全体: 初回は929件中928成功、既存RLS migration検査1件が5秒timeout。単独再実行は2ケース成功。ローカルの同時worker数を2へ抑えた全体再実行で194 files / 929 testsすべて成功。検査・timeout設定は変更しない。
- architecture check / 境界テスト10件成功。capability-training / databaseの型・lint・build成功（database buildは既存生成済みPrisma Clientによるtsc、schema変更なし）。変更ファイルformat / git diff --check成功。全体formatの新規Database test整形警告は修正済み。

Repository全体のtypecheck / lint / test / buildと隔離DB regressionの結果はPR CIを正本とする。今回の新Repositoryはfake Prismaで検証し、実DBの新読取経路・削除競合は未検証。合成/fakeの成功をProduction動作・学習成果・Human Approvalとしない。

## 変更ファイル

- capability-training: `src/reproduction-history.ts`、`src/index.ts`、`test/reproduction-history.test.ts`
- database: `src/reproduction-history.ts`、`src/index.ts`、`test/reproduction-history.test.ts`
- `docs/DECISION_LOG.md`
- この報告書

DB/schema/migration、UI/API、Provider/モデル、LINE、OEM課金、Goal/Plan/Router/Assignment/First Successの既存write処理を変更していない。新Repositoryの利用は今回のテストだけ。本番DB接続・deploy・Pilot enable・実課金APIなし。

## 未実装・次工程・Rollback

Human Review結果の承認契約、題材の保存、明示的再挑戦のpair/stage/purpose契約、通常Routerとの分離、実際のbaseline/follow-up選択、UI、本人Exportへの新参照表示はR3/R4等の別レビュー。形式検証・今回PRのmergeは承認ではない。

R2で停止する。rollbackは本PRの追加Port/Repository/exports/testをrevertする。永続変更がなくDB rollback不要。次は人間レビュー後の別指示を待つ。

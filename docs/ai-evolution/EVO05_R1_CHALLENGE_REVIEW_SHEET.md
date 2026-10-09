# EVO-05 R1 合成再現練習 Human Review Sheet

## 状態と境界

すべて **DRAFT / NOT_REVIEWED**。この資料の作成、テスト成功、PRのマージはHuman Approvalではない。利用可能なRuntime教材、承認済みDefinition、習得判定として扱わない。

正本は `packages/capability-training/src/reproduction-challenge-fixtures.ts` と既存 `learning-definition-fixtures.ts`。既存3Definition × 3題材の9候補のみで、新Definition・Mission・完成成果物を追加しない。

## 固定版

| 対象                     | 版                                          |
| ------------------------ | ------------------------------------------- |
| 参照契約                 | AI_TRAINING_REPRODUCTION_CHALLENGE_REF_V1   |
| 題材                     | AI_TRAINING_REPRODUCTION_SUBJECT_V1         |
| challenge                | AI_TRAINING_REPRODUCTION_CHALLENGE_DRAFT_V1 |
| Definition               | AI_TRAINING_DEFINITION_FIXTURE_V1           |
| Mission Quality / Rubric | AI_TRAINING_MISSION_QUALITY_V1              |

packageKeyはAI_TRAINING。challengeKeyは `{definitionKey}_{subjectKey}`。意味・事実・課題・対応関係を変更した場合は版を更新し、再レビューする。参照形式の検証と承認・認可は別責務。

## 合成題材

| subjectKey                   | 題材                                   | 固定事実 / UNKNOWN                                               |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| EMAIL_PRACTICE               | 架空の社内勉強会を架空担当者へ知らせる | 11月10日15時、仮会議室A。返信期限11月5日。出席者数・個人名は不明 |
| REPORT_PRACTICE              | 架空の備品整理の進捗を知らせる         | 対象10件、整理済み8件。残り2件は未確認。完了予定・作業効果は不明 |
| INFORMATION_SUMMARY_PRACTICE | 架空の図書室の案内を整理する           | 火曜・木曜13–16時、スタッフ向け、予約不要。貸出期間は不明        |

実在の顧客情報・個人情報・業務秘密を追加しない。不明な情報を創作しない。題材間の難易度同等性や応用能力は未検証。

## Definitionごとのレビュー観点

| Definition         | Objective / Concepts               | Prerequisite     | Teaching / Practice                                                             | Mission / Rubric                                    |
| ------------------ | ---------------------------------- | ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| PROMPT_STRUCTURE   | 背景・目的・依頼を区別する         | なし             | 本人が3要素を組み立て、依頼を一つに絞る                                         | PROMPT_BASIC。指示構造・背景・実行可能な依頼        |
| CONTEXT_SETTING    | 目的に必要な対象・背景情報を伝える | PROMPT_STRUCTURE | 本人が必要情報を選び、既知事実と不明点を区別する                                | PROMPT_BASIC。既存Missionを共有するがDefinitionは別 |
| CONSTRAINT_SETTING | 具体的で矛盾しない条件を指定する   | CONTEXT_SETTING  | 対象・長さ・文体・注意点から2条件以上を本人が選び、数値化可能な条件を具体化する | PROMPT_CONDITION。条件の具体性・測定可能性・一貫性  |

Common Mistakesは背景・目的・依頼の混同、不要な背景や未知情報の補完、曖昧・矛盾した条件。詳細Objective・Concepts・Rubric・Safetyは既存Definition/Mission Quality正本と照合する。新しい評価ルールは作らない。

研修は指示の作り方・確認・修正を支援し、完成品を代行して返さない。本人がAIを操作する。Prompt評価・本人申告だけで成果物品質、外部AI操作、自力再現、Capability Levelを確定しない。

## 個別判断記録（人間のみ記入）

| challengeKey                                    | 状態  | 人間判断     | Reviewer / 日時 / Evidence |
| ----------------------------------------------- | ----- | ------------ | -------------------------- |
| PROMPT_STRUCTURE_EMAIL_PRACTICE                 | DRAFT | NOT_REVIEWED | 未記入                     |
| PROMPT_STRUCTURE_REPORT_PRACTICE                | DRAFT | NOT_REVIEWED | 未記入                     |
| PROMPT_STRUCTURE_INFORMATION_SUMMARY_PRACTICE   | DRAFT | NOT_REVIEWED | 未記入                     |
| CONTEXT_SETTING_EMAIL_PRACTICE                  | DRAFT | NOT_REVIEWED | 未記入                     |
| CONTEXT_SETTING_REPORT_PRACTICE                 | DRAFT | NOT_REVIEWED | 未記入                     |
| CONTEXT_SETTING_INFORMATION_SUMMARY_PRACTICE    | DRAFT | NOT_REVIEWED | 未記入                     |
| CONSTRAINT_SETTING_EMAIL_PRACTICE               | DRAFT | NOT_REVIEWED | 未記入                     |
| CONSTRAINT_SETTING_REPORT_PRACTICE              | DRAFT | NOT_REVIEWED | 未記入                     |
| CONSTRAINT_SETTING_INFORMATION_SUMMARY_PRACTICE | DRAFT | NOT_REVIEWED | 未記入                     |

判断はAPPROVE / REJECT / REVISION_REQUIRED。固定版・Objective・前提・事実・課題・Rubric・Safety・Mission対応を確認する。AIは判断欄を埋めない。この記録をRuntime承認へ変換する処理はR1にはない。Definition自体の承認も別に必要。

## 次工程へ残す条件

旧履歴にchallenge参照がなければUNKNOWN。カテゴリや日時から補完しない。未知の版・対応不一致もUNKNOWN。既存比較関数は題材カテゴリを比較するもので、今回追加した版付き参照をまだ入力しない。R2以降のAdapterで参照・承認・認可を検証する必要がある。

Assignmentの選択、baseline/follow-upの対応付け、保存、UI、Provider、参加者登録は未接続。Pilot・Tenant・Privacy・同意の既存Gateを維持し、次工程は別承認を待つ。

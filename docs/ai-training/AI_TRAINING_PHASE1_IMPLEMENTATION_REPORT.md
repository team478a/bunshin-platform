# ワタシワークス AI研修 Phase 1 実装報告

- 対象: AI研修の個別化・実務利用コアループ
- 基準文書: `docs/ai-training/AI_TRAINING_CURRENT_STATE_AUDIT.md`
- 実装日: 2026-09-28

## 1. 実装した内容

### 仕事Context

既存 `TrainingParticipantProfile` にversioned JSONの `workContext` を追加した。

- 普段の仕事内容
- 時間がかかる仕事
- AIで改善したい仕事
- 主な利用端末

APIで文字数とenumを検証し、UIの入力欄付近に個人情報・パスワード・機密情報を入力しない注意を表示する。通常ログやAction Event metadataには自由入力本文を保存しない。

既存受講者のProfileは壊さず、workContext未入力の場合は初期設定を再表示する。Runtime内部では安全な固定ContextをFallbackとして利用できる。

### Mission個別化

`AiTrainingV1Policy` がMission keyを選択する既存構造を維持した。その後にAI研修Capability内の小さなPersonalization Layerを通し、次だけを変更する。

- business scenario
- task wording
- hint
- ユーザー向けの選定理由

learning objective、criteria、Mission key、Skill rubric、PASS/REVIEW構造は変更しない。

個別化結果は `ProgramMissionAssignment.displaySnapshot` schemaVersion 4として一度だけ保存する。同じAssignmentを開き直しても再生成しない。

記録するVersion:

- ProgramTemplateVersion（既存Assignment relation）
- catalog / mission quality version
- rule version
- personalization version
- evaluation prompt version（既存AI評価）

Personalization Layerはinterfaceで分離し、例外時は固定MissionへFallbackする。Phase 1ではProviderに自由文を生成させず、本人が入力した仕事Contextを安全な定型Composerへ差し込む。これにより架空の業務情報を作らず、Provider障害で今日の課題が消えることも防ぐ。

### 実務利用結果

PASS後に次の4択を表示する。

- `USED_AS_IS`
- `USED_WITH_EDITS`
- `NOT_USED_YET`
- `NOT_APPLICABLE`

結果は新規巨大Tableを作らず、`ProgramActionEvent` の `TRAINING_WORK_RESULT_RECORDED` として保存する。metadataにはschemaVersion、Assignment ID、Mission key、resultだけを保存し、回答本文は複製しない。

RepositoryはWorkspace、Service、Participant membership、Enrollment、AI Training module、完了済みAssignmentを照合する。idempotency keyで二重記録を防ぐ。

### 次回Missionへの反映

実務利用Eventのうち `USED_AS_IS` / `USED_WITH_EDITS` をPolicy inputの `workUseCount` として集計する。実務利用経験がある状態でGoal優先Missionを選ぶ際、`WORK_USAGE_CONFIRMED_NEXT_PRACTICE` を選定理由として記録する。

Work ResultだけでSkill scoreやAI levelを昇格させない。既存AI評価とDomain ruleが引き続き正本である。

### 管理画面

回答本文を取得せず、次の集計だけを追加した。

- 実務利用回答者数
- 実務利用回答数
- そのまま利用
- 修正して利用
- 未利用
- 対象外

## 2. データフロー

```text
初期設定
→ TrainingParticipantProfile.workContext
→ AiTrainingV1PolicyでMission key決定
→ 固定Mission Definition
→ TrainingMissionPersonalizer
→ ProgramMissionAssignment.displaySnapshot V4
→ Webで本人が回答
→ 既存AI Skill Evaluation
→ PASS / REVIEW
→ Work Result選択
→ ProgramActionEvent
→ ProgramProgressSnapshot revision更新
→ 次回Policy inputでworkUseCount参照
```

## 3. 境界

- SNS DailyMission / WeeklyPlanへ統合していない。
- Bunshin / Memoryを暗黙参照していない。
- AI物販、Fortune、SNS、他ProgramのPolicyは変更していない。
- 共通Program RuntimeのSchemaは変更せず、既存displaySnapshot / Event / Snapshotを利用した。
- DB変更はTrainingParticipantProfileのJSON column 1つだけである。

## 4. Migration

`20260928060000_add_training_work_context`

```sql
ALTER TABLE "training_participant_profiles"
ADD COLUMN "work_context" JSONB NOT NULL DEFAULT '{}'::jsonb;
```

既存行には空objectが入り、既存Profileの読み込みを維持する。本人が次にAI研修画面を開くと、仕事Context入力を案内する。

## 5. テスト

- 同じMissionでもRole / workContextによりScenarioが変わる
- Mission key、learning objective、criteriaは変わらない
- Personalizer失敗時に固定ScenarioへFallbackする
- Work Resultを次回Policyの選定理由へ利用する
- Work ResultだけでSkill scoreを変更しない
- 別UserのEnrollmentへのWork Result記録を拒否する
- 同じidempotency keyの再送を二重登録しない
- 管理Dashboardへ実務利用を集計し、回答本文を含めない
- Capability Training全テスト
- Repository isolationテスト
- Web管理集計テスト
- 全workspace typecheck

## 6. 今回実装していないもの

- Barrier Detection完全版
- 忙しい／難しい等の理由別分岐
- 1分版Mission
- 自由なAI Mission生成
- Providerによる自由なScenario生成
- 完全なWORK mode
- 自動テンプレート検出
- 複雑なChat session
- LINE本文変更

## 7. 次Phaseの候補

1. Pilotで仕事内容入力と個別化Scenarioの品質を確認する
2. 実務利用率、PASS率、REVIEW率を観測する
3. Barrier reasonと1分版を既存Event / Policyへ追加する
4. Provider個別化が必要かを、定型Composerの品質と原価を比較して判断する

Providerによる個別化を追加する場合も、Mission key、objective、criteriaを固定し、構造化出力、Version、AiUsageEvent、Fallbackを必須とする。

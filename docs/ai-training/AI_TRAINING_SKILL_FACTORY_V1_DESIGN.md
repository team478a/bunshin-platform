# AI研修 Skill Factory V1 設計

日付: 2026-10-05（Asia/Tokyo）

状態: Design only / Human review required

## 1. 目的と今回の結論

AI研修で、受講者が現在割り当てられているMissionに対して「困った」を選択した事実を、担当者が確認できる再利用可能な支援Skill / Workflow案へ変換するための最小契約を設計する。

V1の対象Problemは次の一つに限定する。

> 有効なAI研修Enrollmentの受講者が、本人へ割り当て済みの現在Missionで `HELP_REQUESTED` を記録した。

期待Outcomeは、承認済みの限定情報から、元Missionの学習目的を変えずに受講者の次の一歩を小さくする支援Skill / Workflow案を、担当者が安全にレビューできることである。Skillの自動採用、受講者への自動配信、外部AI実行はOutcomeに含めない。

本書は設計だけであり、型、validation、DB、schema、migration、UI、Provider、Codex API、Skill生成、外部実行を追加しない。

## 2. 既存資産と境界

### 2.1 再利用する既存正本

| 責務             | 既存正本                                     | V1での扱い                                                            |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Programと教材版  | `ProgramTemplateVersion`                     | 公開済みAI研修版であることを確認する                                  |
| 現在Mission      | `ProgramMissionAssignment`                   | 対象Assignment、Mission key、variant、rule versionを参照する          |
| 「困った」の事実 | `ProgramActionEvent` の `HELP_REQUESTED`     | 新しいProblem入力の起点候補とする。自由文へ拡張しない                 |
| Mission定義      | AI研修Mission Catalog / Mission Quality      | learning objective、成功条件、所要時間の正本とする                    |
| Barrier          | AI研修の選択式BarrierとAdjustment            | 固定reason codeだけを必要時に投影する                                 |
| Skill評価        | `AI_TRAINING_SKILL_RULES_V1` と評価済みSkill | 対象Missionに関係する評価済みkeyだけを任意入力とする                  |
| 実行・履歴       | Program Runtime                              | Assignment/Event/Progressを置き換えない                               |
| AI利用監査       | 既存AI Usage                                 | 将来Providerを呼ぶ段階で必須。設計・pure contract段階では記録対象なし |

AI研修はEnrollment単位であり、Bunshinを必須にしない。SNSの`DailyMission`、`WeeklyPlan`、Bunshin Memoryへ接続しない。他PackageのProblem、Memory、投稿履歴を暗黙利用しない。

### 2.2 V1で新設しないもの

- 共通CoreのSkill FactoryまたはSkill Registry
- 新しいAgent、Memory、Analytics、テーブル、migration
- Mission Catalogや既存Skill評価の置換
- 回答本文、自由文、写真、会話を収集する新経路
- Codexその他ProviderのAdapter、API呼び出し、資格情報、課金
- 受講者UI、管理UI、LINE通知、外部配信
- 自動Skill生成、自動採用、自動改善、自動PR、Merge、Deploy

## 3. V1 Problem Contract案

実装候補名は `TrainingMissionHelpProblemV1` とする。次のPure Contract PRで名称を確定するまでは設計上の呼称である。

```text
TrainingMissionHelpProblemV1
  contractVersion
  problemId
  revision
  status: DRAFT | APPROVED | REVOKED | EXPIRED
  scope
    workspaceId
    serviceId
    programEnrollmentId
    missionAssignmentId
  source
    actionEventId
    actionEventSchemaVersion
    occurredAt
  mission
    programTemplateVersionId
    missionDefinitionKey
    missionRuleVersion
    assignmentVariant
  contextProjection
    learningObjectiveKey
    relevantSuccessCriteriaKeys[]
    barrierReasonCode?
    evaluatedSkillKeys[]
  expectedOutcome: REVIEWABLE_SUPPORT_SKILL_DRAFT
  expiresAt
```

### 3.1 所有・revision規則

- Workspace、Service、Enrollment、Assignment、Action Eventが同一AI研修scopeであることを、Repository/Application境界で再確認する。
- CallerのUser認可は実行時Contextで検証し、portableなProblemやArtifactへ直接User IDを複製しない。
- AI研修はBunshinを必須にしないため、ProblemへBunshin IDやBunshin Memoryを追加しない。
- `HELP_REQUESTED`が対象Assignmentに結び付かない場合、別Enrollment、別Service、別Packageの場合は拒否する。
- Problem revisionに加え、Program Template Version、Mission定義版、Assignment variant、source event schema versionを固定する。
- sourceまたはMissionのrevisionが変わった場合、古いProblemを黙って更新せず失効または再レビューする。
- `APPROVED`以外、取消済み、期限切れ、受講期間外、所属・権限失効時は後続Draftを作れない。

### 3.2 入力へ含めないもの

- 受講者の回答本文、評価自由文、自由入力
- 写真、添付ファイル、会話、音声、Memory
- Token、secret、署名URL、Provider raw response
- 直接User ID、直接Bunshin ID
- 他Missionの回答、他Enrollment、他Service、他Packageの履歴
- 担当者が確認していない推定事実、推定感情、推定能力

Internal scope IDは所有・認可・revision照合のためだけに用い、Provider向けprojectionやportable Artifactへそのまま出さない。

## 4. Feasibility Contract案

実装候補名は `TrainingSkillDraftFeasibilityV1` とする。各判定は `PASSED | BLOCKED | UNKNOWN` の三値と、固定reason code、確認revision、確認時刻を持つ。

最低限の判定軸:

1. `AUTHORIZATION`: 現在の担当者権限が有効か
2. `SCOPE`: Workspace / Service / Enrollment / Assignment / Eventが一致するか
3. `PROGRAM`: 対象が公開済みAI研修Programか
4. `ENROLLMENT_PERIOD`: 受講期間内か
5. `PROBLEM_APPROVAL`: 現revisionが人間承認済みか
6. `SOURCE_REVISION`: EventとMission参照が承認時から変わっていないか
7. `DATA_POLICY`: allowlist外データが含まれていないか
8. `BUDGET`: この段階の外部AI費用が0円か
9. `DELIVERY`: 自動配信・外部実行が無効か

総合結果は、全項目が`PASSED`の場合だけ`READY_FOR_DRAFT`とする。1件でも`BLOCKED`なら`BLOCKED`、`BLOCKED`がなくても1件でも`UNKNOWN`なら`REVIEW_REQUIRED`とする。UNKNOWNをPASSEDへ補完しない。

設計PRおよび次のPure Contract PRでは外部Providerを呼ばないため、費用上限は0円で固定する。将来費用を発生させる場合は、金額、通貨、期間、予約・解放、超過時停止を別Decisionで承認する。

## 5. Skill / Workflow Contract案

実装候補名は `TrainingMissionSupportSkillDraftV1` とする。これは採用済みSkillではなく、人間レビュー対象のDraftである。

```text
TrainingMissionSupportSkillDraftV1
  contractVersion
  skillDraftId
  revision
  sourceProblemId
  sourceProblemRevision
  scopeFingerprint
  missionDefinitionKey
  purpose: REDUCE_NEXT_STEP_WITHOUT_CHANGING_LEARNING_OBJECTIVE
  requiredInputKeys[]
  prohibitedInputClasses[]
  steps[]
  expectedOutput
  validationPolicyVersion
  status: DRAFT | VALIDATED | APPROVED | REJECTED | REVOKED | EXPIRED
```

V1のWorkflowは次に限定する。

1. 承認済みProblemとFeasibilityを再照合する。
2. Mission Catalogから対象Missionのlearning objectiveと成功条件を取得する。
3. 選択式Barrierがある場合だけ、既存Adjustmentの固定方針を適用する。
4. 元のlearning objectiveを変えず、1回で試せる次の一歩へ分解する。
5. 使用したMission版、Problem revision、入力key、禁止データ検査結果をArtifactへ記録する。
6. Validation後も自動採用せず、担当者のHuman Approvalを待つ。

Skill Draftは回答の正解、受講完了、Skill score更新、Mission差し替えを決定しない。既存Program Policyと評価規則を上書きしない。

## 6. Artifact Contract案

実装候補名は `TrainingSupportDraftArtifactV1`、種別は `TRAINING_SUPPORT_SKILL_DRAFT` とする。

Artifactに含められるもの:

- Artifact / contract version
- source Problem IDとrevision
- scopeの不可逆fingerprint
- Program Template VersionとMission definition key
- learning objectiveの固定key
- 使用した成功条件key
- Barrier reason code（存在し、人間確認済みの場合のみ）
- 支援手順のDraft
- validation statusとreceipt参照
- 作成・失効時刻

Artifactに含めないものはProblemの禁止データと同じとする。Workspace、Service、Enrollment、Assignment、Action Eventの生IDは認可側で管理し、portable Artifact本文には複製しない。fingerprintは匿名化を保証するものではなく、外部共有許可にもならない。

Artifactは画面表示、LINE配信、Provider実行、コード変更、PR作成へ直接接続しない。`APPROVED`はこの支援Draftの採用だけを意味し、外部実行、配信、Merge、Deployを承認しない。

## 7. Validation Contract案

実装候補名は `TrainingSupportDraftValidationReceiptV1` とする。Validationは最低限、次を個別に記録する。

- contract / schema versionが対応範囲内
- Problemが`APPROVED`かつ未取消・期限内
- Problem、Mission、Skill Draftのrevisionが一致
- Workspace / Service / Enrollment / Assignment / Event scopeが一致
- AI研修ProgramとMission Catalogに存在する固定keyだけを使用
- learning objectiveが元Missionから変更されていない
- 支援手順が規定数・規定文字数以内
- allowlist外fieldと禁止データclassがない
- Feasibilityの全項目が`PASSED`
- 外部Provider未使用、費用0円、自動Delivery無効

Validation失敗を空Artifactや部分成功へ変換しない。失敗理由は固定codeで返し、本文、内部ID、秘密情報をログへ含めない。

## 8. Human-in-the-loopと権限分離

次を別段階・別権限として扱う。

| 段階               | V1での扱い                                      |
| ------------------ | ----------------------------------------------- |
| Problem採用        | AI研修担当者がscope・source・目的を確認して承認 |
| Skill Draft作成    | Pure Contract後の別作業。外部AIなし             |
| Validation         | Draftとsource revisionを機械検証                |
| Skill採用          | 担当者が内容と適用範囲を確認して承認            |
| 受講者へのDelivery | 今回対象外。別承認                              |
| 外部AI / Codex実行 | 今回対象外。別承認と費用上限が必要              |
| PR作成             | 今回のSkill承認とは別権限                       |
| Merge              | PR作成とは別権限                                |
| Deploy             | Mergeとは別権限                                 |

`HELP_REQUESTED`の記録、Problem生成、Validation成功を、人間承認として扱わない。

## 9. Genspark Test

1. 巨大AIが同じ案内生成を標準搭載しても、Platformは現在のEnrollment、Mission版、受講期間、既存Barrier、評価済みSkill、安全条件を一体で照合できるため利用理由が残る。
2. 巨大AIだけで一般的な助言を作れても、残る20%は「誰のどの研修Missionを、どの版・権限・安全条件で支援し、元の学習目的を変えていないか」の保証にある。
3. Provider性能が向上すれば将来のSkill Development品質は向上し得るが、Problem、Context projection、承認、Validation、OutcomeはPlatform側に残る。
4. 利用者がPlatformを開く理由は、一般的なチャットではなく、現在の研修進行に沿った次の一歩を受け取るためである。
5. PlatformにはProblem revision、承認済みContext projection、Skill / Workflow revision、Validation、利用後Outcomeを、既存scope内の資産として蓄積できる。

判定: 設計継続は妥当。ただし実利用Outcomeは未測定であり、Genspark Test通過をProvider実行や本番提供の承認にしない。

## 10. 次のPure Contract PRの受入条件

次のPRは`@bunshin/capability-training`内の純粋型・validation・fixtureに限定し、次をテストする。

- 別Workspace、別Service、別Enrollment、別Assignment、別Packageを拒否する
- `HELP_REQUESTED`以外のEventを対象Problemとして拒否する
- Problem、Mission、Skill Draft、Artifactのrevision不一致を拒否する
- `REVOKED`、`EXPIRED`、未承認Problemを拒否する
- Feasibilityの`UNKNOWN`を実行可能にしない
- 回答本文、自由文、写真、会話、Memory、secret、Provider raw response、直接User/Bunshin IDを拒否する
- サイズ上限と固定key allowlistを検証する
- 元Missionのlearning objective変更を拒否する
- 既存Program Runtime、Mission Catalog、Skill評価の状態を書き換えない
- Provider、DB、HTTP、UI、Job、LINEを呼ばない

共通Core昇格は行わない。AI研修の具体例で契約が成立し、別Packageでも同一責務が確認された後に改めて判断する。

## 11. 未解決事項と停止条件

未解決事項:

- Problem / Skill Draftの有効期限の具体値
- Human Approverを既存のどのAI研修管理権限へ限定するか
- Artifact本文の最大step数・最大文字数
- `HELP_REQUESTED`だけで不足する場合に、既存Barrier reasonを必須にするか
- 採用後Skillの保存先と廃止・rollback契約
- 実利用Outcomeをどの既存Eventで測るか

これらを未確認のままPASSEDへ補完しない。Pure Contractでは未確定値を`UNKNOWN`または明示入力として扱う。

次のいずれかが必要になった時点で停止し、人間レビューを受ける。

- DB、schema、migration、UI、Provider設定、外部API、実課金
- 回答本文、自由文、写真、会話、Memory、顧客素材の利用
- 新しい管理権限、外部Delivery、自動採用、自動改善
- 共通Coreまたはハッシーへの横展開
- Codex実行、コード変更、PR自動作成、Merge、Deploy

## 12. 次Phaseへ進める条件

1. 本設計PRの人間レビューと承認。
2. 有効期限、承認権限、サイズ上限、Barrier必須性を確定する。
3. Pure Contractの配置を`@bunshin/capability-training`内に限定することを確認する。
4. DB、UI、Providerなしの型・validation・否定テストだけを次の独立PRとして承認する。

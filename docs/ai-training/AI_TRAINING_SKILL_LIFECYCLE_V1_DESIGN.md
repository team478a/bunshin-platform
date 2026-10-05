# AI研修 Skill Lifecycle V1 設計

日付: 2026-10-05（Asia/Tokyo）

状態: Approved design / Admin Adoption implemented

## 1. 目的と結論

`AI_TRAINING_SKILL_FACTORY_V1_DESIGN.md`とPure Contractで作成・検証した支援Skill Draftを、人間が採用した後にどこへ保存し、どう停止・廃止・rollbackし、どのOutcomeで価値を確認するかを定義する。

V1では、AI研修Package専用のService-owned Registryを推奨する。共通Core、Bunshin Memory、参加者Toolkit、`ProgramActionEvent.metadata`をSkill本文の保存先にしない。

本設計に基づくPersistence Contractと、AI研修Package専用schema / migration / Prisma Repository / 実DBテストを実装した。HTTP、UI、Job、LINE、Provider、外部API、課金、Skill自動採用、自動Deliveryは追加しない。

## 2. 調査した既存資産と不適合

再利用する境界:

- `ProgramTemplateVersion`: 採用Skillが対応するProgram版
- `ProgramMissionAssignment`: 対象Missionと参加者単位の実行境界
- `ProgramActionEvent`: `HELP_REQUESTED`、`MISSION_COMPLETED`、`MISSION_SKIPPED`、`TRAINING_WORK_RESULT_RECORDED`等の既存履歴
- `TrainingSkillEvaluation`: Mission回答の既存Skill評価
- `ProgramAuditLog`: 将来の管理操作監査の再利用候補
- `@bunshin/capability-training`のSkill Factory V1 Pure Contract

保存先として再利用しないもの:

| 候補                             | 採用しない理由                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `TrainingToolkitItem`            | 参加者本人が合格済み回答から保存する個人成果物であり、Serviceが採用する運用Skillとは所有者・保持目的が異なる                               |
| `ProgramActionEvent.metadata`    | append-onlyの出来事であり、現在有効な版、排他、停止、rollbackを安全に表せない。Skill本文をJSONへ埋め込むと契約・検索・保持境界も曖昧になる |
| `ProgramTemplateVersion`本文     | 公開済みProgram定義を後付けで可変にせず、Skillの採用・停止・rollback履歴を分離する必要がある                                               |
| Bunshin Memory / Owner Knowledge | AI研修EnrollmentはBunshinを必須とせず、暗黙共有はIsolation原則に反する                                                                     |
| 共通Skill Registry               | AI研修以外で同一責務が確認されておらず、MVP Firstに反する                                                                                  |

## 3. 所有・適用境界

採用Skillの所有境界は`Workspace + Service`とする。V1の適用対象はさらに次の全てが一致する場合に限定する。

- `programTemplateVersionId`
- `missionDefinitionKey`
- `learningObjectiveKey`
- `assignmentVariant`

別Workspace、別Service、別Program版、別Mission、別learning objective、別variantへ自動転用しない。EnrollmentやUserを所有者にせず、個別参加者の回答・自由入力・MemoryをRegistryへ保存しない。

採用操作時はPure Contractの内部scopeでWorkspace、Service、Enrollment、Assignment、Program版、Mission revisionを照合する。ただし採用後のportable Skill本文にはEnrollment、Assignment、User、Bunshinのraw IDを含めない。

## 4. 推奨保存モデル

次の永続モデルをPersistence PRで追加する。共通Coreや他PackageのRegistryへ昇格させない。

### 4.1 `TrainingSupportSkill`

Service内の論理Skill identityを表す。

```text
id
workspaceId
serviceId
skillKey
programTemplateVersionId
missionDefinitionKey
learningObjectiveKey
assignmentVariant
currentVersionId nullable
operationalStatus ACTIVE | SUSPENDED | RETIRED
revision
createdAt / updatedAt
```

一意境界は`workspaceId + serviceId + skillKey`とし、lookupではProgram版・Mission・objective・variantを必ず再照合する。`currentVersionId = null`または`SUSPENDED / RETIRED`ならfail-closedとし、Skillを適用しない。

### 4.2 `TrainingSupportSkillVersion`

人間承認済みのimmutable versionを表す。

```text
id
trainingSupportSkillId
version
disposition APPROVED | ACTIVE | DEPRECATED | REVOKED
artifactContractVersion
validationPolicyVersion
sourceProblemId / sourceProblemRevision
sourceSkillDraftId / sourceSkillDraftRevision
sourceArtifactId / sourceArtifactRevision
scopeFingerprint
contentDigest
steps
expectedOutput
successCriteriaKeys
barrierReasonCode nullable
approvedByUserId
approvedAt
deprecatedAt / revokedAt nullable
createdAt
```

本文はPure Contractの安全なArtifact projectionだけを保存する。回答本文、自由文、写真、会話、Memory、Token、secret、Provider raw response、直接User/Bunshin IDを含めない。`approvedByUserId`は監査主体でありSkill入力へ投影しない。

version行は作成後に本文を書き換えない。修正は新versionとして作成する。`REVOKED`は安全上再利用不可、`DEPRECATED`は既定利用停止だが明示rollback候補として再審査できる状態とする。

### 4.3 `TrainingSupportSkillActivation`

どのversionをいつ有効にしたかをappend-onlyで記録する。

```text
id
workspaceId / serviceId
trainingSupportSkillId
skillVersionId nullable
operation ACTIVATE | SUSPEND | ROLLBACK | RETIRE
priorSkillVersionId nullable
reasonCode
expectedSkillRevision
idempotencyKey
actorUserId
rollbackCompatibility nullable（ROLLBACK時だけ全5軸PASSED）
occurredAt
```

Skill本体のcurrent version更新、旧versionの`DEPRECATED`化、Activation追加を一つのtransactionで行う。監査保存に失敗した場合は全体をrollbackする。同一Service行とSkill行をlockし、権限失効や同時承認とのcommit順序を固定する。

### 4.4 Persistence Contract実装

`@bunshin/capability-training`の`skill-lifecycle.ts`に、永続実装へ依存しない次を追加する。

- Service-owned scope、Skill、immutable version、Lifecycle Eventの型
- 初回採用と同一scopeへの次version承認
- 明示activation、suspend、全互換軸PASSED時だけのrollback、revoke、retire
- ACTIVEな`SERVICE_OWNER / SERVICE_ADMIN`、expected revision、固定reason code、idempotency keyの検査
- find、adoption保存、CAS transition保存のRepository Port

承認済みversionは自動で有効化せず、初期状態を`SUSPENDED + currentVersionId null`とする。

Persistence実装は、Serviceと管理Membershipをlockして現在のACTIVE権限を再確認し、Skill revisionのCAS、version更新、append-only監査をSerializable Transactionへまとめる。`contentDigest`はRepositoryがcanonicalな保存projectionからSHA-256を再計算し、外部入力値をそのまま信頼しない。rollback互換性5軸はLifecycle EventとDB監査へ保存し、全軸PASSED以外をPure ContractとDB制約の両方で拒否する。

### 4.5 Admin Adoption実装

Service管理者向けに、review packageの読み取り専用preview、人間承認、明示activation、suspend、rollbackのAPI / UIを追加した。承認とactivationは別操作であり、承認直後は`SUSPENDED + currentVersionId null`を維持する。この管理境界からDelivery、Exposure、Provider呼出しは行わない。

review packageのWorkspace / Service、Program Enrollment、Mission Assignment、`HELP_REQUESTED` Event、Program版、Mission、rule、variantは、認証済みService scope内の実レコードからサーバー側で再構築する。クライアントが指定したscope、event種別、Program版を信用しない。learning objective等、現行DBから独立検証できない内容は人間review packageに残し、Pure ContractでDraft / Artifact間の不変条件を再検証する。Problem / Draft専用tableは追加しない。

### 4.6 限定Service Exposure Pilot実装

Service管理者が、ACTIVEなSkillと対象ServiceProgramの組合せを明示確認した場合だけ、`ServiceProgram.settings.trainingSupportSkillExposurePilot`へ`trainingSupportSkillId + learningObjectiveKey`のbindingを保存する。既定値は無効であり、Skillのapprove / activateだけでは参加者へ提示しない。設定変更は`ProgramAuditLog`へ記録する。

参加者が既存Missionで「困った」を選んだ時だけ、Workspace、Service、Program版、Mission、assignment variant、明示binding、Skillの`ACTIVE`、current versionの`ACTIVE`、activation履歴を同一transaction内で再確認する。候補が0件または複数、設定不正、scope不一致の場合はSkillを提示せず、既存の汎用ヘルプへフォールバックする。実行時表示文から`learningObjectiveKey`を推測しない。

提示した場合は、`HELP_REQUESTED` Eventをsourceとする`TRAINING_SUPPORT_SKILL_PRESENTED` Eventを同一transactionで保存してから、承認済みsteps / expected outputだけを返す。metadataにはSkill ID、version ID、activation ID、Mission key、learning objective key、提示時刻のみを保存し、本文・steps・回答・User IDを複製しない。Provider呼出し、外部AI実行、課金、Outcome集計、自動改善は行わない。

rollback互換性5軸のUI初期値は全て`UNKNOWN`とし、全軸を人間が`PASSED`へ変更した場合だけ要求を送信できる。API、Pure Contract、DB制約も全軸`PASSED`以外を拒否する。未確認条件を自動で`PASSED`へ補完しない。

## 5. 採用条件

採用は次の全条件を満たす場合だけ可能とする。

1. actorが対象ServiceでACTIVEな`SERVICE_OWNER`または`SERVICE_ADMIN`
2. Problemが`APPROVED`で期限内、取消されていない
3. Feasibilityの全軸が`PASSED`
4. Validation Receiptが`VALID`
5. Problem、Draft、Artifact、Program版、Mission、objective、variant、revisionが一致
6. Artifactが5 steps、各200文字、4 KiB以内
7. 外部AI費用0円、automatic delivery falseのV1境界を維持
8. idempotency keyが未使用、または同一入力の再送

Validation成功、`HELP_REQUESTED`、管理画面の閲覧を採用承認とみなさない。採用とactivationは別操作に分けてもよいが、どちらにも同じService権限とrevision確認を要求する。

## 6. 状態遷移と停止

```text
validated Draft
  -> human approval
  -> APPROVED version
  -> explicit activation
  -> ACTIVE version
  -> DEPRECATED  (new version activation / explicit stop)
  -> ACTIVE      (explicit rollback after revalidation)

ACTIVE / APPROVED / DEPRECATED
  -> REVOKED     (unsafe; irreversible by ordinary operation)

Skill operationalStatus
  ACTIVE -> SUSPENDED -> ACTIVE
  ACTIVE / SUSPENDED -> RETIRED
```

- `SUSPENDED`: 新規適用を即時停止する可逆のkill switch。current versionと履歴は保持する。
- `DEPRECATED`: 新規適用の既定対象から外す。過去のExposureとOutcome参照は保持する。
- `REVOKED`: 安全上使用不可。通常rollbackで再有効化しない。
- `RETIRED`: 論理Skill全体を廃止する。履歴を物理削除しない。

Problem / Draftの7日期限は採用判断の期限であり、採用済みversionを7日後に自動削除する意味ではない。採用済みversionのreview期限は、実Outcomeが得られるまで本書では確定せず`UNKNOWN`として扱う。

## 7. Rollback契約

rollbackは行削除、version本文の上書き、旧Deploymentへの復帰ではない。以前のimmutable versionを新しいActivationとして明示的に再選択する操作である。

rollback前に次を再確認する。

- actorの現在権限
- Workspace / Service / Skill scope
- expected revisionと現在のactive version
- 対象versionが`REVOKED`でない
- 現在のProgram版、Mission、learning objective、variantとの互換性
- 現行validation policyによる再検証
- 固定reason codeとidempotency key

いずれかがUNKNOWNならrollbackせず`REVIEW_REQUIRED`とする。障害時の最初の操作は`SUSPEND`で新規適用を止めることであり、履歴やOutcomeを消去しない。

## 8. Outcome測定

### 8.1 現状の結論

既存Eventだけでは、参加者へどのSkill versionが実際に提示されたかを識別できない。このため`HELP_REQUESTED`後の`MISSION_COMPLETED`や`TRAINING_WORK_RESULT_RECORDED`だけからSkill効果を断定しない。

Deliveryを実装する後続PRでは、既存`ProgramActionEvent`へ最小のExposure Eventを追加する設計を推奨する。

```text
eventType: TRAINING_SUPPORT_SKILL_PRESENTED
scope: workspaceId / service(groupId) / enrollmentId / assignmentId
metadata:
  schemaVersion
  trainingSupportSkillId
  skillVersionId
  activationId
  missionDefinitionKey
  learningObjectiveKey
  presentedAt
```

本文、steps、回答、Barrier自由文、User/Bunshin IDをmetadataへ複製しない。限定Service Exposure PilotでこのEventを実装済みとし、Outcome評価は後続Phaseに残す。

### 8.2 V1 Outcome

同一Service・Program版・Mission・Assignment内でExposure後だけを対象にする。

Primary Outcome:

- `HELP_REQUESTED`後、Exposureから7日以内かEnrollment終了までに`MISSION_COMPLETED`へ到達した割合

Safety / Negative Outcome:

- Exposure後の再`HELP_REQUESTED`
- `MISSION_SKIPPED`
- Skill versionの`SUSPEND / ROLLBACK / REVOKED`
- Validation mismatchまたはscope mismatchによる適用拒否

Secondary Outcome:

- 完了後の`TRAINING_WORK_RESULT_RECORDED`が`USED_AS_IS`または`USED_WITH_EDITS`
- 既存Skill評価で対象skill keyが`REVIEW`から`PASS`へ変化した事実

これらはSkill versionとの相関であり、ランダム化比較なしに因果効果と表現しない。別Service・別Workspaceを合算せず、少数データから個人を推定しない。回答本文や自由文をAnalytics入力にしない。

### 8.3 Baselineと自動改善禁止

Baseline候補は、同一Service・同一Program版・同一Missionで、Skill導入前に`HELP_REQUESTED`が記録されたAssignmentの既存Eventである。期間、最小件数、除外条件は運用Pilot設計で人間が確定するまで`UNKNOWN`とする。

Outcome悪化時も自動でversion変更、rollback、Draft再生成、Provider呼出しを行わない。指標は人間レビューのEvidenceであり、採用・停止の権限ではない。

## 9. 保持・削除・監査

- Registry本文はService-owned assetであり、参加者回答を保存しない。
- 参加者Enrollmentへの直接参照をRegistry本文へ持ち込まず、provenanceはProblem / Draft / ArtifactのID・revision、scope fingerprint、content digestに限定する。
- Exposure Eventは既存AI研修Eventの保持・本人削除方針に従う。Registry履歴と個人Eventの保持期間を同一とみなさない。
- 個人Eventが削除・匿名化された後にRegistryから個人を逆算できる設計にしない。
- 採用、activation、suspend、rollback、revoke、retireはactor、scope、revision、固定reason codeを監査する。自由記述reasonを保存しない。
- migration適用後のrollbackで履歴tableを自動削除しない。停止を先に行い、必要なschema変更はforward-fixとして別承認する。

## 10. Genspark Test

Skill本文そのものは巨大AIでも生成可能であり、単独では差別化にならない。Platform側の価値は、Service固有のProgram版・Mission・objectiveに結びついた承認済みversion、適用履歴、Outcome、停止・rollback判断を所有境界内で保持することにある。

Provider性能が向上してもDraft候補の品質向上として吸収し、Registryの所有、承認、version、Exposure、OutcomeはProviderから独立させる。外部AIが同等の支援文を生成できても、権限・履歴・Outcome・改善判断を安全に運用する残りの価値があるかをPilotで確認する。

## 11. 後続PRの分割案

1. Persistence Contract: package内の状態遷移、Repository Port、認可・revision・idempotencyのPure Contract。DBなし。実装済み。
2. Persistence: additive schema / migration / Prisma Repository / 実DBIsolation・競合・rollbackテスト。HTTP/UIなし。実装済み。
3. Admin Adoption: 明示的なreview・approve・activate・suspend・rollback API/UI。Deliveryなし。実装済み。
4. Exposure Pilot: 限定Serviceでの提示と`TRAINING_SUPPORT_SKILL_PRESENTED`記録。Providerなし。実装済み。
5. Outcome Review: 最小件数と期間を人間承認後、既存Eventからread-only集計。自動改善なし。

各PRは前段の人間承認後に開始し、積み重ねたまま本番接続しない。

## 12. 停止条件と次Phaseへ進める条件

本Exposure Pilot PRで停止する。次は実装しない。

- Problem / Draftの永続化
- Outcome集計、Outcome判定
- Provider、Codex API、外部実行、課金
- 自動生成、自動採用、自動rollback、自動改善
- 共通Core、ハッシー、他Packageへの横展開
- Merge、Deploy

次Phaseは、本Exposure Pilotを人間が承認し、本番で十分な観測期間と最小件数を満たした後、既存Eventからのread-only Outcome Reviewを独立PRとして検討する。Provider接続、外部AI実行、課金、自動改善には進まない。

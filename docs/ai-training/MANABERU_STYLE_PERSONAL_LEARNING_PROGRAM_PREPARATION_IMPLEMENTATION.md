# マナベルスタイル — 期限なしPersonal Learning専用Program準備

基準main: `bf54c23ed5cd3282f104450e90bd421fb57f03c2`。branch: `codex/personal-learning-dedicated-program`。commitは本PR headを参照。

## 調査・判断

従来のINITIALIZEは既存ServiceProgramを停止・隔離する操作であり、Programを作成しない。さらに公開版がcreateAiTrainingV1Definitionと完全一致することを要求するため、新規Serviceでは旧30日Templateの採用が事実上前提だった。

ユーザー方針「30日研修の期限設定は不要」に合わせ、新規専用Programを直接作成するCREATE_PROGRAMを既存trusted操作へ追加した。ProgramDefinitionの既存OPEN_ENDEDを再利用し、新schema/package/管理UIを作らない。既存V1 Definition・INITIALIZE互換経路は変更しない。

## 最小契約・正本

- endpoint: `GET/POST /api/services/{serviceSlug}/ai-training/pilot-operations`。
- Server authority: PERSONAL_LEARNING_PRODUCTION_PREPARATIONのworkspaceId/groupId/serviceProgramId。新規Program IDは事前予約したlowercase UUID。Clientからauthority/settings/期限/Definition本文を受け取らない。
- 必須flag: PERSONAL_LEARNING_PILOT_OPERATIONS=true。CREATE_PROGRAM時はPERSONAL_LEARNING_PILOT/PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOTが両方OFF。
- GETでProgram未存在をexists=false/status=ABSENTと返す。対象scopeとABSENTからSHA256 stateTokenを作る。別scopeの既存Program IDは404。
- POSTはaction=CREATE_PROGRAM、operationId、expectedStateToken、confirmation=CONFIRM_PILOT_OPERATION、reviewEvidenceKeyのみ。確認記録識別子だけ保存し、相談本文/成果物本文を保存しない。

## 作成されるもの

同一Transaction内で、Service所有PRIVATE ProgramTemplate、構造版PUBLISHED ProgramTemplateVersion、指定IDのSUSPENDED ServiceProgram、無料INVITATION_ONLY/GUIDED ProgramOffering、操作Auditを作成する。

Programはduration=OPEN_ENDED。OfferingのstartsAt/endsAtはnull。supportModesはGUIDEDのみで完成品代行モードを追加しない。personalLearningPilot.enabled=false、enrollmentIds=[]、notificationsEnabled=false、postponedReminderEnabled=falseを作成時から保持する。

構造版PUBLISHEDはLearning DefinitionのHuman Approvalと別。既存PROMPT_BASIC/PROMPT_CONDITION Missionへの参照だけを持ち、PROMPT_STRUCTURE/CONTEXT_SETTING/CONSTRAINT_SETTINGの3 review fixtureは自動承認しない。教材・Definition追加・Provider呼出しなし。

既存ProgramDefinition必須のphase startDay/endDay=1、schedule、notification cadenceは互換参照metadata。1日修了/30日期限ではない。進行はConfirmed Plan/Routerが決める。停止中のProgramは実行されず、Pilot markerにより既存V1 Runtime/LINE候補から除外される。

## Tenant Boundary・同時実行・再送

既存認証/同origin POST、現在Serviceの管理権限に加え、RepositoryでACTIVE Workspace/User/GroupとSERVICE_OWNER/SERVICE_ADMIN Membershipを再検証。Group行lockとSerializable Transaction、ABSENT stateToken CASで同時作成を制御する。

同一Serviceに既存AI_TRAINING_V1 Program（停止/終了を含む）があれば新規作成を拒否。固定authority IDが別scopeに存在しても拒否。旧Programへのmarker後付け・上書き・参加者自動変換なし。

同一operationId/body/actorの再送はAudit receiptからreplay。同じIDで変更body、別operationで既存Program作成はPILOT_PROGRAM_ALREADY_EXISTS。古いtokenはPILOT_STATE_CHANGED。DB競合はPILOT_CONCURRENT_OPERATION。Commit直前にflag/authority guardを再検証し、失効時は全作成をrollbackする。

## 作成後の別Gate

新規ProgramはINITIALIZE不要。人間レビュー後、CONFIGURE→PREPARE_ENROLLMENT→INTERNAL Seat→本人Profile→Definition承認→START等の既存Gateを使う。PREPARE_ENROLLMENTは固定終了日を追加しない。詳細は [Wave 0 Runbook Phase E/F](MANABERU_STYLE_PRODUCTION_WAVE0_LAUNCH_RUNBOOK.md)。

このPRは本番設定を開始する承認ではない。Production Deploy/authority設定/CREATE_PROGRAM実行/Definition承認/参加者登録/START/実課金はすべて未実施。

## 変更ファイル

- application: `src/personal-learning-pilot-operations.ts`、同名test（bounded action追加）。
- capability-training: `src/personal-learning-program-definition.ts`、`src/index.ts`、`test/personal-learning-program-definition.test.ts`（期限なし参照shell）。
- database: `src/personal-learning-pilot-operations.ts`、`test/personal-learning-persistence.integration-cases.ts`（trusted作成・DB統合ケース）。
- web: `src/http/personal-learning-pilot-operations.ts`、同名test（既存Server Gate維持）。
- docs: 本報告、Wave 0 Runbook、Pilot Operations報告の後続注記、DECISION_LOG。

schema/migration/UI/LINE/Provider設定変更なし。

## 検証

- capability-training全体: 25 files / 288 tests PASS。
- application bounded operation: 16 tests PASS。
- Web operations/LINE isolation/preparation access/participant admin: 4 files / 43 tests PASS。
- DB integration追加: stopped/open-ended作成、旧Program非変更、承認/Seat/Enrollment非作成、再送/改ざん/二重作成拒否、CAS、cross actor/service、commit前失効rollback、同時作成、期限なしEnrollment準備、30日経過後の3Definition Mission/Assessment/Router完走。
- DB integrationは本番DBでは実行しない。実PostgreSQL・全format/typecheck/lint/test/buildはPR CIのverify/database結果を採用SHAに対応させて確認する。追加ケースの記載だけでPASSとは扱わない。

## 未実装・Rollback

管理UI追加、本番設定・配備、参加者準備、Human Definition Approval、Pilot Enable、実Provider、次Phase機能には進まない。

コードrollbackは当該commitをrevertしてPR化。作成済み本番データが将来存在する場合、先に既存STOP/実行flag OFFで停止し、データを削除しない。旧版コードは新CREATE_PROGRAMを理解しないため、操作経路とauthorityをレビューして切り戻す。DB destructive rollback不要。

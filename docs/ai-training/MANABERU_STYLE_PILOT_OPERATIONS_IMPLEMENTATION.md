# マナベルスタイル Pilot運用操作

基準main: `2eca1605dee56d1a8f7834f87be5b0c9cffd73ab`。branch: `codex/personal-learning-pilot-operations`。commitは本PR headを参照。

## 範囲と判定

空の専用Program初期化、停止中の内部Enrollment準備、Wave 0開始準備、緊急停止を追加する。本番操作の承認ではない。Productionは引き続き **NO-GO**。DB/schema/migration、UI、Provider追加、既存V1/LINE処理の変更なし。Definition承認、Seat付与、Profile、Goal、Planを自動作成しない。

## APIと認可

`GET/POST /api/services/{serviceSlug}/ai-training/pilot-operations`。管理者の既存session、同origin POST、queryなし、JSON 2KiBまで。新しいserver flag `PERSONAL_LEARNING_PILOT_OPERATIONS=true` と既存 `PERSONAL_LEARNING_PRODUCTION_PREPARATION` のworkspaceId/groupId/serviceProgramIdによる単一authorityが必要。既定は無効。

RepositoryでもACTIVE Workspace/User/Service、同ServiceのACTIVE SERVICE_OWNER/SERVICE_ADMIN、正確なProgram scopeを再認可。Group→Programのlock順、Serializable transaction、commit直前の環境guardを使用する。クライアント指定のworkspace/userを信頼しない。

GETはstateToken/status/initialized/enabled/openCallCount/drainStatusを返す。tokenはProgram id/status/settingsのcanonical SHA256で、Seat設定のrevision変更も競合として扱う。読み取りは更新せず、一貫性のため短時間lockを取得する。

POST共通body（実値・秘密は掲載しない）:

```json
{
  "action": "STOP",
  "operationId": "<new-lowercase-uuid>",
  "expectedStateToken": "<GET data.stateToken>",
  "confirmation": "CONFIRM_PILOT_OPERATION",
  "reviewEvidenceKey": "wave0-human-reviewed-operation"
}
```

actionはINITIALIZE/PREPARE_ENROLLMENT/START/STOPのみ。PREPARE_ENROLLMENTに限りgroupMembershipId/programOfferingIdを追加する。reviewEvidenceKeyは人間の承認記録への識別子であり、承認内容や相談本文を保存するfieldではない。CookieやAPI keyをCLIへ転記しない。管理者がログインした同originブラウザ等のレビュー済み操作経路を利用する。

## OFFを先に確保する

STOPは実行flagや準備flagがONでも利用可能。marker/moduleKey/allowlist/participantControlを残してProgramをSUSPENDED、enabled=false、通知falseにする。Seat/Enrollment/Goal/Plan/Answerを削除しない。STOPのみ古いstateTokenを許容し、必ずlock後の最新settingsを保全する。破損した操作revisionも停止を妨げず、before tokenと監査を残して操作revisionを再初期化する。

運用flagとauthorityは停止担当が到達できる状態で維持する。これらを閉じるとSTOP APIも拒否される。通常の準備flag3つを閉じることと、停止経路を閉じることを混同しない。全instance/旧deployment URLの反映と到達性は別の人間Gate。

STOPは送信済みProvider callの取消ではない。lock待ち・進行中transactionがあり得る。openCallCount=0でもdrainStatusは常にUNKNOWN。Job/lease/送信済みcall/返却後保存を別に追跡し、TTL解放や台帳の手編集でdrainを偽装しない。

## 準備・開始の順序（今回未実行）

1. Migration/backup/deploy/既存V1 smokeの承認と検証を先に完了する。両実行flagはfalse。
2. 人間が既存のProgram採用手順で専用Serviceに空のAI_TRAINING_V1 Programと無料INVITATION_ONLY/GUIDED Offeringを準備する。既存Enrollmentを持つ旧V1や同Serviceの他AI研修Programは流用不可。
3. GET→人間レビュー→INITIALIZE。公開Template版が既存AI Training V1 Definitionと完全一致、Enrollmentゼロ、同Serviceに他AI研修Programがないことを要求する。SUSPENDED/marker/enabled=false/通知falseへ移行する。
4. 既存pilot-participants APIでCONFIGURE。currentWave=0、externalCap=100、internalCap=1または2を人間承認。currentWaveCapは0。
5. GET→PREPARE_ENROLLMENT。ACTIVE Participant/Userと同ProgramのACTIVE無料Offeringを検証。停止中にGUIDED Enrollmentを作成し、Goalは空、期間終了は自動設定しない。累計Enrollment数はinternalCap以内。Seat未付与なのでまだ利用不可。
6. 既存pilot-participants ADMITでINTERNAL Seatを明示付与。本人が既存Profile Preparation UIで必要最小限の回答と確認を行う。管理者の代行Profileは開始条件を満たさない。
7. 人間が3Definitionのexact versionを既存Approval APIでレビュー・承認する。自動承認なし。
8. Providerの既存実modelとCall Admission/価格登録を人間確認。新APIはruntime設定を解決するだけでProvider HTTPを送信しない。
9. Definition/Profile/Participant準備flag3つをfalse。運用flagとauthorityはSTOP用に維持。実行flag2つはまだfalse。
10. GET→人間最終レビュー→START。承認済みDefinition、本人Profile初期化event、内部ACTIVE Seat1〜2、allowlist、ACTIVE EnrollmentとUser、Admission exact scope、外部Seatゼロ、未settled callゼロを再確認する。DB status=ACTIVE/enabled=trueとなるが実行flagは変更しない。
11. Release Gate全項目PASS後、人間が別承認で両実行flagをONにする。全instance反映/実認証/E2E/Kill Switch試験は別工程。API START成功だけで本番利用を承認しない。

Wave 1以降の開始は本API対象外。設定変更・増員は停止して既存準備操作と別レビューを利用する。

## 冪等性・監査・境界

同operationId/actor/bodyはreceiptを再利用し、Enrollment/監査を二重作成しない。異なるbody/actorで同IDは拒否。停止後の古いSTART再送はPILOT_OPERATION_SUPERSEDEDで拒否し再開しない。再開後の新しい緊急STOPは必ず新UUIDを使う。旧STOPの再送は過去receiptと現在snapshotの返却であり、新しい停止操作ではない。通常操作の古いtokenはPILOT_STATE_CHANGED、競合transactionはPILOT_CONCURRENT_OPERATIONとして再GET/再レビューを要求する。

`program_audit_logs` action=PILOT_OPERATION_<UUID>にaction、body digest、reviewEvidenceKey、before/after token、status/revision、必要時Enrollment IDのみ保存。相談/成果物/Profile本文/Provider responseを保存しない。既存Program/Enrollmentが正本で、新しい状態テーブルや二重正本を作らない。

## 検証

Application全836件、Database単体851件、AI Training Package285件、Web Gate/Provider/LINE回帰84件と追加後の操作API11件、architecture check/test 10件、変更コードlint/format、application/database/webの型チェックは成功。

隔離PostgreSQL16/Node24で実DB統合163ケースを検証。全件実行では162件成功、既存P1-H同時100/101登録ケースのみ30秒timeout。同ケースを他検証終了後に単独再実行し成功（test部分9.09秒）。従って全ケースに成功証跡があるが、全163件が一回で成功したとは報告しない。初回beforeAll 10秒timeout、次の実行の既存回帰2件5秒timeoutも記録する。安全preflightを省略せず、再実行はhookTimeout=60000/testTimeout=30000。既存case固有の30秒制限/CI設定は変更していない。本番DBでは実行しない。buildとCI一括検証はPRのCIで確認し、未完了をPASSとしない。

追加DBケースは空Program限定/旧V1拒否、CAS、Enrollment再送・重複・外国scope拒否、競合登録、内部準備cap、未承認Definition、本人Profile event不足、Admission不足、開始後停止、古いSTART再送拒否、破損revision時の停止、権限失効。合成データだけを用いる。

## 変更ファイル

- application: `src/personal-learning-pilot-operations.ts`、公開`src/index.ts`、`test/personal-learning-pilot-operations.test.ts`。
- database: `src/personal-learning-pilot-operations.ts`、公開`src/index.ts`、`test/personal-learning-persistence.integration-cases.ts`。
- web: `src/http/personal-learning-pilot-operations.ts`、`app/api/services/[serviceSlug]/ai-training/pilot-operations/route.ts`、`test/personal-learning-pilot-operations.test.ts`。
- docs: 本報告、Wave 0 Launch Runbook、`docs/DECISION_LOG.md`。

## 残事項・rollback

本番schema未適用、採用release/実価格/予算/backup復元/RTO/実認証/全instance停止/drainは別Gate。ProductionでのProgram/Enrollment/Seat/Profile/Approval設定は今回一切行わない。既存Work Result/Toolkit・Teaching・新Definition・Wave拡大は対象外。

Rollbackは最初にSTOPと実行flag OFF、既存V1正常確認とデータ保全。未送信処理拒否を確認後、送信済みcallを個別追跡する。DB rollback不要。Application rollbackでもreserved markerを削除しない。運用endpointを持たない旧版へ戻す前に代替停止経路を人間承認する。

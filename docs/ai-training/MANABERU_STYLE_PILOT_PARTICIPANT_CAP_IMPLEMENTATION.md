# マナベルスタイル P1-H: cumulative participant Hard Cap / Wave Control

## 基準・範囲

- 基準main: `a224b53477c600688107b451e99ed11ed4a25441`（#1161）。
- branch: `feat/personal-learning-pilot-participant-cap`。commit / PR / CIは本報告を含む最終headを正本とする。
- P1-Hのみ。Enrollmentを作成するAPIではなく、既存EnrollmentへのPilot参加権付与・取消・人数設定APIを追加。
- Production DB接続、Migration適用、deploy、設定変更、実Participant登録、Definition承認、Pilot enable、Provider課金、Wave 0開始、募集は未実施。

## participant正本 / count

正本は`PersonalLearningPilotSeat`。`Workspace + Service + 固定Program + unique User`を一人と数える。UserはProgram単位のSHA-256 participant digestで識別する。digestは仮名化情報であり匿名ではない。同一Userのログイン、再送、別operationはseatを増やさない。別Userアカウントが同じ自然人かどうかを自動推定しない。モニター募集時に人間が重複本人を確認する。

外部`EXTERNAL`と内部`INTERNAL`は分離。TESTという自己申告で外部枠を除外しない。合成testは使い捨てDBだけ。internal分類はtrusted管理者の明示操作のみ。内部の運用人数は未承認で、未設定/0では登録不可。外部100とは別の有限設定（技術検証0〜100、推奨運用1〜2等は別承認）を必須にし、本番既定の5人等を勝手に採用しない。内部設定が大きければそのまま運用してよいという承認ではない。

ACTIVE Enrollment・ACTIVE PARTICIPANT・ACTIVE User・利用期間を再検証して付与する。招待だけでは参加者にならない。CANCELLED/REVOKED/期間終了でも既付与seatは累計に残す。取消seatの再付与・再利用・User/Enrollment差替えは実装しない。Program削除・authority差替えで枠をresetする運用は禁止し、別Release Gateにする。

## absolute cap / wave cap

`ABSOLUTE_EXTERNAL_PILOT_CAP = 100`。設定上限500/101等を拒否し、DBでも`seat_number BETWEEN 1 AND 100` + Program/kind/slot uniqueで101個目の外部slotを作れない。

Program settingsの既存`personalLearningPilot`へ`participantControl`だけを追加する。version / revision / externalParticipantCap / internalParticipantCap / currentWave / currentWaveCapの厳格な契約。不正・未知field・上限未設定は拒否。外部capを100未満へ絞ることは可能だが100を超えない。

Waveは累計上限:

| Wave | 外部累計cap     |
| ---- | --------------- |
| 0    | 0（内部枠のみ） |
| 1    | 5               |
| 2    | 20              |
| 3    | 50              |
| 4    | 100             |

完了数で自動昇格しない。全変更は確認文・reviewEvidenceKey・expectedRevision・operationId付きの人間操作。消費済み人数よりcapを下げる変更も拒否。設定の人間承認は別途運用責任者が行う。APIが呼べるだけで全Gate PASSとはしない。

## concurrency / idempotency / revocation

Group → Programの同じlock順序、Program FOR UPDATE、Serializable transaction内で再認可・count・insert・allowlist投影・revision更新・監査を行う。99人で同時申請しても一方だけ成功し、もう一方はCONFLICT。全台帳slotはunique。CAS競合時は更新されたrevisionをGETして人間が再確認する。自動retryで違う対象へ登録しない。

operation UUIDは既存`ProgramAuditLog`へ固定command digest / actor / receiptとともに保存。同一body再送は既存receiptでseat二重消費なし。別body / actorの同じoperationは拒否。再送でも現在の停止状態・管理権限を再検証。取消後の古いADMIT再送は拒否。

取消はEnrollmentを消さずrevokedAtを保存し、allowlistから除去。現在のPilot repository / Router / Assessment Gate / Call Admissionでseatを再検証。稼働中はこの準備APIを閉じるため、取消はKill Switch・処理drain・Program停止後の操作。既に送信されたProvider callを撤回できるとは主張しない。

## trusted API / tenant boundary

`GET / POST /api/services/[serviceSlug]/ai-training/pilot-participants`。

- 新しい既定無効flag `PERSONAL_LEARNING_PARTICIPANT_PREPARATION`。
- #1161のserver-owned `PERSONAL_LEARNING_PRODUCTION_PREPARATION`を全環境で必須にする。リクエストでWorkspace/Service/Program authorityを指定しない。
- 実session、Service resolver、SERVICE_OWNER / SERVICE_ADMIN、Same Origin、strict command、2KiB制限、非同期後の設定再確認。
- Pilot実行用の両flagがoff、固定Program SUSPENDED / Pilot disabled、通知停止、専用Service、同scope Enrollmentをtransaction内で要求。
- `CONFIGURE / ADMIT / REVOKE`のみ。GET無保存。Enrollment作成、Pilot enable、Definition APPROVE、Goal/Plan生成は行わない。
- 初回CONFIGUREは空allowlistだけ。旧5人allowlistの自動adoption/backfillは行わない。既存参加者がいれば人間が停止・棚卸し・移行手順を別レビューする。

## UI / Assignment / Provider Gate / V1

本番のPilot実行はcap契約なしの旧allowlistを拒否する。既存Web server entryとExecution Gateを維持し、DBのlive seatを再認可。allowlistを手編集しても正本のactive seatと一致しなければ実行拒否。自分のseat・Enrollment・Program・Userが完全一致する必要がある。

既存Provider Call Admissionを維持し、本番Admissionでもseatを必須とする。価格・モデル・token・金額規則を変更しない。LLM・Codex・新Providerは使用しない。新schemaがない場合はfail-closed。

非Pilot V1は既存経路。非本番の旧5人fixtureは回帰用に維持するが、本番のseat代替にはしない。LINE / Schedulerのreserved Program除外、Definition承認、Goal/Plan/Routerの意味、Assessment評価仕様は変更しない。

設定ミスによるV1 fallbackを防ぐため、cap導入済みProgramからmoduleKey / participantControl versionを除去する更新はDB triggerで拒否する。通常V1 Programは対象外。停止はflag off / enabled false / Program停止で行い、marker除去で停止しない。

## Privacy / Analytics

本文、相談、回答、成果物、Provider responseは保存しない。台帳はProgram単位participant digest・Enrollment参照・kind/cohort/slot・時刻だけ。既存auditにはoperation digest / reason / revision / reviewEvidenceKey等の構造化証跡だけ。

Wave別人数は台帳、First Success / Plan / REVIEW / RETRY / Fit / AI Costは既存EventとEnrollmentを同tenant内でjoinできる。新Dashboard / KPI自動評価は作らない。取消後も元cohortは変えない。

本人exportへseat概要を追加。ALL削除ではEnrollment参照をnull・seat失効・allowlist除去し、本文等の既存削除を維持。累計slot/digestは消費済み枠として残す（識別を推定可能な仮名化情報）。保持期間・本人説明・本番role/RLS・アカウント削除との整合はProduction Final Readinessで人間確認し、未確認をPASSにしない。

## schema / Migration

小さなtable一つ、Program scope FK cascade、Enrollment FK SET NULL、User digest / Enrollment / kind-slot unique、CHECK、RLS有効・public policyなし。物理Enrollment削除時の小さなtriggerも参加権失効・参照除去・allowlist除去・CAS revision更新だけを行い、累計枠を減らさない。Migration `20261006140000_personal_learning_pilot_seat`、schema readiness更新。既存table破壊・既存データDML・backfillなし。本番未適用。人数正本を巨大settings JSONや削除可能なEventだけへ置く設計は採用しない。

## test

- cap/wave/未知設定/101人/旧5人契約: ローカル23 tests成功。
- preparation/identity/承認/Profile/new participant HTTP: ローカル69 tests成功。
- 実PostgreSQL: 1/5/6、20/50/100/101、99→100競合、DB101slot拒否、duplicate、新operationのsame User、取消・履歴・正本との不一致、Wave CAS / 非自動昇格 / internal0 / foreign authority。
- P1-A〜F、V2/First Success、Call Admission、Auth、Privacy、LINE隔離、V1、build等の全体検証は最終CI headを正本にする。ローカル全体テストは負荷中にtimeoutがあり停止し、CIで再確認する。成功と偽らない。
- 実DBは既存preflight済み使い捨てCI DBだけ。Production / 実Providerを使用しない。

## Production適用前Gate / rollback / 停止

Wave 0はNO-GO。Migration履歴・backup・lock/time・RLS/実role・保持方針・専用scope・internal人数・Wave 0本人・実認証E2E・Definition人間承認・Profile・費用/監視・全deploymentのGate・旧版drainを別承認する。

停止は既存Kill Switchと準備flag off。台帳・旧Goal/Plan・履歴を削除しない。コードrollback時も全instanceでPilot off必須。旧コードをenabledで実行するとseat確認を迂回するため禁止。migration逆DROPやseat truncateで枠を戻さない。

P1-H完了後停止。Production Wave 0 Final Readinessは人間レビュー後の別指示を待つ。

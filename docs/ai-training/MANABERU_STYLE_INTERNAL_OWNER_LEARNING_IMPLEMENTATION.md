# マナベルスタイル — 所有者本人の内部学習

## 基準と目的

- 基準main: `ff64ccffd611c96215983969f2e409d2d69da2fb`
- branch: `codex/manaberu-internal-owner-learning`
- commit: 本書を含むPRのhead SHAを正本とする（自己参照SHAを記載しない）。
- 人間承認した目的: 同じアカウントのSERVICE_OWNER権限を保持したまま、本人が限定Pilotの内部テスターとして学習できるようにする。

Membershipは `(groupId, userId)` が一意であり、二重Membershipや所有者のPARTICIPANT降格を解決策としない。既存Goal/Plan/Assignment/Answer/Assessmentを利用し、新しい学習正本を作らない。

## 最小認可と変更ファイル

- `packages/database/src/personal-learning-pilot-seat.ts`: 共通認可 `requireTrainingLearnerRole`。PARTICIPANTは既存扱い。SERVICE_OWNERは本人Enrollment、専用AI_TRAINING_V1 Pilot契約、通知OFF、有効INTERNAL/cohort INTERNAL Seat、台帳/allowlist/人数制約一致を必須とする。SeatのFOR SHAREを維持する。他管理ロールは拒否。
- `packages/database/src/index.ts`: 公開export。他packageから内部srcを参照しない。
- `personal-learning-pilot-operations.ts` / `personal-learning-participant-admin.ts`: trusted PREPARE_ENROLLMENTで所有者本人を候補にできる。ADMITは所有者の場合INTERNALのみ。既存停止条件、固定authority、CAS、累計枠、冪等性、監査を維持する。
- `personal-learning-persistence.ts` / `personal-learning-pilot-profile.ts` / `personal-learning-ai-call.ts`: 本人の永続化・Profile・評価事実保存で所有者の有効Seatを再確認する。旧allowlist-only fallbackを所有者へ適用しない。
- `training-runtime-shared.ts` / `training-answer.ts` / `training-interaction.ts`: 自分の学習表示・回答・学習操作で限定所有者認可を利用する。旧V1 Schedulerのreserved Pilot除外は維持する。
- Web `personal-learning-pilot-access.ts`、Program page、`ai-training-evaluation.ts`、`ai-training-evaluation-queue.ts`、`training-answer-evaluation-job-handler.ts`: 候補ロールを所有者まで広げても、本人Seat認可なしでは開かない。workerは資格情報解決前にも再検証する。既存Provider送信直前認可・Call Admissionを変更しない。
- テスト: DB `personal-learning-internal-owner.test.ts` / `personal-learning-persistence.integration-cases.ts`、Web access/evaluation-period/job-boundary tests。
- 文書: 本書、Wave 0 Launch Runbook Phase F、Decision Log。

停止中Profile準備では契約確認用の一時projectionのみenabled=trueとする。保存設定は変更せず、実行flag・Program ACTIVE・Goal/Plan・Definition Approvalの実行Gateを代替しない。

## 検証

- ローカルNode 24: database / Web typecheck、architecture check、変更対象lint成功。
- Web関連7ファイル59件成功。Pilot access/HTTP、評価期間・worker境界、Provider Call Admission、LINE隔離を含む。
- DB所有者認可unit 9件成功。Seatなし/失効/EXTERNAL/別User/別Enrollment/lock不成立/旧V1/他管理ロールを拒否。
- 実DB回帰を2件追加: trusted停止中準備から本人Profile/START/STOP、保存済み3Definition Planから既存回答・合成Assessment・Router完了、Seat失効拒否、V1 Runtime非進入、所有者ロールとEnrollment ACTIVEの維持。
- 実DBケースはCIの隔離PostgreSQLで検証する。合成Assessmentであり実Provider/実課金の検証ではない。CI結果はPR checksを正本とし、未完了を成功扱いしない。

## 非変更・残課題

schema/migrationなし。新UI/API/Providerなし。既存学習画面のサーバー認可分岐だけ変更。所有者の管理権限、旧30日V1、LINE Schedulerを変更しない。相談/成果物本文の新保存なし。

本番操作、Participant/Seat登録、Profile回答、Definition承認、Pilot enable、実Provider呼出しは未実施。コード完了はWave 0開始可を意味しない。

一般PARTICIPANT向けの旧学習データexport/delete等の周辺機能を所有者へ一括開放していない。本人データ権利の操作経路はPilot開始前に別途確認し、不足は限定認可をレビューして対応する。全管理者を通常受講者へ広げる根拠にしない。

次工程はPRの人間レビューとCI成功。その後も本番反映対象SHAの選定（最新mainには別OEM変更を含む）、本番反映、trusted停止中Enrollment/INTERNAL Seat準備、本人Profile回答、Definition承認、START/実課金を各別Gateとして扱う。

## Rollback

所有者のSeatを取消またはPilot停止して学習を拒否する既存手段を利用する。既存Goal/Plan/Answerを削除せず、所有者を降格しない。コードrollbackは本PRをrevertする別レビュー。DB rollbackは不要。取消/停止の本番操作を本書作成で実行しない。

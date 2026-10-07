# Personal Learning Production Wave 0 Final Readiness

## 開始判定

2026-10-07 JST。Wave 0開始は **NO-GO**。P1-Hまでの実装と本番準備完了は別である。人数制御・呼出しAdmission・本番準備APIの再実装は不要だが、本番適用、実認可、Definition人間承認、本人Profile準備、費用設定と停止運用の証拠が必要。

対象は内部1〜2人の開始前監査。staging配備は必須ではない。本番DB接続、Migration適用、deploy、設定変更、承認、参加者登録、Provider呼出しは行わない。コード・schema・UI・既存V1も変更しない。

## mainと本番反映

- 基準main: `6575276b9139c3b8c24bc87e351b374a916dd81d`。
- [#1162](https://github.com/team478a/bunshin-platform/pull/1162)は2026-10-06T18:10:58Zにmerge（JST 10月7日）。
- P1-H最終head `e14e74ba6dfe06bdd40089ed789f81ded08a632d`の[CI](https://github.com/team478a/bunshin-platform/actions/runs/37475213665)はverify/database成功、DB統合155件。
- merge mainの[CI](https://github.com/team478a/bunshin-platform/actions/runs/37509321180)は監査時database成功、verify実行中。最終状態はリンク先で確認し、release候補変更時は再検証する。
- `origin/production`は `87c5fafcdf9b84c67dd33aef41860368415ca789`。
- GitHub最新Production deployment ID `6863375278`は同SHA、2026-10-05T15:43:24Z作成、status success。公開aliasの実SHA・実環境疎通の証明ではない。
- production→main差分は142 files、Git差分のMigrationは3件。P1-A以降を含むためP1-Hだけを本番差分とみなさない。実DBのpendingとは別でありrelease直前に再照合する。

## Release Gate

PASSには対象SHA、日時、担当者、アクセス制限された証拠が必要。UNKNOWNをPASSで埋めない。

| Gate               | 実装と自動検証                                                    | 本番判定と残条件                                                                         |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A Code CI          | P1-H最終CI成功、merge main database成功                           | UNKNOWN。merge main verify完了とrelease全差分レビュー                                    |
| B Migration Safety | 追加3 Migration、readinessはseat版                                | UNKNOWN。実pending/失敗履歴、backup/隔離restore、lock時間、実role/RLS、旧アプリ互換性    |
| C Isolation        | server scope、live seat、Assessment Gate、LINE reserved除外       | UNKNOWN。専用scope実在、全instance、非Pilot V1、共有資源の負荷確認                       |
| D Kill Switch      | flag、Program停止、送信直前再確認                                 | UNKNOWN。停止担当/権限、送信済みcall/lease/drain、旧deployment到達遮断                   |
| E Participant Cap  | 外部100、Wave累計0/5/20/50/100、累計保持、Serializable/CAS/unique | UNKNOWN。コード保証は検証済み。本番Migration、固定authority、内部人数、settings/台帳一致 |
| F Human Approval   | trusted停止中Definition API、版固定/CAS/監査                      | UNKNOWN。3 Definitionの人間レビューと本番承認receipt                                     |
| G Wave 0 Accounts  | participant準備API、本人Profile API                               | UNKNOWN。本人同意、既存Enrollment、内部人数、Profile回答、本人準備導線                   |
| H Provider Cost    | 日次attempt/同時枠、request/output上限、Telemetry                 | UNKNOWN。実model/設定source、数値/概算費用/監視/実課金承認                               |
| I Privacy Auth     | session/Origin/scope、本人export/削除                             | UNKNOWN。実本人/実role否定試験、保持期間/同意/復元後再削除                               |

## 現行安全機構

参加者正本は `PersonalLearningPilotSeat`。同Programのuser digestがunique participantであり、取消・離脱・Enrollment削除後もslotを自動再利用しない。内部枠は外部100と分離し運用人数の既定値はない。未設定/0は登録不可。Wave 0の外部上限は0、内部人数は人間が別承認する。[P1-H報告](MANABERU_STYLE_PILOT_PARTICIPANT_CAP_IMPLEMENTATION.md)を参照。

`apps/web/src/services/personal-learning-pilot-access.ts`とDB Pilot repository/seat helperはlive seatを確認する。`packages/database/src/personal-learning-assessment-gate.ts`とCall AdmissionはGoal・Plan revision・Definition・Assignment・Answer・Job leaseを再照合する。失効やallowlist/台帳不一致は拒否。認可から外部送信までを永続的に固定する保証、送信済みcallを取消す保証ではない。

LINEは `apps/web/src/services/ai-training-action-line-scheduler.ts` と `apps/web/src/jobs/service-line-broadcast-eligibility.ts`でreserved Program/Personal Learning Assignmentを除外する。旧Runbookの「除外なし」は過去監査時点の記述である。DB/pool/worker/Provider/quotaは共有なので認可隔離を物理的な無影響と同一視しない。

## 本番準備と本人導線

準備authorityとCall AdmissionのWorkspace/Service/Programは同一scopeで人間が固定する。実値・参加者UUID・秘密を公開PRへ貼らない。準備は両実行flag off、Program SUSPENDED/Pilot disabled/通知off、機能別準備flagと固定authorityで行う。同Serviceに別AI Training Programがあれば拒否する。

別承認後の候補順序は、専用scope/既存Enrollment準備→participant CONFIGURE（Wave 0と承認済み内部人数）→ADMIT→Definition人間承認→本人Profile回答→準備flagを閉じる→全Gateレビュー→別開始承認。ADMITはEnrollment作成ではなく、新規scope/Enrollmentの既存管理操作は実環境担当者が確認する。自動enableしない。

本人Profileの保存APIはあるが初期化フォームはない。`personal-learning-pilot-card.tsx`のprofileReady=falseは運営者確認の案内だけである。APIは本人session、role/aiLevel/dailyMinutes、確認文、expectedAbsent、operation UUIDを要求する。管理者の代入、未回答を初心者へ補完、旧30日V1 setup流用は不可。

Wave 0前に人間が次のどちらかを選ぶ。

1. 限定1〜2人が自身のsessionでProfile APIを操作する手順をレビューし、同意・Origin・再送・receiptを確認する。sessionコピーやAIの代理回答はしない。
2. 別PRで最小の本人Profile準備UIを追加する。既存APIのみ使用し、未選択・明示確認・再送・準備off・非本人拒否を検証する。Goal/Plan/Runtime/Provider/LINEは追加しない。

受講者の操作確認には2を推奨するが本監査では実装しない。Definitionレビュー票3件のUNKNOWNは人間判断まで維持する。

## Migrationとリリース

| Git差分のMigration                              | 注意点                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 20261006021000_personal_learning_persistence    | 3 table、既存Goal複合unique、FK/CHECK/RLS。通常unique index作成の待機/書込阻害                                       |
| 20261006120000_personal_learning_call_admission | 空ledger、index/FK/CHECK/RLS。未知call枠は自動解放しない                                                             |
| 20261006140000_personal_learning_pilot_seat     | 空seat、unique/FK/CHECK/RLS、既存Enrollment DELETE/Program settings UPDATEへのtrigger。既存tableのDDL lockと削除経路 |

DROP/TRUNCATE/backfillなしだが、additiveを無停止安全としない。5新tableのRLSは有効化のみ、public policyなし。実owner/BYPASSRLS/server/anon/authenticated roleのgrantとアクセスを確認する。CIの成功は本番RLS証明ではない。

`apps/web/vercel.json`はproduction branchのGit deploymentだけを許可し、全pending Migration→readiness→Web buildを実行する。後段build失敗でもDBは変更済みになり得る。production mergeはこの経路を起動し得るため本監査ではrelease PRも作らない。

別承認後は実alias/DB/role/release同定→実pending全履歴→backup/restore/lock/互換性→停止/drain計画→release承認→Migration/build→実schema/RLS/SHAと非Pilot smoke→disabled Pilot smoke→準備→全Gate→別開始承認。Migration成功だけでrelease成功としない。

## 費用と停止

AdmissionのdailyAttemptLimit/maxConcurrent/model/maxRequestBytes/maxOutputTokensは人間が承認する。整数上限は運用推奨値ではない。UTC日次、失敗retryも消費、未知枠保持を維持する。call数は金額Hard Stopでなく、bytesは厳密なtoken数でない。実設定・最新単価・応答上限・失敗分を含む概算を別レビューする。キー取得・Provider送信・価格調査は今回行わない。Telemetry欠損は0円でなくUNKNOWN。

未知call枠の復旧操作は未実装。Wave 0はfail-closed停止を受容し、再開しない選択が可能。復旧するなら外部処理終了証拠と別承認を要求する。TTL、自動reset、台帳削除で解決しない。重大漏洩/cross-tenant/V1影響/無承認課金/費用異常/Goal破損/重複は1件で停止し増員不可。監視間隔/通知先/担当者/数値閾値を開始前に決める。

## 検証と残作業

基準mainでparticipant admin、preparation access、pilot access、call admission、LINE isolation、AI call worker、pilot profileのWeb 7 files/76 testsが成功。synthetic/mock試験で実認証・実課金の証明ではない。文書はPrettier/diff checkとPR CIを確認する。

優先順は本人準備導線の判断→本番読取監査の対象と権限の承認→内部人数/教育レビュー/費用・監視の確定→別release承認→disabled実認証/Privacy smoke→準備→別Wave 0開始承認。Wave 0で実Provider付きE2Eを完走することはWave 1の条件であり、開始前に無承認で課金試験しない。

rollbackは全instanceのPilot停止と履歴保持を前提とする。旧版はseat/admissionを迂回し得るのでenabledで戻さない。逆DROPやseat再利用で停止しない。[Closed Pilot Runbook](PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT_RUNBOOK.md)と[Backup Restore](../BACKUP_RESTORE_RUNBOOK.md)を併用する。

監査完了後に停止。本人UI、本番DB読取、release、実承認/実登録/実課金/開始は別指示を待つ。

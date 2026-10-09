# Wave 0安全条件の再整理 — 履歴の証明と開始準備を分ける

2026-10-09 JST。基準main `5c73d14f49cd8dedd92b5e38289315aa507fdef8`、branch `codex/wave0-safety-gate-rebaseline`。文書・既存ローカルテストの確認のみ。本番を再照会・変更していない。

## 結論

**現在のWave 0開始はNO-GO（実設定・承認・参加者・実運用検証が不足）。安全な準備作業は進められる。** 過去の復元元Backup日時が未確認であることを、すべての開発・レビュー・準備を止める単独の条件にしない。

「Supabaseの画面で取得できなかった」は「記録が存在しない」「将来も記録できない」と同義ではない。ただし同じ画面の再確認を繰り返しても証拠は増えない。履歴の完全証明と、これからの変更を安全に実施できることを分けて評価する。

過去の復元完全性/RTO/RPOはUNKNOWNのまま。復旧準備は省略しない。追加有償Restoreや契約Upgradeを必須の次操作にせず、既存環境・既存記録で可能な検証を先に進める。残る復旧リスクはownerが明示的に判断する。Codexは承認・免除・STARTを行わない。

## 証拠を混ぜない

| 証拠                                                     | 確認できたこと                                                                                                         | 証明できないこと / 扱い                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| #1202本番読取                                            | 学習4migration適用/checksum一致、Pilot SUSPENDED/enabled=false、承認0、Seat0、人数policy未設定、Call Admission NOT_SET | 現在値・全drift・実Application認可・実Provider疎通。開始直前に更新が必要   |
| #1203隔離DB読取                                          | Healthy、履歴227、学習5tableあり、invalid index/未検証constraint各0                                                    | 利用者データ復元完全性。空の学習tableで復旧PASSにしない                    |
| #1204既存DDLログ                                         | 復元後の学習3migration相当DDLが履歴不一致を説明する                                                                    | 未変更snapshot、全DDL成功、元Backup時刻、実行者・RTO                       |
| #1205読取報告（本書作成時OPEN、verify/database SUCCESS） | 本番復元一覧から既存隔離projectへの関連、COMPLETED表示。Proの組織監査ログは画面で閲覧不可                              | 元Backupとの個別対応・完全復元。未マージ報告であり本書のmain内証拠とは区別 |

#1205の参照: [復元元確認報告PR](https://github.com/team478a/bunshin-platform/pull/1205)。元Backup日時を推定して補完しない。新たなSupabase問い合わせ・購入・復元は今回行っていない。

## 作業ごとの必須条件

| 作業                                                 | 必須条件                                                                                          | 過去の元Backup日時不明の影響                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 文書整理・Definition教育レビュー・ローカル合成テスト | 秘密/利用者本文なし、コード・本番変更なし                                                         | 実施可能。復元合格とは報告しない                                         |
| 既存隔離環境の読取整合検査                           | 対象分離・read-only、schema/件数のみ、比較時点の明示                                              | 実施可能。現在の本番との差を損失と断定しない                             |
| 隔離環境へのDDL/書込リハーサル                       | 別途承認、対象・費用・復旧方法固定、現環境がDDL試験後であることを明示                             | 未変更復元snapshotの試験として扱わない。今回実施しない                   |
| 本番Migration / Deploy                               | 固定release/全pending、最新利用可能Backupと回復手順、旧版互換性、writer/lock/失敗時対応、独立承認 | 過去日時探索だけを無期限の前提にしないが、現変更の復旧準備が不明なら停止 |
| 本番準備設定 / APPROVE / 内部Seat・Profile           | 専用scope、Pilot停止、trusted操作、各人間承認、復旧/停止手順                                      | レビュー案は先行可能。書込は別承認。過去不明を自動免除しない             |
| Wave 0 START / 実課金                                | 以下の開始Gate充足、残リスクの明示判断、開始・費用承認                                            | 完全復元PASSを捏造しない。owner未判断の復旧リスクを残してSTARTしない     |

## Wave 0開始Gate（判定は前回観測に基づく）

| Gate                      | 状態                     | 解消すべきこと / 根拠                                                                                                                                                                   |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release / DB互換          | REQUIRED                 | 固定release/公開SHA/全pending/rollback互換性。#1176 OEMの2pendingを学習開始の名目で無断適用しない。`apps/web/vercel.json`、`packages/database/scripts/deploy-migrations-for-vercel.mjs` |
| 復旧準備                  | UNKNOWN / 人間判断必須   | 実行直前Backup成功・保持/対象・復元権限/手順・許容損失/停止時間。Storage対象外と既存復元の限界を明示。過去日時欠落だけと分ける                                                          |
| Definition                | NOT_READY                | 3件教育レビュー→別承認でAPPROVE。特にCONTEXT_SETTING/PROMPT_STRUCTURE共通Missionの評価妥当性。既存Review Sheetを使う                                                                    |
| 内部参加者                | NOT_READY                | policy/internal 1〜2・外部Wave0、Seat/allowlist、本人Profile。既存Preparation UI/操作を使う。`personal-learning-pilot-operations.ts` START再検証                                        |
| Provider / 原価           | NOT_READY / UNKNOWN      | Call Admission設定・実runtime model/source一致、予算/監視担当、課金承認。`personal-learning-call-admission.ts` strict 8項目、日次attemptは金額上限でない                                |
| Auth / Tenant / V1 / LINE | 部分確認 / UNKNOWN       | 実Application role/grants・越境拒否・通知隔離・本人ログインを固定releaseで確認。RLS enabledだけでは合格でない                                                                           |
| Kill Switch / 観測        | 実装あり / 実環境UNKNOWN | STOP担当/権限/endpoint到達、全instanceで新規実行拒否、未終了call追跡。送信済みcallの取消とは区別                                                                                        |

上記は実利用前の条件。Wave 0そのものが実認証・実端末・実Providerを使う縦フローの検証であり、その完走をSTART前に済んだと装わない。START前にはアクセス/隔離/停止/費用制御を確認し、START後のE2Eで失敗したら停止、Wave 1へ拡大しない。

## 次の最小作業 — 新しい機能ではなく既存機能の準備

1. **3Definitionの人間教育レビュー**。既存Review SheetでAPPROVE / REJECT / REVISION REQUIREDを記録する。本番APPROVEとは別。資料作成・整合確認は追加Provider費用なし。
2. **内部1人からの設定案確定**。既存policyとAdmission候補、監視・予算担当を人間レビューする。UUID/secretは非公開で照合し、今回は保存しない。
3. **固定releaseの公開・運用Gate整理**。未配備差分と全pendingを確定し、復旧・tenant・STOPの未検証を別承認の検証操作に分ける。main全体の無条件Deployはしない。

新規Restore・Upgrade・繰り返しの元Backup探索を次の自動作業にしない。既存隔離DBのschema/参照整合検査は補助として続けられるが、それだけで上記3項目は完了しない。

## 今後の復旧証跡を残す方法（運用案・未実行）

Provider画面の履歴機能に依存せず、操作時にアクセス制限された運用記録へ、対象project、選択Backup IDまたは表示日時、開始/完了時刻、担当者、復元先、期待schema/主要table件数、実結果、変更後の検証、判定を記録する。UIでIDが取得できない場合も、何を選択したかを非秘密の画面/receiptで残す。後から不明な値を創作しない。

公開Gitには秘密、dump、利用者本文、session、画面の個人情報を含めない。参照キーと合否・限界のみを残す。記録作成は将来の操作承認を兼ねない。

## 今回の検証・停止点

関連するAdmission/運用Contract/人数policy/Definition fixtureのローカルテストを実行した。

- `pnpm --filter @bunshin/application test -- personal-learning-call-admission.test.ts personal-learning-pilot-operations.test.ts`: 2 file / 27件PASS。
- `pnpm --filter @bunshin/capability-training test -- pilot-participant-cap.test.ts learning-definition-fixtures.test.ts`: 2 file / 21件PASS。
- 変更文書3件のPrettier確認と`git diff --check`。コード変更なしのため全体typecheck/lint/buildは未実施。

計48件は既存純粋Contractのローカル回帰であり、実DB・実Provider・スマートフォン・全instance停止・Backup復元の検証ではない。

変更は本書、Launch Runbook、Decision Logのみ。コード/schema/Migration/設定の変更、本番接続、Deploy、APPROVE、登録、START/STOP、Provider呼出し、Backup/Restore、契約変更なし。人間レビュー後、既存Definitionのレビュー判断と準備操作の個別承認を待つ。

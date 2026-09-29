# AI研修 無料・手動登録受講の期限終了バッチ

## 1. 調査した内容

main `63483601`（PR #1003マージ後）を基準に、Program購入の期限終了、手動研修Lifecycle、受講ロック、期間ガード、確定終了日Trigger、学習データ削除/保持期限処理を確認した。有料購入の期限終了は既存だが、購入に紐づかない受講はACTIVEのまま残る。画面の期間判定は利用を止めるだけで、状態の確定や評価待ちの停止を行わない。

## 2. 変更したファイル

- `packages/database/src/training-enrollment-expiry.ts`: Service限定の期限終了バッチ、100件上限/101件目、所有/Module/購入境界、ロック・CAS・Serializable transaction・競合集計。
- `training-evaluation-stop.ts`と`training-enrollment-lifecycle.ts`: 手動/自動終了で同じJob・PENDING回答停止処理を使用。
- `training-audit-events.ts`: 固定システム監査Event識別子。
- `training-personal-data-deletion.ts`、`training-retention-snapshot.ts`、`training-retention-execution.ts`: 新しい最小終了監査を学習情報のPreview/消去/匿名化対象から除外。通常の学習情報の期限や削除範囲は拡張しない。
- `packages/database/src/index.ts`: バッチの公開入口。
- `apps/web/src/http/ai-training-enrollment-expiry.ts`と内部POST Route: Cron認証、明示Scope、入力検証、安全な集計ログ、本番停止。
- 関連Unit/実DB統合テスト、D-142、ロードマップ、機能不足監査。

## 3. 主要な設計判断

対象は、明示Workspace/ServiceのAI_TRAINING_V1、購入に紐づかないACTIVE、開始/終了日時が既知で順序正常、終了日時が処理時刻以下の受講。期限なし、開始日時不明、招待/終了済み、別Module、別Service/Workspace、有料購入は対象外。休止/退会した参加者でも所有関係が維持されていれば期限終了する。対象絞り込みは件数上限より前に行う。

候補の更新時刻・終了日時をロック後に再確認する。状態更新、PENDING/LEASED/RETRY_SCHEDULED評価Jobキャンセル、PENDING回答FAILED化、システムEvent記録を同じ取引で確定する。READY回答・本文・点数・仕事情報・Toolkit・契約Snapshotと開始/終了予定日は変更しない。遅延評価の保存は既存期間/状態/PENDINGガードで拒否する。既に送信済みのProvider呼出の撤回は保証しない。

自動処理を本人操作へ帰属させず、actorなし/source SYSTEMで状態・固定理由・終了日時だけを記録する。最小監査は学習データ削除/期限処理から除外する。確定終了日は既存DB Triggerにより既知の終了日時を記録する。古い終了済み行を一括補完しない。受講単位の取引なので、途中の未知エラーは失敗として返すが、既に確定した別受講を巻き戻さない。再実行で重複監査・繰返し終了を防ぐ。

Serializable競合（P2034/SQLSTATE 40001）はconflicts件数で明示する。候補変更はskipped、101件目はhasMoreで示す。スキャンが0件なら0件であり、DB例外を0件成功へ変えない。

内部実行口は`POST /api/internal/ai-training/expire-enrollments?workspaceId=<UUID>&groupId=<UUID>`。Cron SecretのBearer認証が必須。本文による入力を受け付けず（空ストリームは許可）、Scopeの重複/未知値/不正UUID/1024文字超過を拒否する。処理時刻はサーバーのみが指定する。development/stagingだけ実行可能で、production/previewは503 DISABLED。GETと本番定期実行は追加しない。

## 4. 実行した検証

- Database関連4ファイル/45件、Web関連2ファイル/36件成功。対象SQL、所有/Module/購入/CAS条件、終了/停止/監査の順序、100件上限と残件、競合/例外、Cron認証/環境停止/入力と、既存手動Lifecycle・学習データ削除/保持期限処理を回帰検証。空POSTストリームの追加検証も成功。
- Webルート境界2件、Database型検査、git diff --check成功。
- Web型検査と変更ファイルLintも成功。初回CI実DB検証では新規Fixtureが同じWorkspaceに同名Serviceを作り、一意制約に違反した。Fixture名を分離し、実DB統合46件が成功。DB制約は変更しない。空POSTストリームと入力Bodyを区別する追加テストも最終差分で検証する。
- Web型検査・変更ファイルLint・全体format/typecheck/lint/test/buildと実DB統合の最終結果は、対象HEADのCIとPR検証欄を正とする。
- PR #1007までのmain `5d4a32d1`を取り込む競合解消では、機能不足監査・ロードマップ・実DB結合テストの追加位置を統合した。研修の期限終了テストと占い非同期生成テスト、D-142〜D-145と認証分離の文書を両方保持する。研修処理本体・所有境界・本番停止条件は変更せず、統合後HEADのCIを再確認する。
- 上記統合後のCIで判明した占いQueue同時投入のP2002は、独立PR #1008で修正されmain `2d86304a`へマージされた。そのmainを研修PRへ競合なく統合し、占い8件同時投入と研修期限終了の両テストを保持して再検証する。研修処理本体と本番停止条件は変更しない。最終CIの結果はPR検証欄を参照する。

実DBでは2 Workspaceと別Service/Module、有料購入、期限なし/未来/開始不明/招待/終了済みを用意し、並行バッチで一度だけ終了すること、確定終了日、評価待ち停止、本文/仕事情報/点数/Toolkit維持、再実行と遅延評価拒否を確認する。テストFixtureだけを使う既存保持期限・本人削除の検証で、最小終了監査が維持されることも確認する。

## 5. 未解決事項

コードの期限処理があることと、本番で自動実行中であることは別。今回は本番停止を維持し、Cron登録・本番実データ変更・設定変更・Provider呼出・LINE・課金/返金は行わない。DB Schema/Migration追加は不要だが、既存の終了日時TriggerのMigration適用が前提。

対象が100件を超えた場合や競合/途中失敗は次の同一Scope実行で再確認する。バッチ全体は単一取引ではなく、実行時間と即時全件終了を保証しない。過去終了日不明の確定、終了通知、契約延長、有料期限処理の統合、システム監査の運用上の長期保存方針は別タスク。停止した本番保持期限消去の解除は含めない。

## 6. 次作業へ進める条件

型検査・Lint・全体テスト/Build・実DB統合成功とPRレビュー/マージ。本番の自動期限終了を有効化する前に、対象ServiceのPreflight/対象件数、期間と確定終了日の記録、停止/競合/再実行を確認し、実行口の停止解除とスケジュールを別変更で承認する。次の機能実装候補は占いAI生成の非同期化・再試行。

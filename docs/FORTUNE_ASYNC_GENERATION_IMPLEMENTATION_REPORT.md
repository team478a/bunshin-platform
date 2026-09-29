# 占いAI生成の非同期化・再試行 実装報告

## 1. 調査した内容

- main `17ba25f0`を基準に、占いの同期draw、標準結果の保存、本人が選んだBunshin/Memory/直近履歴、AI使用量・組織/Service Quota、共通Jobのlease/Backoff、10分中断復旧を確認した。
- 同期生成はHTTP内でProviderの最大45秒を待つ。一時障害でもその場で標準結果へ戻し、Workerによる再試行はなかった。共通Jobは参照だけをpayloadに保存できるので新しいQueue・DBテーブルは作らない。
- 本作業は占い専用。千ノ国・ハッシー・AI研修・OEMのフロー、OpenAIモデル/秘密設定、配信設定は変更しない。

## 2. 変更したファイル

- `packages/capability-fortune/src/fortune-generation-queue.ts`と`fortune-reading.ts`: Provider非依存のQueue Port、非同期draw、Job lease/更新Revision。
- `packages/application/src/fortune-generation-job.ts`: 参照形式と能力検証、共通Job完了/失敗への接続。
- `packages/database/src/fortune-generation-jobs.ts`と`fortune-generation-repository.ts`: 冪等投入とGENERATING変更のTransaction、本人/Service/Workspace/Bunshin/lease検証、Revision付き確定。
- `packages/database/src/fortune-generation-recovery.ts`: 待機/実行/再試行Jobを中断復旧で上書きしない。
- `apps/web/src/jobs/fortune-generation-job-handler.ts`、`http/job-worker.ts`、`fortune/runtime.ts`: Worker実行、分類済み障害の最大3回再試行、明示有効化。
- `apps/web/src/providers/openai-fortune-reading-generator.ts`: 実試行別Quota/使用量キー、Provider直前の認可再検証、安全な障害診断と出力検証。
- `apps/web/app/s/[serviceSlug]/fortune-ui.tsx`: AI処理中でも標準結果を表示し、ページ更新を案内。結果が確定するまで評価ボタンを出さない。
- 各package公開入口、設定Schema/`.env.example`、対応するunit/integration/UIテスト、Decision Log D-145、監査/ロードマップ。

## 3. 主要な設計判断

- 1 Service/本人/日付のカード・正逆・テーマ・承認済み標準本文は維持する。新規Jobの冪等キーは`fortune-generation:<setting UUID>:<reading UUID>`。Jobに本文/Memory/履歴を複製しない。
- drawは標準結果を保存してJob投入後すぐ返す。AIを待たない。標準保存と投入の間でHTTPが中断した場合は、同日の再送で同じReadingを投入できる。投入失敗は隠さず返す。終了Jobは再送でも再起動しない。
- Workerは実行時に現在のServiceと本人の権限を検証し、その時点の本人選択Bunshin・Memory・本人履歴だけを取得する。Provider直前にも認可、未削除、更新Revision、leaseを確認する。
- Job行ロック・worker・試行番号・期限・全所有境界、ReadingのGENERATING/未削除/更新Revisionで完了/fallbackを確定する。遅延Worker、削除、復旧、別試行の上書きを拒否する。
- timeout/network、429、5xxだけ最大3回。既存Backoffは1回目失敗から30秒、2回目から60秒。Provider45秒より長い共通Worker5分leaseを使う。3回の中断後に再claimされても新たなProvider呼出はせず標準結果へ戻す。
- 設定/権限不備、その他HTTPエラー、空/不正/危険出力は再試行しない。最終失敗でも保存済み標準結果を維持する。権限失効などで本人scopeへ確定できない中断結果は既存復旧に任せ、権限を緩めない。
- `fortune-reading:<reading>:<job>:attempt:<n>`で各実試行をQuota/使用量へ記録する。モデル、Prompt Version、トークン、概算原価、時間、成否を記録し、Provider障害のraw本文/例外を保存しない。外部Provider送信済み処理の撤回・厳密なexactly-once課金を保証しない。
- 既存Job schemaとReading更新日時を利用するためmigrationは不要。共通Job claim/他サービスの処理方針は変更しない。

## 4. 実行した検証

- 模擬ProviderだけでQueue経由draw、重複防止、障害分類、再試行上限、危険出力拒否、試行別Quota/使用量、Provider直前の失効、標準結果UIを検証。
- DB unitで別Workspace/Service/Bunshin/User、lease失効/別worker/別試行、削除/復旧/更新Revision、終了Jobの再投入拒否を検証。
- `database.integration.test.ts`へ実PostgreSQLの並行投入・lease交代・権限失効・削除・Job付き中断復旧のテストを追加。ローカル本番DBには実行せずCIの隔離DBで検証する。
- 最終CI/ローカル検証結果はPR本文に記載する。コード存在・PRマージと本番稼働は区別する。

## 5. 未解決事項

- 本番設定変更、実AI/LINE呼出、既存失敗結果の一括再投入はしていない。
- 非同期投入は既定で無効。無効時は既存同期方式を維持する。Worker停止時は標準結果を表示できるがAI調整は待機する。結果はページ更新で確認する。
- Provider送信直後のprocess停止では、別試行で再呼出される可能性がある。回数制限・長いlease・試行別台帳で抑制/追跡し、外部APIの完全な一度だけ実行とは表示しない。
- 待機/再試行/実行JobがあるReadingは既存中断復旧から除く。Workerの稼働/滞留は共通Job運用で監視する。過去Jobや失敗履歴を消去しない。

## 6. 次へ進める条件・有効化/停止手順

1. PRレビューと隔離DBのCIを通す。
2. stagingで`FORTUNE_ASYNC_GENERATION_ENABLED=true`、占いServiceの既存aiEnabled、共通`/api/internal/jobs/run` Cron稼働を確認する。必要な実AI検証は運営承認の別作業とする。
3. drawの短い応答、同日カード不変、Job完了/再試行、台帳/Quota、本人結果、権限失効/削除後の非公開を確認してから本番有効化を判断する。
4. 停止はフラグをfalseへ戻し新規投入を止める。投入済みJobは安全なWorkerで処理し、Jobを手動でPENDINGへ戻さない。Workerまで停止する場合は標準結果を見られる旨を案内し、待機Job数を確認する。

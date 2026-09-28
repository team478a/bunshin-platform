# AI研修 本人データ削除 実装報告

## 1. 調査した内容

基準main: `3e2888bc`（本人Export PR #992マージ後）。回答・評価、Toolkit、Profileの仕事情報と点数、Progress、課題/活動履歴、目標、研修Preference、Enrollment目標Snapshot、評価Jobの参照形式とWorkerの確定処理を確認した。Toolkit等の保存済みコピーを削除するだけでは、並行する保存処理による復活を防げないため、既存書込側も補強した。

## 2. 変更したファイル

- Capability: `personal-data-deletion.ts`のProvider非依存Port、公開入口。Runtime CandidateにProfile ID/更新日時を追加。
- DB: `training-personal-data-deletion.ts`（本人認可、Preview/Revision、削除・Job停止・最小監査）、`training-data-lock.ts`（Enrollment固有の行ロック）、公開入口。
- 既存Profile/Answer/Toolkit/Barrier/Interaction/Work result/Runtime決定のTransactionへ同じ行ロックを追加。RuntimeはProfile世代を再検証する。共通Program RuntimeからAI研修独自のLifecycleを迂回しないよう制限。
- Web: 削除Preview/実行のPOST RouteとHTTP、確認画面、既存Exportの全入口への接続。評価QueueをTransaction内で回答再検証・投入し、評価確定を行ロックと本人Scope/PENDING条件で保護。
- DB/HTTP/UIのUnit test、既存分離テスト、実PostgreSQL統合テストを拡張。Decision D-132とロードマップ。

## 3. 主要な設計判断

- 個別回答は本文・評価・関連Toolkit・回答由来活動Eventを削除。未完了課題をスキップし、集計済み点数/進捗は維持することを明示する。
- 全学習データ削除は仕事情報・点数・進捗・課題・活動履歴・目標・研修Preferenceも削除し、Enrollmentの目標Snapshotと参加監査に複製した学習情報を消去する。アカウント、参加同意、参加状態、Enrollmentの契約Snapshot、決済・費用・最小監査記録は残す。継続する場合は本人による初期設定の再入力が必要。
- 読み取り専用Previewは本文を含めず、対象件数と回答ID/日時/評価状態を返す。確認Revisionは本人Scope・対象・全対象ID/更新日時をSHA-256で照合する。各一覧2000件超は413、変更済みは409で拒否する。
- 削除は同一DB Transactionで行う。本人ScopeのEnrollment行ロックを先に取得し、既存Training書込・Queue投入・評価確定も同じロックを使用する。外部AI呼出中はロックしない。削除済み回答の遅延評価はPENDING行更新0件で止まり、Profile/Progress/Eventを保存しない。旧Runtime Candidateは削除後のProfile再作成にも適用しない。
- Jobの停止はWorkspace/Service/Enrollment/本人/回答参照を限定する。LEASEを解放し、本人の確認Revisionと対象件数だけをProgram Auditへ記録する。同じRevisionの再送は新データを消さず成功扱いにする。
- DB schema変更はないためMigrationは不要。外部AI呼出や設定変更、本番一括消去は行わない。

## 4. 実行した検証

関連Unit test、全体format/typecheck/lint/test/build、実DB統合テストの最終結果はPR検証欄を正本とする。統合テストは本人/他参加者とWorkspace境界、Snapshot変更拒否、個別削除のコピー消去、遅延評価の更新0件、削除済み回答のToolkit保存拒否、全学習データ削除、他参加者と参加状態の維持、再送を確認する。

## 5. 未解決事項

- 本番反映、スマートフォン上の削除/表示更新、外部ProviderやBackupの完全消去は未確認。本操作を全経路の即時消去と表示しない。
- 自動保持期限（回答/評価90日、仕事情報終了後90日、進捗終了後1年）は未実装。今回、既存データの自動消去を開始しない。
- サービス参加解除後の本人請求は、本APIではなく運営者による本人確認・対象限定対応が必要。

## 6. 次の作業へ進む条件

レビュー、全CI成功、マージ後に保持期限の自動削除を独立PRで実装する。明示保存Toolkitは自動回答期限から分離し、終了日未設定、Backup/Provider、契約/費用記録の扱いを明示する。

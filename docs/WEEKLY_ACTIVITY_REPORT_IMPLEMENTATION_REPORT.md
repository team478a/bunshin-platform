# 週次活動レポート 実装報告

## 1. 調査した内容

- `MissionActivity`に確認、コピー、休みの追記履歴があり、投稿完了は`PostRecord`、素材追加は`DailyAction`、別案利用は`MissionContentVariantSelection`から取得できることを確認した。
- 既存のLINE Mission配信は`DailyMission`必須のため、週次レポートを同じ配信レコードへ結び付けると監査上の意味が崩れることを確認した。
- 汎用`Job`は環境・Workspace・Bunshin・依頼User・冪等キー・再試行状態を保持できるため、週次通知を独立したJobとして扱えることを確認した。

## 2. 変更したファイル

- `packages/application/src/weekly-activity-report.ts`
- `packages/application/src/weekly-activity-report-job.ts`
- `packages/database/src/index.ts`
- `apps/web/src/http/weekly-activity-reports.ts`
- `apps/web/src/jobs/weekly-activity-report-job-handler.ts`
- `apps/web/src/http/mission-scheduler.ts`
- `apps/web/src/http/job-worker.ts`
- `apps/web/app/ui/weekly-activity-report.tsx`
- Service・Workspaceの週次レポートAPI routeとサービス分身画面
- 関連テスト、CSS、計画書、Decision Log

## 3. 主要な設計判断

- レポートは既存イベントから都度導出し、重複する集計Snapshotを保存しない。
- 時刻イベントは取得範囲をUTCの前後1日へ広げた後、利用者Timezoneの日付で厳密に絞り込む。
- Mission単位の操作は同じ週に何度行っても1件とし、素材追加は本人が追加した記録数を数える。
- サービス画面は現在週を初期表示し、LINEのURLから`weekStart`を受け取った場合は指定された月曜開始週を表示する。
- LINE通知は毎週月曜の設定時刻に前週分を登録する。既存の通知同意、休止期間、静穏時間、友だち状態、専用LINE Routing、全体停止、配信枠を送信直前に再確認する。
- LINEへ渡す文字列は6種類の件数、短い案内、認証必須のHTTPS URLだけで組み立てる。

## 4. 実行した検証

- Application unit testでTimezone境界、Mission単位の重複除外、6種類の集計、安全なLINE本文、月曜スケジュール、停止中の抑止を確認した。
- Database unit testで未承認ScopeではイベントQueryを行わず、承認後も全QueryにWorkspace、User、Bunshin条件が付くことを確認した。
- Web test、型検査、lint、format、buildを実行する。

## 5. 未解決事項

- 本番Migrationは不要。新しい永続テーブルや列は追加していない。
- 本番LINEで月曜通知が1件だけ届き、リンク先に前週が表示されることは端末で確認する必要がある。
- 汎用Jobには成否・再試行・最終エラーが残る。週次通知専用の詳細な配信試行画面は利用実績を確認してから検討する。

## 6. 次Phaseへ進める条件

- 本番で月曜スケジューラとWorkerを動かし、同じ週のJobが重複しないことを確認する。
- LINE未連携、通知停止、友だち解除、全体停止、配信枠停止で送信されないことを確認する。
- 別User・別Bunshin・別Serviceの活動が画面とLINE件数へ混入しないことを確認する。

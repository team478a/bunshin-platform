# AI研修 本人データExport 実装報告

## 1. 調査した内容

基準: `main` `f93ddd1d`（PR #991マージ後）。回答・評価、仕事Context、Toolkit、Program進捗・目標・操作Eventの保存先と既存の所有境界を確認した。既存の課題表示は有効な公開Programに依存しており、終了後のExportにそのまま使わない。

## 2. 変更ファイルと機能

- `packages/capability-training/src/personal-data-export.ts`: Provider非依存のExport Port・JSON契約・件数/バイト上限。公開入口からexport。
- `packages/database/src/training-personal-data-export.ts`: 本人・Service・Enrollment固有のrepeatable-read snapshot。公開入口からexport。
- `apps/web/src/http/ai-training-personal-data.ts`と専用POST route: 認証、Origin、入力検証、private/no-store JSON attachment。
- `ai-training-data-export-card.tsx`、研修/Toolkit/参加プログラム画面: 明示的な保存確認、共有端末への注意、成功・失敗・サイズ超過表示、終了後の入口。
- Capability/DB/HTTP/UI unit test、`database.integration.test.ts`: 所有境界、件数・バイト上限、非公開情報の除外、実PostgreSQLでの参加者分離。
- Decision Log D-131、ロードマップ、本報告。

## 3. 設計判断

- ユーザー承認の保持方針: 回答・評価は回答から90日、仕事情報は研修終了から90日、進捗・点数は終了から1年。明示保存Toolkitは回答の自動期限削除から分離する。
- 本段階ではExportのみ実装し、削除や期限消去が稼働済みとは表示しない。既存データを変更・消去しない。
- 対象は認証済み本人の活動中Membershipと、同一ServiceのACTIVE/COMPLETED/EXPIRED Enrollment。User/Group/Workspaceも活動中を検証する。運営ProgramのarchiveやTemplateの非公開化後も、本人の保存済みデータを取り出せる。
- JSONには選択した本人プロフィール、回答・評価、Toolkit、課題の状態・日時、進捗・目標、本人操作の種類と日時だけを含める。管理者の操作、Eventのmetadata、Job、Provider診断、秘密値、他の参加者は含めない。これは内部全テーブルのDumpではない。
- 日付はISO文字列、目標のDecimalは精度を保つ文字列へ変換する。ファイル名にはUser/Workspace等の識別子を入れない。
- 各一覧2000件、UTF-8ファイル10MiBを超えた場合は413とし、途中までのファイルを成功扱いしない。
- サーバーにExportファイルを保管せず、本文をログに出さず、AI・外部Storage・LINEを呼ばない。ダウンロード開始は端末への保存完了を保証しないため、完了と断言しない。

## 4. 検証

関連Capability/DB/HTTP/UIのUnit testと実PostgreSQL統合テストを追加した。型検査、lint、format、全体test/build、統合テストの最終結果はPR検証欄を正本とする。

## 5. 未解決事項と次段階の条件

- 本番デプロイ、スマートフォンでのJSON保存確認は未実施。DB schema変更はなくMigration不要。
- レビュー・CI成功・マージ後に本人削除を実装する。削除前の対象表示、回答に対応する評価・Toolkitの削除、全研修データ削除、評価Jobの競合防止を次の独立したPRで扱う。
- 最後に自動期限削除を実装する。既存行の起算日、研修終了日が未設定の場合、Backup/Provider等の別経路に残るデータ、法令等で別途保持する記録の扱いを明示し、本番データの一括消去は自動的に実施しない。

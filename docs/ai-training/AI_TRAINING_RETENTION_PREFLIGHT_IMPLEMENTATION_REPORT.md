# AI研修 保持期限Preflight 実装報告

## 調査

PR #993マージ後のmain `ae63a70b`を基準に本人削除、評価競合防止、回答・Profile・Toolkit・Enrollmentを確認した。D-131の保持方針は承認済みだが、Enrollmentに実完了日時がなく、予定`endsAt`と`updatedAt`を完了日と仮定すると誤削除につながる。

## 変更ファイルと設計

- `capability-training/personal-data-retention.ts`: Provider非依存の90日・暦年1年の期限判定、件数契約、公開入口。
- `database/training-retention-preview.ts`: 明示Workspace/Group、AI研修Programと参加者所有境界を検証するRepeatableRead集計、公開入口。
- Web HTTPと`POST /api/internal/ai-training/retention-preview`: Cron Secret認証、UUID/入力サイズ/未知キー検証、private/no-store応答。GETや`execute`を許可しない。
- Capability/DB/HTTP Unit test、実PostgreSQL統合テスト、D-133、ロードマップ。

回答・評価は作成から90日。期限時刻ちょうどを含む。仕事Profileは確定終了日から90日、進捗・点数は暦年1年後。Toolkitは明示保存成果として除外する。`retainedToolkit`は保持する全Toolkitの件数で、期限超過回答のToolkitだけの件数ではない。Profileの件数は情報カテゴリごとの候補数であり、重複しない物理削除行数として合算しない。

終了日は`EXPIRED`の過去`endsAt`のみ採用する。`COMPLETED`/`CANCELLED`や終了日時不足の`EXPIRED`は`endDateUnresolved`で示す。ACTIVEの予定終了日から仕事情報を期限切れと判定しない。所有境界が確認できない行は`ownershipUnresolved`とし、個人テーブルを読まない。停止・退会済み参加者も所有境界を確認できれば集計する。

1 Scope最大100 Enrollment、1000 Program。超過時は413で全体の部分成功を避ける。大規模Scopeのページ分割は未実装。本文・評価・仕事情報・点数・Toolkit本文は取得しない。回答の件数は対応する評価を含む回答行数である。

## 運用手順

認証済み運用処理から、上記POSTにJSONの`workspaceId`と`groupId`を指定する。Bearerには既存Cron Secretを安全なSecret管理から注入し、コマンド・ログ・文書へ平文を残さない。結果は`mode: DRY_RUN`とカテゴリ件数、判定保留件数だけで、データの変更・削除は行わない。

Vercel Cron登録、環境変数追加、管理画面、実削除、既存行への期限設定は含めない。APIは読み取り専用で再送してもデータを変更しない。DB schema変更はなくMigration不要。

## 検証

期限境界・閏年・不明な終了日、所有境界、件数だけの取得、Toolkit維持、サイズ超過・認証・不正入力・障害時失敗を自動テストする。実DBで参加者の集計、別Workspace非参照と原稿/Toolkitの非破壊を確認する。全体format/typecheck/lint/test/buildとDB統合テストの結果はPR検証欄へ記録する。

## 未解決と次の条件

本番での実行・反映は未確認。保持期限による削除はまだ稼働しない。実削除は別PRで、完了/取消時の確定終了日時、期限対象のコピー、評価Worker/Runtimeとの競合、保存Toolkitの継続利用、監査/契約/費用情報の保持、停止・再実行を設計・検証する。Backup/Provider/端末Exportの消去を保証しない。Preflightの確認結果を理由に本番消去を自動開始しない。

# マナベルスタイル 学習用LINE接続

更新: 2026-10-08。基準main: `5350de139e0af99b1b47265fe37297f06c17be66`。
branch: `codex/manaberu-learner-line`。commitは本PRのheadを参照。
判断の正本: [ADR](ADR_MANABERU_MEMBER_LINE_LINK.md)。

## 目的と境界

本番の `/s/manaberu-style/line` が投稿パートナー作成を要求していた。ユーザーのLINE優先指示に従い、Personal Learning予約Programを持つサービスで、本人のLINEを投稿パートナーなしで接続できるようにする。

これは **接続準備のみ**。Enrollment/Seatを付与せず、Goal/Plan/Assignmentを生成しない。参加者Hard Cap、Wave、Kill Switch、Provider Admission、学習実行のallowlistを変更しない。予約Programは停止中でも接続準備可能だが、学習実行の許可には使わない。管理者が他人のLINEを代入する経路はない。

## UI / 認証

- 入口は既存 `/s/[serviceSlug]/line`。予約Programのないサービスは従来の投稿導線を維持。
- 既存接続フォームへ `LEARNING_MEMBER` を追加し、本人による通知同意と明示POSTを必須にする。投稿用bunshinIdと同時指定する入力は拒否。
- 既存 `/auth/service-line/start` / `/auth/service-line/callback`、サービス専用Login Channel、PKCE/S256、state/nonce、試行別HttpOnly Cookie、期限10分、single-use CASを維持する。
- Callbackの復帰先はサーバー生成の `/s/[serviceSlug]/line`。クライアントからreturn URL・User/Workspace/Membershipを受け取らない。
- 本人session、現在Member Service、ACTIVE所属・User/Workspace/Group、現行法務同意、同環境のACTIVE・接続確認済み・停止していないDEDICATED設定を再確認。LINE認証後にも学習接続scopeを再解決する。
- 成功表示はLINE接続/友だち追加だけ。通知や研修参加が開始したとは表示しない。未同意/利用不可/友だち追加不足は停止・確認案内。

## 正本 / Migration

接続は既存GroupLineConnection。サービス参加者単位で、Enrollmentごとの学習利用許可とは別責務。

`20261008140000_learning_member_line_link/migration.sql` は短期認証テーブル `service_line_link_attempts.bunshin_id` のNOT NULLを外すだけ。nullはサーバーで再認可する学習用接続試行。架空BunshinやEnrollment UUIDをbunshinIdへ保存しない。旧row・index・RLS・単回消費条件を維持。Backfill/credential変更なし。

DeploymentはMigrationレビューと環境別適用承認が先。旧Productionのcredential rotation用releaseへ混在させない。本番は最新mainと別のSHAであり、このPRのmergeを本番反映と扱わない。

## 他利用者 / 通知隔離

学習接続は `rejectDestinationTransfer` をRepositoryへ渡し、既に別Userが持つ専用LINE接続の移管・削除を拒否。既存投稿用移管仕様は維持する。DB unique制約は変更しない。

LINE認証で検証されたprovider subjectだけを保存し、設定/Workspace/Service/Membership/Userを照合してfriendshipを更新。学習経路ではBunshinのLineNotificationPreferenceを作らない。旧30日Scheduler、予約ProgramのLINE除外、`PERSONAL_LEARNING_PLAN`の配信除外を削除しない。Push/Reply、Job、課題回答処理、リッチメニュー公開をこの接続処理に追加しない。

## Privacy

相談・成果物・回答本文は取り扱わない。認証token/subject/code/secret/raw responseをlogやHTMLへ出さない。既存暗号化設定、接続正本、短期試行だけを再利用。ログは既存requestId/operation/fixed categoryのみ。

## 検証

- Web重点5 files 78件成功（接続HTTP、設定、SSR表示、OAuth、Personal Learning LINE隔離）。
- Web全体は3045件成功・2件skip。その後追加した学習経路の再利用拒否5ケースも上記重点テストで成功。
- Application全体861件、capability-training全体288件、Database全体900件成功。
- DB LINE persistence unit 15件成功（学習用移管拒否、従来投稿接続/移管など）。
- 隔離した使い捨てPostgreSQL 17で旧接続Migration→今回Migrationを適用。nullable変更・RLS維持を確認。`learning-member-line-link.migration.sql` により旧/学習試行の共存と2回目CAS拒否を確認。本番DBへ接続していない。
- Repository全体のbuild / format:check、architecture:checkと境界テスト10件成功。buildはCIと同じローカル用の非本番環境変数で実行し、本番DBに接続していない。
- 型検査では新規テストの自己参照型注釈を修正。Webを含む他packageの検査は成功し、修正後のDatabase `tsc --noEmit` も成功。
- 全体lint/型検査の並列再実行はPCのメモリ逼迫で中断。変更TypeScript全ファイルのeslint再検証は成功。全体はPR CIでも確認する。CIの状態はPR Checksを正本とする。
- 本番実認証、スマートフォン/LINE内ブラウザ、実通知、学習再開E2Eは未検証。合成テストの成功を本番GOとしない。

## 変更範囲

Web: service-line settings resolver / 接続HTTP / 参加者接続ページ / 既存接続フォーム / 関連3テスト。
Application: GroupLineConnectionRepositoryの移管拒否オプション。
Database: 短期認証schema / Migration / 最新Migration検査定数 / 移管拒否と停止再照合 / LINE unit / 隔離Migration検証SQL。
文書: ADR / 本報告 / Roadmap参照。

## 未実装 / 次のPR

1. 人間レビュー・CI・Migration承認・本番リリース・実端末OAuth確認。
2. 本人Enrollment/Seat/実行Gate/通知同意に限定した学習通知・Web学習復帰Bridgeの別設計。旧30日Schedulerを再有効化しない。LINE上で回答全文を収集することも未承認。
3. 学習用リッチメニュー/LIFFの必要性確認。既存投稿用標準メニューを流用して公開しない。
4. 管理画面の専用LINE callback表示と実際のservice callbackの不整合は別の小修正候補。今回の実認証callbackは既存service routeのまま。

本PRではProduction設定/DB/Deploy、Definition承認、Participant登録、Pilot START、実Provider、実メッセージ送信を行わない。

## Rollback

専用LINE接続を停止する場合は、人間承認した既存設定の停止操作で新規接続を止める。学習Program markerと旧通知除外を維持する。コードrevert前に新規接続を停止し、短期試行の失効を待つ。DBを削除/巻き戻す必要はない。nullable columnは旧コードでも既存非null試行を利用可能。null試行が残る間にNOT NULLを戻さず、試行・接続履歴を一括削除しない。

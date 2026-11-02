# 外部読取: 分散制限・読取監査の実装報告

## 1. 調査した内容

基準mainは`23ee4c0d`（管理ナビゲーションPR #1449）。監査計画PR #1448を含む`ddf037e5`で着手し、別PRのマージ後にrebaseした。[既存資産の監査](EXTERNAL_READ_ADMISSION_AUDIT_PLAN.md)を再確認し、Provider原価予約・研修Program・Job台帳は外部readの正本として流用しない。既存grant、Application CoreとPort、PostgreSQLの排他/DB時刻、Featureの発行/解除監査を再利用する。

作業時点で認証結合PR #1446は未マージ。今回の内部Adapterはmainにあるgrant契約で独立検証できるため先行実装した。認証・公開APIへの組立は含めない。

## 2. 変更したファイル

- `packages/application/src/external-connection-read.ts`: 非同期release、サーバー発行attemptId、解放後の最終認可、timeout中のlease保持。
- `packages/database/src/external-read-runtime.ts`: 必須Policy、三軸制限、TTL lease、固定監査、内部batch保守。
- `packages/database/prisma/schema.prisma`、migration `20261103030000_external_read_runtime`: 予約履歴/leaseとread監査だけを追加。新しいUser/会員/利用実績/grant/Feature台帳は作らない。
- Applicationテスト、SQLケースと既存統合テストへの登録、ADR、本報告。

共有ファイルの変更はDB公開indexへのexport追加、schemaのgrant複合unique/relation追加と新規model、readinessの最新migration定数。依存package・環境変数・Cron・catalog・UIは変更していない。

## 3. 主要な設計判断

### 予約と原価の分離

予約履歴は原価でもユーザー活動でもない。復元できない同時実行lease・呼出し消費を保存し、releaseしてもrateは返却しない。既存grantへの複合FKでconnection/environment/client/userの一致をDBでも保証する。所有者によるgrant解除は履歴削除ではなく、既存の失効日時を維持する。

設定はサーバーから毎回取得してsnapshotし、不在/停止なら予約不可、不正値/DB障害なら固定UNAVAILABLE。windowは1秒～24時間、各軸rateは1～1000、並行数は1～20、leaseは10～30秒。これらは内部安全上限で、運用値の初期登録・有効化は行わない。

environment/client、environment/connection、environment/userの順に短いtransactionで排他する。userはBunshin・Workspace・Service・clientの変更でも迂回できない。UUIDは正規化し、大文字表記で別lockを取らせない。異なる環境は分離する。DB時刻と経過時間のsliding windowを使い、日付が変わっても回数はリセットしない。予約の全軸検査とinsertは原子的。件数はSQLで集計し、他利用者の予約行をApplicationへ返さない。

transactionはReadCommittedを明示し、lock取得後に先行workerのcommitを確認する。DB queryに200ms、lock待機に100ms、予約transactionに1秒の上限を設ける。読取本体や外部通信をtransactionへ含めない。現在のgrant全scope/revision/失効/期限も予約前に照合し、Capability/会員/規約/Featureは既存Coreの前後認可を正本とする。

### 解放・timeout・失効

releaseは予約UUIDと全保存scopeを指定した冪等更新。古いreleaseは新しい予約へ影響しない。非同期releaseに専用AbortSignalと500ms上限を与え、成功応答の前に待機する。その後、既存grant再取得と最終認可/期限チェックを行うため、解放待ち中の本人解除・期限切れも結果を破棄する。

timeout後も処理が残ればleaseを早期解放しない。処理が終了した時点で解放し、worker停止/永久待機はTTLで回復する。遅延Promiseは観測し、raw errorを返さない。TTLだけで非協調処理の実終了は保証できないため、公開前に実際のsource readのDB上限と負荷を確認する。今回Adapterを公開入口へ組み込んでいない。

### 監査の意味と最小化

既存GroupFeatureAuditLogは発行/解除等の本人操作用として維持する。外部readの監査には未知のconnectionへの拒否もあり、本人やOEMを捏造できないため、別の最小receiptを保存する。Coreが試行ごとにUUIDを生成し、外部requestIdは相関用に限定する。同じrequestIdの再送でもrateとattemptを分ける。

保存はversion、attemptId、requestId、connectionId、clientId、environment、operation、固定outcome、count、DB時刻のみ。外部subject/session、token、メール、原価、本文、応答、raw errorは保存しない。型外の余分なfieldsも明示投影で除外する。attempt/outcomeの同一内容再送は冪等、異なる内容は拒否する。

READ_COMPLETEDは読取receiptであり配信の成功ではない。直後の認可失効では同じattemptにDENIEDを追加し、データを返さない。監査失敗時も閉じる。認証前や入力validation前の無制限な監査保存は追加していない。

新規tableはRLSを有効にし、PUBLICおよび存在するanon/authenticated roleから権限を除去する。ブラウザから直接参照するpolicyやHTTP APIは作らない。内部のprivileged DB Adapterだけで使用する。

### 保持・復旧・rollback

内部`prune`はenvironmentを固定し、2日超の期限切れ予約と30日超の監査を、それぞれ最大1000件ずつ削除する。rateの最大24時間を切り詰めない。SKIP LOCKEDで並行batchを許容し、recent/他環境は残す。Cronの登録や本番実行はしない。公開前に既存運用への保守接続と閲覧権限を確認する。

migrationは既存行の変更/機能開放をせず、additiveなtable/index/relationのみ。障害時は公開しない状態を保ち、アプリの呼出しを停止する。監査を保持したまま旧アプリへ戻せる。新規tableのDROPや適用済みmigrationの書換えを自動rollbackにしない。本番適用は既存のPreview・承認・backup/migration・readiness・deploy手順による別作業。

分散制限/監査は全サービス共通、SNS利用状況の投影は既存Application/SOCIAL境界、ロードマップ・推薦文・特典条件はハッシー固有とする。Provider SDKをCoreへ持ち込まない。

## 4. 実行した検証

- Application: async release待機/拒否/永久待機、解放中の失効、timeout後のlate read/admission、同じrequestIdの異なるattempt、既存grant/DTO分離の回帰。
- disposable PostgreSQL16: 全migration適用、独立Prisma clientの三軸競合、rate非返却、scope/environment分離、TTL/遅延release、invalid Policy、失効/revision、abort rollback、監査冪等/不一致/障害rollback、最小投影、保持batch/RLS/FK。
- Coreと実DB Adapterを組み合わせ、通常readと読取中解除のreceipt・結果破棄・解放を検証する。
- 整形、型、lint、architecture、全package/SQL/UI/buildの最終証拠と件数はPR本文へ記録する。合成データを使い、外部OAuth/Museへの実通信は行わない。

## 5. 未解決事項・本番状態

認証結合PR #1446、公開read/bind入口、入口の未認証負荷制限、実際のread経路の負荷/中断検証、保持batchの運用接続、OAuth Server/PKCE/client登録、実機互換・費用・OEM条件は別ゲート。RLSのmigration定義/SQL確認を、実際の本番role設定の検証とは扱わない。

本番DB・認証/Feature設定・catalog・外部データ送信・課金・デプロイは未操作。実装/CI成功/マージと本番提供を区別する。

## 6. 次の品質ゲート

最新mainで認証結合と本Adapterを統合し、migration順・最新定数・標準CI/全SQLを再検証する。その後にBearer専用の限定HTTP境界を実装し、Cookie fallbackやcaller指定scopeを拒否する。実Provider認可/解除とMuse互換・運用を確認するまで空catalogを維持する。

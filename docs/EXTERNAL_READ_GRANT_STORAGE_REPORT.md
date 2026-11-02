# 外部読取接続許可: DB保存・本人発行／解除

## 1. 調査した内容

基準main: `b8364389`（PR #1442）。仕様正本、AGENTS、Architecture Principles、Roadmap、Decision Log、[Core報告](EXTERNAL_READ_CORE_IMPLEMENTATION_REPORT.md)、[ADR](adr/EXTERNAL_CONNECTOR_READONLY_POC_ADR.md)、既存会員認可・Feature Entitlement・監査・schema・SQLテストを確認した。

外部接続grantの永続化は存在しない。既存のGroupMembership/Bunshin/規約同意を正本とし、接続許可だけを新設する。GroupFeatureAuditLogは既存の監査保存先として再利用し、同等の監査tableを作らない。ログイン・LINE token・規約同意を接続資格情報へ転用しない。

## 2. 変更したファイル

- Application `external-read-grant-management.ts`: 本人scope、明示同意version、発行/解除入力の厳密検証、管理Use Case/Port。
- Database `external-read-grants.ts`: 本人発行・上限5件・再送・期限・解除・一覧、共有監査の原子保存、既存読取Coreのgrants/authorization Adapter。
- schemaとmigration `20261103010000_external_read_grants`: grant table、全所有scopeの複合FK、Bunshin所有scopeのunique index、監査enumの2項目、機能定義EXTERNAL.READ。
- 合成Applicationテスト、使い捨てPostgreSQLの登録済みSQLテスト、既存ADR追記、本報告。

共有ファイルの変更: Application/Database indexへのexport追加、schemaへの関係追加、readinessの最新migration定数更新、SQLテスト入口への登録追加。依存package、Web API/UI、Cron、環境変数、本番Flag・設定は変更していない。

## 3. 主要な設計判断

### 許可と認証の分離

発行するのは接続許可レコードであり、token/APIキー/OAuth認証情報ではない。connectionIdとclientIdを知っているだけで認証済みにはならない。将来の認証Adapterが検証したclient/environmentを既存Coreへ渡す必要がある。今回外部公開routeを作らない。

Core/管理Use CaseはProvider非依存。既存利用実績用途のmember-usage:readだけを初期allowlistとし、SNS投稿や設定変更を付与しない。ハッシーのブランド・段階・紹介特典は追加しない。Museの未確認transport・認証方式を推測実装しない。

### 本人発行・抑制

サーバー認証済みactorとscope.userIdの一致、Workspace/Service/Membership/User/Bunshinの全境界を要求する。既存isMemberUsageScopePermittedで現在の会員・規約同意・所有権を確認し、ACTIVEなSOCIAL Capability、SOCIALとEXTERNAL.READのService/Member Entitlement、現在の期間・停止を照合する。

機能定義を追加するだけで、既存サービス/会員へpolicyやassignmentを付与しない。さらにserver側の有効設定とclient allowlistを要求し、既定は無効・空list。OEMによる機能設定だけで未検証clientへ接続できる構成にしない。

発行時に外部提供対象・client・operation・期限に対応したversion付き明示同意を要求する。入力にuser/environment/token等を追加できない。有効期間は5分〜24時間。Service内の本人ごと・環境ごとに有効grantを最大5件に制限する。read回数のquota消費や分散rate制限そのものではない。

### 冪等性と解除

発行commandIdを不変grant IDとする。同内容の再送・同時要求は1件のgrant/監査となる。異なる内容は競合。元の期限切れ/解除済み状態を返し、再送で期限延長・再有効化しない。新しい同意は新IDを必要とする。

解除は本人の全所有scopeとenvironmentを再確認し、expectedRevisionによる更新・監査を同一transactionで保存する。同時解除・同じrevisionの再送は1件の監査と同じ結果になる。不一致revisionは競合。存在しない・他人のgrantは同じNOT_FOUNDとする。

機能停止、client停止、Capability停止、退会や同意更新待ちでも、本人の現所有scopeが一致する限り解除と限定一覧を可能にする。停止を解除不能の理由にしない。一覧は対象Bunshinの最新50件までで、無制限検索・他人の一覧を提供しない。

既存Group排他を使って発行・解除・有効5件上限を直列化する。DB処理のmaxWaitは1秒、transaction timeoutは3秒。既存監査書込が失敗した場合、許可作成/解除もrollbackする。監査は固定action・接続識別子・期間・revision・同意version等だけを保存し、本文・secret・自由入力理由を保存しない。

### DB境界と現在の読取

会員のWorkspace/Service/Membership/User、およびBunshinのWorkspace/Service/Owner/Bunshinを複合FKで保証する。所有境界の暗黙移動を防ぐためON UPDATE RESTRICTとする。grantが残るBunshinの所有者移管には、将来の明示移管処理で許可を整理する必要がある。親会員/Bunshin削除ではgrantをCASCADE削除する。

既存Coreのfind/permittedはclient/environmentだけでなく、現在の会員・所有・Capability・機能・期限・失効・revisionを実DBで照合する。permittedへ渡したscopeの差替えも拒否する。AbortSignalは開始前/DB照合後に確認し、期限超過結果を返さない。既存Coreの応答前再照合により、読取中に本人が解除すると取得済み結果を破棄する。

read admissionと読取操作のAudit Adapterは今回の対象外で、Core接続テストだけに明示的なtest Adapterを使用する。本番へ無制限permitを組み込まない。

## 4. 実行した検証

全migrationを新しい使い捨てPostgreSQL 16へ適用した。初回SQLテストでテストcleanupと会員状態の生成方法が既存制約と不一致だったため、既存制約を維持してfixtureを修正し、新しいDBで再検証した。

- 同時発行・同時解除の冪等性、上限5件の同時要求、期限切れ/解除後の発行再送。
- 別Workspace/Service/Membership/User/Bunshin、同一会員の別Bunshin、他人の接続ID、client/environment不一致。
- 機能/会員権限/Capability/会員状態/同意/期限/サーバー停止後の読取・新規発行拒否と本人解除維持。
- DBへの直接越境insert・許可外operation拒否、監査失敗時の発行/解除rollback。
- 実DBのgrant/権限Adapterと既存MemberUsage/Coreを接続し、読取中の解除による結果破棄。
- Applicationの厳密入力・明示同意検証と既存Core回帰。最終の標準CI・全SQL・型検査等の結果はPR本文に記録する。

## 5. 未解決事項と本番状況

本人向けHTTP/UI、実外部認証、tokenとgrantの紐付け・失効、分散read admission・読取監査Adapter、投稿案/ミッション本文の投影は未実装。既存の会員APIを外部へ公開していない。本人の管理操作はApplication/Database Use Caseとして実装し、画面から操作可能になったとは扱わない。

本番DB・migration適用・Feature設定・権限付与・server allowlist変更・デプロイは未操作。Muse接続、アカウント作成、外部申請・規約同意、課金、ユーザーデータ送信は未実施。schema/migration/コードの存在、使い捨てDBの検証、本番稼働を区別する。

## 6. 次の作業へ進める条件

標準CI、全SQL、レビュー・マージを通過すること。本番適用は既存のbackup/readiness手順に従う別の反映作業とする。

次は本人向けの接続同意・一覧・解除HTTP/UI、実認証方式の適合確認、資格情報とgrantの紐付け・失効を実装する。公開前に分散read admission・監査、CSRF/Rate Limit、テストアカウントの接続/解除、費用/OEM/審査条件を確認し、正式認証なしで外部読取routeを開かない。

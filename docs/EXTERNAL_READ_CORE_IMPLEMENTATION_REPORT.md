# 外部接続読取Core・利用実績の合成データ検証

## 1. 調査した内容

基準mainは`a7a2df0f`（PR #1441）。AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、[PoC監査](MUSE_READONLY_POC_READINESS_REPORT.md)、[ADR](adr/EXTERNAL_CONNECTOR_READONLY_POC_ADR.md)、既存MemberUsageとDB認可/集計Adapter・公開入口を確認した。

既存の集計・会員本人APIは再利用可能だが、外部clientの認証・接続grantの永続化は未実装。既存LINE token/AuthReturnAttempt/規約同意を転用しない。認証方式は未確認のMuse transportに合わせて推測実装せず、今回のCoreを具体OAuth/Providerから分離した。

## 2. 変更したファイル

- `packages/application/src/external-connection-read.ts`: grantの前後照合、必須の認可/利用制限/監査Port、deadlineと結果破棄。
- `packages/application/src/external-member-usage.ts`: 既存GetMemberUsageSummaryを使う読取Use Caseと外部向け最小DTO。
- `packages/application/test/external-connection-read.test.ts`: 合成grant/利用原本による正常・越境・失効・障害検証。
- 既存ADRへの追記と本報告。

共有ファイルの変更: `packages/application/src/index.ts`への公開export追加のみ。DB schema/migration、依存package、Web API、UI、Cron、環境変数、Feature Flag、本番設定は変更していない。

## 3. 主要な設計判断

### 共通制御と最初の縦断用途

`ExternalConnectionRead`はProvider非依存の共通実行制御。既存の中立な所有境界MemberUsageScopeの構造を再利用し、SNS判定やハッシーの段階・紹介特典を追加しない。`ReadExternalMemberUsage`は既存の利用集計へ接続するApplicationの用途であり、SNS投稿案/ミッション本文の投影は今回含めない。ハッシー固有UIとMuse Adapterは未追加。

入力はconnectionId/requestIdだけを厳格に許可する。認証済みclient/environmentはサーバーの信頼済みcontextであり、外部の自己申告を認証とみなさない。grantから解決したWorkspace/Service/Membership/User/Bunshinだけを使用する。operationはcompositionで固定したmember-usage:readであり、リクエストから選択できない。

grantはclient/environment一致、正のrevision、許可operation、開始日時、有効期限、失効なしを必要とする。最初のgrantをコピーし、利用制限確保後に読取を実行する。監査後、保存先からgrantを再取得し、scope/revision/許可operation/期間の一致と現時点の権限を再確認する。失効・対象変更・停止・期限切れでは結果を返さない。

権限Portは現在の本人・参加・同意・Capability・機能停止を毎回確認する契約。既存MemberUsageの認可と原本照合も別途維持する。権限Portを常にtrueにする本番Adapterは認めない。今回のtrue/false実装はtest内の合成fixtureだけであり、実DBのCapability検証済みとは報告しない。

### 利用実績DTOと副作用

既存集計の7日/30日値を利用し、ログイン/閲覧だけで活動日を増やさない。初回PoCはJST固定。scope、内部ID、AI原価、累計、最終利用時刻、Memory/Knowledge/本文を応答へ含めない。投稿はSELF_REPORTED_NOT_VERIFIEDと明示する。明示fieldの投影で、内部summaryのspreadを行わない。

利用原本へのwrite、新規生成、画像URL発行、外部通信は行わない。監査・利用制限は制御用副作用として分離する。AI呼出しがないため追加AI原価は0。

### 障害と監査

初期deadlineは最大5秒、timeout後はAbortSignalを立てて結果を破棄する。遅れて返る利用制限leaseも解放し、読取を開始しない。開始済みのDB処理を物理的にcancelする機能ではない。将来Adapterでは短いquery timeout、lease TTL、期限超過時の停止を追加する必要がある。

応答をcloneして非同期処理中の変更を防ぎ、UTF-8で16KiB、最大10件を上限とする。利用実績応答は1件。未知field/不正入力はINVALID、権限なしはDENIED、制限なしpermitはLIMITED、deadlineはTIMEOUT、原本/監査障害などはUNAVAILABLEへ固定化する。raw errorを返さず、失敗を空データ成功に変えない。

監査には契約version、request/connection/client/environment、固定operation、状態、件数だけを記録する。READ_COMPLETEDは読取処理の完了であり、送信成功や認可通過の証明ではない。監査後の再照合で拒否した場合はDENIEDを追加する。timeout等にも別の最大500msで失敗監査を試み、監査できなければUNAVAILABLEとする。本文・secret・raw exceptionを監査へ渡さない。

### 最小の永続化設計（未実装）

既存会員・Mission・イベントは新設しない。将来必要な接続grantの最小項目は、connectionId、clientId、environment、全所有scope、operation allowlist、revision、grantedAt/expiresAt/revokedAtとする。client側資格情報の保存方式は認証方式選定後に決め、secret平文をgrantへ保存しない。

発行は本人認証・明示同意と現在の所有権を同じ境界で再確認する。解除は本人所有条件とrevisionを含む原子的更新で冪等に失効し、AuditLogを同一transactionで保存する。再発行は別接続/別資格情報とし、古い資格情報を復活させない。照会はclient/environment/connectionと全所有scopeを限定し、無制限一覧を作らない。

これはDB設計方針でありmigration適用済みではない。既存schemaの重複監査と具体的な認証Adapter決定後、独立PRでDB保存・失効操作・SQL越境試験を実装する。本CoreのPortだけで本番接続許可管理が完成したとは扱わない。

## 4. 実行した検証

合成データで、正常読取、余分な入力拒否、client/environment不一致、失効/期限切れ/未知接続、全所有scopeの変更、読取中・監査中の解除、現在権限の停止、利用制限、監査障害、timeout/遅延lease解放、応答サイズ/件数、データsnapshotを検証する。

既存の集計を経由するテストでJST境界、生成重複排除、自己申告投稿、原価・内部IDの除外、不完全原本/越境原本の拒否を確認する。型検査・関連package回帰・依存境界・標準CIの最終結果はPR本文へ記録する。

## 5. 未解決事項と本番状況

接続grantのDB保存・発行・失効API/UI、実認証、分散rate/concurrency制限Adapter、AuditLog Adapter、SQL統合、投稿案/ミッション投影は未実装。既存APIを外部公開するrouteやin-memory本番storeは作っていない。

Muse実機アカウント、認証互換性、審査適用、費用/OEM条件、HTTPSテスト環境は未確認。本番、外部接続、課金、申請、規約同意、ユーザー情報送信は未操作。実装済みなのはApplication Coreと利用集計の接続、検証済みなのは合成データ。接続成功・本番反映済みとは扱わない。

## 6. 次の作業へ進める条件

標準CIとレビューを通過後、最小grant保存・本人による発行/解除と監査を、migration範囲を明示した独立PRで実装する。認証製品の適合とMuse公式互換性を確認し、必要なread scope・client連携を決める。SQLで別OEM/User/Bunshin、同時解除、失効後の資格情報拒否を検証してから、限定HTTPS環境での実接続へ進む。

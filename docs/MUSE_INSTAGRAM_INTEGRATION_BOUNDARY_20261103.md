# Muse × ハッシー × Instagram：連携責務・重複開発防止・段階実装計画

作成日: 2026-11-03（Asia/Tokyo）  
基準main: cc4e0306b6b345df62cdd3b13d37485da03922cd（PR #1443マージ後）  
状態: 設計・調査のみ。今回の変更はAPI、DB、Feature Flag、接続、投稿を実装・有効化しない。

## 1. 結論

Muse（Metaの個人AIエージェント）は「ユーザーがハッシーの情報を確認し、将来仕事を依頼する入口」とする。ハッシー（BUNSHIN）はMission、企画・生成、投稿候補、利用実績、承認・監査の正本を保持する。Instagramへの投稿はハッシーが選択・管理する公式Provider経由か、Muse自身のInstagram接続のいずれかの経路になり得るが、両方が同じ予約を実行してはならない。

現時点でMuseからInstagramへの任意の画像・リール予約投稿が技術的・契約的に利用可能かは未検証。「Meta製品同士だから連携可能」「MuseのInstagram接続があるからハッシーの作品も自動投稿できる」とは判定しない。

既存SNS投稿企画・品質検査・写真起点投稿・Creatomate・fal/Kling・Runwayの機能を置換しない。Shoutrrr、MoneyPrinterTurbo、Instagram Agent Skillの全面移植は対象外。必要な機能を比較して不足だけを補う。

## 2. 現状の証拠と未完了

| 対象 | mainの状態 | 注意点 |
| --- | --- | --- |
| Muse読取専用設計 | PR #1441マージ済み | 外部接続成功の意味ではない |
| 外部読取Core・利用実績DTO | PR #1442マージ済み | grant前後照合と合成データテストのみ |
| grant DB保存・本人発行/解除 | PR #1443マージ済み | migration 20261103010000_external_read_grants。本番適用は別 |
| 本人向け接続・解除HTTP/UI | 未確認・残作業 | セッション認可とCSRF、rate制限が必要 |
| 外部クライアント本人認証 | 未実装 | connectionIdは資格情報ではない |
| read admission・読取監査の本番Adapter | 未実装 | 暫定無制限許可は禁止 |
| Muse実機の認証/transport互換 | 未確認 | 専用テストアカウントとHTTPS環境が必要 |
| ミッション/選択済み投稿案の外部読取 | 未実装 | 最小DTOと別scopeの設計が必要 |
| SNSへのAPI自動投稿・予約 | 未実装 | ユーザー本人の承認と公式APIの機能確認が必要 |
| 本番接続・権限付与・公開 | 未実施 | GO条件を満たすまでOFFを維持 |

既存のSNS実績は手入力・スクリーンショット解析を正本として扱う。PostRecordの自己申告をInstagram公式の公開成功と同一視しない。

## 3. 単一責務・データフロー

1. Muse → ハッシー: ユーザーが許可した本人情報の読取。認証済み外部client、最小scope、監査、失効時の停止をハッシー側で担保。
2. ハッシー: Mission、企画、生成、品質検査、素材、保存済み投稿案、費用・利用制限を既存Capability/Use Caseに委譲。
3. 将来のMuseからの生成依頼: READとは別のWRITE操作。既存生成Use Caseの認可・原価・採否・Versionの境界を通す。MuseがDB・Provider・LINEを直接操作しない。
4. 将来の投稿予約: ハッシー内の予約正本を一つに固定する。対象SNSアカウント、媒体、本文、メディア、予定時刻、承認revisionを保持する。実装前に現行PostRecordやJob Runtimeと重複しない設計を確認する。
5. Instagram公式Provider: アカウント連携・有効な権限・媒体仕様を実行時に検証し、公開IDを受信できた場合のみVERIFIEDとして記録。失敗・不明・公開済みを明確に分離する。
6. 投稿後データ: 確認できた外部投稿IDで突合し、手入力/スクショ/APIのsourceを保持したうえで既存Post Performanceへ集約する。

Museが独自のInstagram接続から直接公開する場合、ハッシーが完了を推測で記録してはならない。提供元の検証可能な外部投稿IDまたは本人の自己申告として区別し、必要なら公式APIで照合する。

## 4. ツール種別と初期許可

| Museへ提案する操作 | 分類 | 初期状態 | ハッシー側の条件 |
| --- | --- | --- | --- |
| 利用実績7日/30日 | READ | Core/DB実装済み、外部未公開 | 本人scope・grant・現在権限・失効・admission・監査 |
| 今日の保存済みミッション | READ | 未実装 | 今日のJST、最大10、構造化最小DTO、再認可 |
| 本人が選択した保存済み投稿案 | READ | 未実装 | 明示選択、最大10、内部Prompt/Memory除外 |
| 投稿案生成 | WRITE | 無効 | 新scope、本人権限、原価枠、承認済み入力、生成冪等性 |
| 投稿案の採用/見送り | WRITE | 無効 | 対象・revisionを固定した個別承認、既存Use Case |
| 外部SNSへの公開/予約 | SENSITIVE WRITE候補 | 無効 | 正式Connector仕様・公開結果・別途承認・再試行安全性を検証 |
| SNSへのDM、コメント自動送信 | WRITE/SENSITIVE判定要 | 対象外 | 当面搭載せず、公式APIとポリシーを個別審査 |
| アカウント接続権限の変更/解除 | WRITE | Muse経由は無効 | 本人画面での解除を優先、grant失効を正本 |

MetaのMuse公式Connectorガイドでは、公開・送信をreadとして偽装できず、approvalの対象操作と内容を一致させる必要がある。どの公開操作がSensitive扱いになるかは正式提出・レビューで確認する。MuseのAllow once/Always allowをハッシー自身の投稿承認に転用しない。

## 5. 投稿操作で二重実行を防ぐ契約案（未実装）

将来の公開Intentには次を必須にする。

- ownerからサーバーで解決したWorkspace/Service/Membership/User/Bunshin
- contentId、contentRevision、本文ハッシュ、承認済みメディアIDと権利状態
- targetPlatform、targetAccountId、予定時刻とタイムゾーン
- connectionId/clientId・明示された操作scope
- idempotencyKey（再送で変わらない識別子）
- approvalId、承認した本人、承認時刻、有効期限
- externalProvider、externalPostId、Providerの確定状態、監査情報

禁止: 利用者が指定したworkspaceId等をそのまま信用すること、URLを無検査でProviderへ転送すること、期限切れの承認を使うこと、本文/媒体/対象の変更後に旧承認を再利用すること。

状態案: DRAFT → AWAITING_APPROVAL → APPROVED → QUEUED → PUBLISHING → PUBLISHED_VERIFIED / FAILED / UNKNOWN / CANCELLED。UNKNOWNをFAILEDとみなして再送しない。外部状態照会で重複公開を防ぐ。

## 6. 開発フェーズ（既存PRと衝突させない）

### M1: Muse読取PoCの完了（最優先）
- 既存#1442/#1443のCoreとDBを再利用。
- 本人向けgrant一覧・発行同意・解除HTTP/UIを、認証/CSRF/レート制御付きで別PR。
- 発行前に正式クライアント認証方式とserver allowlistの確定。未確認のclient IDで発行させない。
- 分散admissionと読取監査を実装してから、外部読取routeを別PRで接続。
- Museのテストアカウント、HTTPSテスト環境で読取/拒否/解除のE2Eを実行。
- 本番migration・Feature付与・公開・デプロイは別途承認。

### M2: 読取ユースケース拡張
- Mission/Selected Contentの最小DTOを別PRごとに設計・実装。
- member-usage:readに他scopeを暗黙追加しない。期限・operationの追加同意を要求する。
- raw JSON、Prompt、AI原価、Memory、企業の機微情報をデフォルト非公開にする。

### M3: Museからの「投稿案を作る」依頼の検証
- 公式Muse ConnectorにWRITE操作を公開できるか、認証・審査・費用と合わせて実機で確認。
- 既存Mission Generatorを利用し、原価・権限・重複生成を保護。新Agent Runtimeを先に作らない。
- 必要な承認とversionを定義するまでWRITEは公開しない。

### M4: Instagram公開経路の方式決定
A. MuseのInstagram接続が正式に提供する公開操作を使い、外部IDをハッシーで確認する方式。  
B. ハッシー自身がInstagram公式APIを接続し、予約・公開・突合する方式。  

機能、制限、OAuth/権限、メディアの取り扱い、原価、OEM再提供条件、ステータスの検証可能性、利用者体験で比較。選択前に両方の書込システムを実装しない。

### M5: 限定公開
少人数のテスト環境で失効、自己申告との区別、投稿重複、意図しない公開、権限撤回、翌日自動化の停止まで確認し、Production Go/No-Goを判断。

## 7. 監査・テストの最低条件

- A/BのUser、Workspace、Service、Membership、Bunshin相互越境拒否。
- grantの期限切れ、本人解除、権限停止、client停止、読取中の解除に対してfail-closed。
- READだけで生成・採否・公開・通知・課金・Activityの追加をしない。
- 外部からuser ID、owner、環境、provider URL、tool scopeを書き換えられない。
- WRITEはREAD grantで拒否し、変化したrevision/本文/メディア/投稿先を旧承認で公開しない。
- timeout/429/5xx/配信不明で重複公開しない。UNKNOWNは事後照会・手動対応を優先。
- 外部APIの接続Token/本文/個人情報をログへ出さない。データ最小化・保存期間・削除を確認。
- main CI、DB migrationプレビュー、各PRのテスト証跡とproduction実確認を別々に保持する。

## 8. 現時点のGo/No-Go

- READ Core・DBの開発と合成データ検証：GO（mainへ反映済み）。
- Museへの外部公開：NO-GO（client認証、読取監査、実機PoC、migration反映未完了）。
- Museからの投稿生成・承認操作：NO-GO（write契約未実装）。
- MuseからInstagramへの予約/公開：NO-GO（公式連携能力と本人承認未検証）。

## 9. 参考資料

- Meta Muse Connectorガイド: https://platform.muse.ai/docs
- Meta Muse Connector規約: https://platform.muse.ai/terms
- Muse PoC現状監査: docs/MUSE_READONLY_POC_READINESS_REPORT.md
- 読取Core実装: docs/EXTERNAL_READ_CORE_IMPLEMENTATION_REPORT.md
- grant保存/解除実装: docs/EXTERNAL_READ_GRANT_STORAGE_REPORT.md
- ハッシー責務分離: docs/HASSY_SHARED_CAPABILITY_BOUNDARY_DESIGN.md
- BUNSHIN開発規則: AGENTS.md

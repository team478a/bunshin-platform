# xAI画像・動画 / Grok Bot Remote MCP 共通基盤 監査・差分設計

- 監査日: 2026-11-18
- 対象: `team478a/bunshin-platform`
- 基準: `origin/main` / `d8f2add186a932d0b0d952c492966a1c67961f46`
- 作業区分: PR-01（監査・差分設計のみ）
- 状態: コード監査済み。Runtime、DB、管理画面、本番設定は未変更。実API、Grok Bot、Museとの実接続は未検証。

## 1. 結論

既存基盤は、xAI画像・動画と外部AI読取をゼロから作らずに追加できる。ただし、Adapterを1個ずつ足すだけでは要件を満たさない。

1. 画像生成のPort、ジョブ、非公開Storage、文字合成、品質確認、利用権限、生成回数制限は再利用できる。一方、実行Jobと原価予約がOpenAIへ固定され、生成RequestにProviderの実行時スナップショットがない。
2. 動画生成の非同期Port、外部Job ID、状態確認、Storage、原価記録は再利用できる。一方、Provider型はFAL/RUNWAYだけで、POST前の重複送信防止はFAL専用である。
3. 外部読取のGrant、OAuth資格情報結合、失効、テナント境界、Member Usage APIは再利用できる。一方、許可操作は`member-usage:read`だけで、HTTP APIはRemote MCPではない。
4. Daily MissionとCampaign/Product Packには必要な情報源がある。外部向けには既存Entityをそのまま返さず、操作別の投影DTOと明示同意を追加する。
5. `AiProviderConfiguration`はProviderごとに1個の有効modelを前提としており、同じxAIアカウントで画像modelと動画modelを同時運用できない。Providerと用途を分けて解決する設定単位が必要である。

この差分は既存の境界を保ったまま解消できる。PR-02以降の実装開始を妨げる設計上の停止条件はない。ただし、Grok Botの実接続可否とMuseの製品・公式仕様は外部検証Gateとして残るため、PR-06または将来のMuse PRで実接続を確認するまで「接続済み」と報告してはならない。

## 2. 調査した基準と本番差分

### 2.1 Source of Truth

次を基準にした。

- `AGENTS.md`
- `docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`
- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DECISION_LOG.md`
- `docs/CODEX_PARALLEL_WORK_RULES.md`
- Muse、外部読取、Instagram公開、Grok Trend、画像・動画の最新監査・実装報告とADR

過去のPhase停止条件は履歴として扱い、現在のコード、Roadmap、最新Decision Logを優先した。

### 2.2 Git基準

- 監査開始時のローカルHEADと`origin/main`は同一SHAだった。
- `origin/production`は`a62a0394124d2e36d0f025a46a3d2dbb88453aab`だった。
- ブランチ比較ではproduction側だけのcommitが25、main側だけのcommitが87あり、`origin/production..origin/main`は229ファイル、約13,365行追加・2,334行削除だった。

これはGit branch間の比較であり、Vercelの実稼働SHA、環境変数、DB migration適用状況を証明しない。本番反映済みとは判定しない。

## 3. 既存機能の実装状況

| 領域                    | 現状                                                                                                                                        | 判定                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 画像Provider Port       | `SocialImageAssetGenerationProviderPort`がprompt、幅、高さ、model、quality、参照画像を受け、PNG bytes、Provider/model、usage、latencyを返す | 再利用                                                   |
| OpenAI画像Adapter       | OpenAI Images APIを呼び、既存Portへ接続済み                                                                                                 | 維持。削除しない                                         |
| 画像Job                 | 受付、権限、回数制限、非同期処理、非公開Storage、履歴、品質確認、最大1回の再生成が存在                                                      | 一部変更                                                 |
| 画像仕上げ              | `ManagedSocialImageRenderer`が日本語文字とテンプレートを決定的に合成し、1080×1350pxへ仕上げる                                               | 再利用                                                   |
| 画像原価                | 予約、利用記録、精算、Provider予算が存在                                                                                                    | Provider中立化が必要                                     |
| 画像Provider設定        | 管理画面にProvider、model、API資格情報、月額上限、停止状態が存在                                                                            | 用途軸の追加が必要                                       |
| 動画Provider Port       | 非同期submit/inspect、外部Job ID、成功URL、失敗情報を抽象化                                                                                 | 再利用                                                   |
| 動画Adapter             | FAL Kling、Runway、Creatomateレンダリングが存在                                                                                             | 維持。削除しない                                         |
| 動画Job                 | 外部状態確認、保存、原価、失敗、再試行が存在                                                                                                | 一部変更                                                 |
| 外部読取Grant           | Workspace/Service/Membership/User/Bunshin/client/environment/operations/expiry/revocationを保持                                             | 再利用                                                   |
| OAuth資格情報結合       | Bearer credentialをGrantへ結合し、毎回Grantと所有境界を検証                                                                                 | 再利用                                                   |
| Member Usage API        | 7日・30日の生成、採用、見送り、本人申告投稿完了、活動日数を投影                                                                             | `get_member_activity`へ再利用                            |
| Client catalog          | 実装済みだが空。既定で外部clientを許可しない                                                                                                | PR-06まで維持                                            |
| Daily Mission           | Bunshin、日付、SNS、目的、形式、本文・制作指示、採否状態の読取元が存在                                                                      | 外部DTOが必要                                            |
| Campaign / Product Pack | 企画名、目的、期間、公式素材、必須表記、禁止表現の読取元が存在                                                                              | 外部DTOが必要                                            |
| Instagram公式API        | OAuth、接続、公開Job、冪等性、失効、Service/Bunshin境界が存在                                                                               | MCP読取とは分離して維持                                  |
| Grok Trend              | xAIの`x_search`を使う調査Adapterが存在                                                                                                      | 資格情報・予算の考え方を再利用。業務ロジックは流用しない |
| Muse                    | 既存gap監査と責務境界はあるが、公式仕様に基づく実接続はない                                                                                 | 将来対応                                                 |

## 4. 再利用するコードとAPI

### 4.1 xAI画像

- `packages/application/src/social-image-generation-contracts.ts`
- `apps/web/src/providers/openai-social-image-generation.ts`と同じPort接続方式
- `apps/web/src/jobs/social-image-generation-job-handler.ts`の受付、Storage、品質確認、再生成制御
- `ManagedSocialImageRenderer`による1080×1350pxの最終合成
- 既存Capability、Service/Member上限、Provider予算、`AiUsageEvent`
- Supabase private Storageと署名付き取得経路

xAIの生成結果を最終成果物として直接公開せず、既存レンダラーの背景・素材として扱う。日本語文字は既存の決定的合成を優先する。

### 4.2 xAI動画

- `VideoSceneGenerationProviderPort`
- `VideoSceneGeneration`の`externalJobId`、provider、model、cost、status
- submit/inspectを分けた非同期Job
- 既存メディアStorage、字幕・編集・レンダリング経路
- 既存のFAL/Runway Adapter、失敗分類、利用記録

### 4.3 Remote MCP

- `ExternalReadGrant`と`ExternalReadClientCatalog`
- `ExternalConnectionRead`のGrant解決、認証資格結合、期限・失効・Membership検証
- `ReadExternalMemberUsage`
- `ListDailyMissions`とDaily Mission repository
- `CampaignService.listPlanningContexts` / `resolvePlanningContext`
- Product Packの素材・必須・禁止ルール
- 既存OAuth authorize画面、本人同意、接続解除

外部AIにUser ID、Workspace ID、Service ID、Bunshin IDを入力させない。認証済みcredentialからGrantを解決し、そのGrantのscopeだけで各投影Use Caseを実行する。

## 5. 新規実装が必要な箇所

### 5.1 Provider設定の用途分離

現行の有効設定はProvider/環境単位でmodelを1つしか持てない。xAI画像と動画を同時に設定するため、設定解決キーへ`capabilityKey`を加える。

初期用途は少なくとも次とする。

- `SOCIAL_IMAGE_GENERATION`
- `VIDEO_SCENE_GENERATION`
- 既存用途の互換値

Provider識別はxAIメディア用に`XAI`を追加する。既存`GROK`はTrend Researchの互換性のためPR-01では変更・改名しない。将来の名称整理を理由に既存Trend機能を壊さない。

model名、単価、rate limit、解像度、機能対応はDomainへ固定しない。versioned provider configurationとAdapter capabilityで扱う。

### 5.2 xAI画像Adapter

- xAI Images API Adapter
- timeout、429、5xx、invalid responseの固定エラー分類
- base64応答を優先し、一時URLの任意取得を避ける
- 参照画像はPortの既存単一入力から開始し、複数参照は別の互換拡張にする
- xAI生成サイズと最終1080×1350の差を既存レンダラーで吸収
- request/executionへProvider、model、quality、resolution、価格設定版のスナップショットを保存
- Provider中立の原価予約・精算

xAI公式仕様では`grok-imagine-image-2.0`、`/v1/images/generations`、base64応答、1K/2K、quality、最大5参照画像が案内されている。対応aspect ratioに4:5はなく3:4等であるため、1080×1350をxAIへそのまま要求できると仮定しない。

### 5.3 xAI動画Adapter

- `XAI`を`VideoAiProvider`へ追加
- `POST /v1/videos/generations`の`request_id`保存
- `GET /v1/videos/{request_id}`による状態照会
- Text to Video / Image to Videoの入力対応
- 完了後URLのhost allowlist、content type、容量、redirectの制限
- Provider中立のsubmit claim

FAL専用の`claimFalSubmission`を`claimProviderSubmission`相当に一般化する。POSTの結果が不明な場合は同じ生成を自動再送せず、保存済みrequest IDまたはProviderの照会可能なidempotency手段で照合する。照合できない場合は明示的な不明状態で停止する。

### 5.4 外部AI向け投影Use Case

既存のoperations配列を使い、新しいテーブルは作らない。次の3操作を明示的に分ける。

- `member-usage:read` → `get_member_activity`
- `daily-post-ideas:read` → `get_daily_post_ideas`
- `campaign-brief:read` → `get_campaign_brief`

Grant作成時に本人が操作単位で同意する。既存Grantへ黙って追加しない。接続更新時も同じ操作集合を再確認する。

Daily Missionはサーバー側で安全な日付範囲を決め、本人のGrantに属するBunshinだけを返す。Campaignは参加中かつ有効な企画だけに絞り、企業管理者専用情報、内部審査、原価、Prompt、Memoryを除く。

### 5.5 Remote MCP transport

既存HTTP読取APIをMCPと呼ばない。新しい単一HTTPS endpointでMCP Streamable HTTPを実装し、少なくとも`initialize`、`tools/list`、`tools/call`を扱う。

- JSON Schemaで引数と出力を固定する
- ツール引数に任意のUser/Workspace/Service/Bunshin IDを置かない
- Origin検証、content type、request size、JSON-RPCエラーを扱う
- 読取ツールからAI生成、採否変更、SNS投稿を起動しない
- Remote MCP用のOAuth Protected Resource Metadataを公開する
- Bearer tokenのaudience/resourceをMCP resourceとして検証する
- 認証失敗時はMCP仕様に沿う`WWW-Authenticate`を返す

lockfileにはMCP関連packageが間接依存として存在するが、`apps/web`には直接依存がない。PR-05では公式SDKの採用可否をversion固定、bundle、Next.js runtimeとの互換性で確認し、間接依存へ暗黙依存しない。

## 6. DB・設定・認証への影響

| 項目                    | 影響                                                                                             | PR     |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| `AiProviderKey.XAI`     | additive enum migration                                                                          | PR-02  |
| Provider用途軸          | `AiProviderConfiguration`へ`capabilityKey`追加、既存rowの互換backfill、active unique制約の見直し | PR-02  |
| 画像実行snapshot        | 既存request/execution modelへProvider/model/config version等を追加                               | PR-02  |
| 動画外部ID              | 既存`externalJobId`を再利用                                                                      | PR-04  |
| MCP operation           | 既存`operations`配列を再利用。DB adapterのhardcodeを拡張                                         | PR-05  |
| MCP Grant               | 既存Grantを再利用。新規テーブルなし                                                              | PR-05  |
| OAuth metadata/audience | route、issuer/resource metadata、token検証を追加。秘密情報の新規DB保存はしない                   | PR-05  |
| Grok client登録         | client catalogまたは承認済みOAuth client設定。実値は検証環境のみ                                 | PR-06  |
| Muse                    | 今回はDB・設定変更なし                                                                           | 将来PR |

MigrationはPR-01では作らない。PR-02で上記2～3項目を同一設計単位としてadditiveに作り、既存Provider設定の読取互換をテストする。

## 7. PR-02〜06の変更対象と依存関係

### PR-02: xAI画像Provider

主対象:

- applicationの画像PortとProvider runtime configuration
- database schema/migration/repository
- webのxAI Adapter、画像Job、Provider管理画面
- unit/integration/job tests

完了条件:

- OpenAI/XAIを設定で切り替えられる
- 同一requestの再実行でProvider/model/config snapshotが変わらない
- 予算・Capability・回数超過をProvider呼出し前に拒否する
- 失敗で成功履歴や二重精算を作らない
- mockでStorage、品質確認、1080×1350仕上げまで通る

### PR-03: 画像比較・管理

依存: PR-02

主対象:

- 4業種×5題材の20 fixture
- 既存管理画面内の比較・評価UI
- 品質、文字、ブランド、人物、成功率、時間、単価、再生成率の評価集計
- 決定的なProvider選択ルール

実画像APIは呼ばず、生成済みfixtureで実装・検証する。AIによる無制限な切替・再生成は入れない。

### PR-04: xAI動画Provider

依存: PR-02のProvider用途軸

主対象:

- video application type/port
- xAI video Adapter
- provider-neutral submission claim
- job composition、URL取得制限、cost policy
- async/status/idempotency tests

### PR-05: 外部AI共通MCP

依存: PR-01のみ。PR-02〜04とファイル競合を避けて並行可能。

主対象:

- applicationの操作別外部投影Use Case
- database external-read adapterのoperation allowlist
- webのMCP route、OAuth resource metadata、composition
- 接続同意UIの操作表示
- 認証、失効、退会、cross-tenant、read-only tests

### PR-06: Grok Bot限定PoC

依存: PR-05、外部アカウント設定と接続許可

主対象:

- 検証環境のclient catalog登録
- Grok Bot公式UIでのOAuth設定
- 本人1アカウントの実接続
- Grant解除、別User、別Service、別企業の拒否確認
- 接続手順と証拠の報告

PR-06は実際のGrok Botから3ツールを呼べるまで完成扱いにしない。外部アカウント作成、有料実行、本番設定は別途承認を受ける。

## 8. 主要な技術的リスクと対策

1. **設定の上書き**: Provider単位1modelのままxAIを追加すると画像と動画が競合する。用途軸と実行snapshotで防ぐ。
2. **二重課金**: 動画POSTのtimeout後に再送すると重複生成し得る。submit claim、request ID保存、照会優先、不明状態で防ぐ。
3. **一時URLの漏洩・SSRF**: 画像はbase64を優先し、動画は公式host allowlistと取得制限を使う。任意URLを受け取らない。
4. **Provider価格の陳腐化**: 価格・model・rate limitをDomainへ固定せず、版付き設定と公式仕様確認日を記録する。
5. **権限膨張**: `member-usage:read`へ投稿案・企画を混ぜず、操作別GrantとDTOを使う。
6. **OAuth互換性**: Supabase OAuth ServerとMCPのresource metadata、audience、Grok callback条件をPR-05/06で検証する。推測でtoken処理を追加しない。
7. **MCP protocol差分**: 手製の独自HTTPにせず、公式仕様と互換テストを使う。
8. **企業非公開情報の露出**: Campaign Entityを直列化せず、公開可能項目のallowlist投影にする。
9. **外部AI依存**: xAI/Grok停止時もOpenAI画像、既存動画Provider、ハッシーの日常機能、コピー・共有を継続できる構成を維持する。
10. **Museの曖昧さ**: 現時点で対象Museの製品、公式認証、connector申請条件を正本として確定できない。Grok専用処理をCoreへ入れず、共通MCPの再利用可能性だけを確保する。

## 9. 検証可能な完了条件

### PR-01

- 最新mainのSHAを記録している
- 既存画像、動画、外部読取、Daily Mission、Campaign、原価、テナント境界を調査している
- 再利用箇所と新規箇所を区別している
- DB/config/auth影響とmigration候補を明記している
- PR-02〜06の依存関係、変更対象、完了条件を定義している
- 本番・実API・実接続を未検証として区別している

### 共通回帰Gate

各Runtime PRで次を実行する。

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

加えて、Database Integration Test、認証・権限、cross-tenant、Provider failure/timeout、費用上限、冪等性を変更範囲に応じて実施する。画面変更はスマートフォン幅を確認する。mock成功を実API成功と報告しない。

### PR-01実行結果

- Node 24.22.3で`pnpm typecheck`: 成功（25/25 task、learning UIを含む）。初回は壊れたローカル依存リンクと古い生成物で失敗したため、lockfile固定の依存復元、Prisma Client再生成、production build後に再実行した。
- `pnpm lint`: 成功（25/25 task）。既存ファイルのunused eslint-disable警告4件は残るが、errorは0件。
- `pnpm test`: 成功（25/25 task）。Webは588 test files成功、3 live test files skip、4,369 tests成功、3 tests skip。
- `pnpm build`: 成功（13/13 task、Next.js production buildとTypeScript検査を含む）。
- `git diff --check`: 成功。
- 変更した2文書のPrettier check: 成功。
- リポジトリ全体の`pnpm format:check`: 未通過。変更外の既存`.github/workflows/production-line-go-no-go.yml`に警告があり、さらにGit無視対象のローカル`.pnpm-store`をPrettierが走査して構文エラーになった。PR-01では無関係なworkflowとローカルcacheを変更・削除していない。

Database Integration Testの実DB実行、xAI実API、Grok Bot/Muse実接続、本番smokeはPR-01の対象外であり未実施である。

## 10. 公式仕様の確認結果（2026-11-18時点）

- xAI Imagine overview: <https://docs.x.ai/developers/model-capabilities/imagine>
- xAI image generation: <https://docs.x.ai/developers/model-capabilities/images/generation>
- xAI image model: <https://docs.x.ai/developers/models/grok-imagine-image-2.0>
- xAI video REST: <https://docs.x.ai/developers/rest-api-reference/inference/videos>
- xAI pricing: <https://docs.x.ai/developers/pricing>
- Grok custom connectors: <https://docs.x.ai/grok/connectors>
- Grok Bot remote HTTPS apps: <https://docs.x.ai/grok-bot/computer-and-apps>
- xAI Remote MCP tool: <https://docs.x.ai/developers/tools/remote-mcp>
- MCP authorization: <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- MCP Streamable HTTP: <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- MCP tools: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>

Grokの公式資料から、公開HTTPSのCustom Connector、Remote MCP、HTTP headerまたはOAuth Client ID/secretによる接続経路を確認した。ただし、bunshinのSupabase OAuthとの実互換、callback、resource/audienceの受入れは未検証である。

Museは既存監査資料を再確認したが、対象製品を一意に識別できる情報と、採用すべき公式Connector/OAuth仕様を正本として確定できなかった。今回Muse専用Adapterを作らず、対象製品・公式文書・利用地域・申請条件が確定してから別PRで差分監査する。

## 11. 今回行わないこと

- Runtimeコード、schema、migration、環境変数、Provider設定の変更
- 本番DB・本番Storage・本番OAuth・本番client catalogの変更
- xAIへの有料呼出し
- Grok Bot/Museアカウント作成または接続
- SNS実投稿
- PRマージ、デプロイ

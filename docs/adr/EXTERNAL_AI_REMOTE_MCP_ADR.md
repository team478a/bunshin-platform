# External AI Remote MCP ADR

日付: 2026-11-18  
状態: Accepted for PR-05 implementation

## Context

Grok Botを最初の接続候補としつつ、業務読取を特定Providerへ依存させず、本人が許可したWorkspace / Service / Membership / User / Bunshinだけを外部AIへ渡す必要がある。既存の`ExternalReadGrant`と`ExternalConnectionRead`は、操作・所有scope・期限・失効を実行前後に検証できる。一方、既存HTTP読取APIはMCPではなく、Grantは`member-usage:read`だけを許可するDB制約だった。

## Decision

- 公開境界は`/api/mcp`の認証付きRemote MCP Serverとし、公式`@modelcontextprotocol/server`で現行MCPと2025-era stateless clientを処理する。
- 初期toolは`get_member_activity`、`get_daily_post_ideas`、`get_campaign_brief`の3つだけとする。全toolは空のstrict inputを持ち、User ID、Bunshin ID、connection ID、URLを入力させない。
- Bearer tokenの署名、issuer、client、session、expiry、resource audienceを検証する。tokenから本人を解決し、操作に対応する有効なGrantが一意に存在するときだけ既存`ExternalConnectionRead`へ渡す。
- Grantは操作ごとに1件とし、consent v2で個別に発行・解除する。既存consent v1は`member-usage:read`だけに限定して互換維持する。
- Daily MissionとCampaignは既存の本人向けRepositoryを再利用する。外部DTOは本文・制作指示、公開用素材・必須表記・禁止表現だけをallowlistし、内部Prompt、Memory、AI原価、Provider設定、非公開管理情報、内部IDを返さない。
- Supabase OAuthはAuthorization Serverとして再利用し、RFC 9728 Protected Resource Metadataを公開する。Supabaseがcustom OAuth scopeを提供しないため、OAuth scopeを業務権限の正本にせず、DB Grantを毎回の操作認可に使う。
- client catalogは既定で空のままとし、OAuth client登録、custom access-token hookによるMCP resource audience設定、実Grok接続はPR-06の承認済み検証環境で行う。

## Consequences

- 外部AIが停止してもDaily Mission、Campaign、ハッシーの通常機能は影響を受けない。
- 新しい業務テーブルや専用監査台帳は不要。migrationは既存GrantのCHECK制約を操作別consent v2へ拡張する1件だけとなる。
- PR-05のモック／プロトコル検証は実Grok接続や本番OAuth設定の成功を意味しない。
- 複数の有効Grantが同じclient・scope・operationに存在する場合は対象を推測せず拒否する。通常の発行処理は重複を作らない。
- 既存GrantはOAuth資格との明示的な結合後にだけMCPから解決できる。connection IDをtool引数へ露出せず、Grokの公式OAuth接続フローで3つの操作別Grantを安全に結合できるかはPR-06の実機確認事項とし、確認できるまで接続完了とは扱わない。

## PR-06 amendment: standard OAuth connector compatibility

- Grok Botの公式Remote HTTPS ConnectorはMCP URLとOAuth Client ID／Secretを設定するが、connection ID付きの追加binding endpointを呼ぶ導線を提供しない。このためMCP操作解決だけは、resource audienceを検証したOAuth tokenのsubject・client・operationと、本人が事前に発行した現在有効なGrantを照合する。
- 一意なGrantだけを採用し、0件または複数Bunshin候補では拒否する。読取によるGrant発行・結合・更新は行わない。従来のconnection ID付き限定HTTP APIと明示bindingは互換維持する。
- reviewed clientは既定で空のままとし、検証環境のclient ID・表示名・完全一致redirect URIを3項目そろえた時だけ有効化する。client secretはGrokとSupabaseにだけ設定し、アプリ環境変数やリポジトリへ保存しない。
- Grokの正確なcallback URIは公開資料に記載がないため、実Connector画面で確認する。実値を推測しない。実アカウント設定、Supabase OAuth client登録、audience hook、接続、有料実行は明示承認後に限定する。

## Official references checked

- MCP specification changelog: https://modelcontextprotocol.io/specification/draft/changelog
- xAI Grok custom connectors: https://docs.x.ai/grok/connectors
- xAI Grok apps and MCP: https://docs.x.ai/grok-bot/computer-and-apps
- Supabase OAuth server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase MCP authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase token security: https://supabase.com/docs/guides/auth/oauth-server/token-security

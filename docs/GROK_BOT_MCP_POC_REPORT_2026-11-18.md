# PR-06 Grok Bot Remote MCP 限定PoC報告

## 状態

コード互換対応と合成検証を実施中。Grok Bot実アカウント接続、外部OAuth client登録、実tool invocation、本番反映は未実施であり、PoC完成ではない。

## 1. 公式仕様の確認

2026-11-18に次の公式資料を確認した。

- xAI Grok Connectors: <https://docs.x.ai/grok/connectors>
- xAI Grok Bot computer and apps: <https://docs.x.ai/grok-bot/computer-and-apps>
- xAI Custom MCP tunneling: <https://docs.x.ai/grok/connectors/custom-mcp-tunneling>
- Supabase OAuth 2.1 Server: <https://supabase.com/docs/guides/auth/oauth-server>
- Supabase MCP Authentication: <https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication>
- Supabase OAuth Getting Started: <https://supabase.com/docs/guides/auth/oauth-server/getting-started>

Grok BotはRemote HTTPSのServer URL、任意HTTP header、OAuth Client ID／Secretを設定できる。公開HTTPSで到達可能なStreamable HTTP MCPを利用できる。SupabaseはAuthorization Code + PKCE、OAuth discovery、事前client登録またはDynamic Client Registration、custom access-token hookを提供する。

Grokの正確なOAuth callback URIは公開資料に記載がない。Supabaseは完全一致redirect URIを要求するため、実Connector画面で値を確認するまでclient登録値を推測しない。

## 2. 判明した互換差分

PR-05のMCPは、GrantをOAuth sessionへ結合するためにconnection ID付きの別HTTP endpointを前提としていた。Grokの公式Connectorフローにはこのendpointを呼ぶ設定がなく、そのままではOAuth成功後もMCP toolがGrantを解決できない。

MCP経路を次の方式へ変更する。

1. Supabaseが署名したOAuth tokenのissuer、subject、session、client、expiry、MCP resource audienceを検証する。
2. subjectを既存Userへ解決し、client・operationが一致する現在有効なGrantを検索する。
3. 所属、Service、Workspace、Bunshin、SOCIAL Capability、Feature、期限、解除状態を再検証する。
4. 一意なGrantだけを採用する。複数Bunshin候補は拒否する。
5. 実行前後に同じ一意性と認可を再検証する。読取によるDB書込みは行わない。

既存のconnection ID付き限定HTTP APIと明示bindingは削除しない。

## 3. 検証環境だけで有効化する設定

reviewed client catalogは設定なしでは空のままとする。次の3項目を全部設定した環境だけ1 clientを有効化する。

```text
EXTERNAL_READ_OAUTH_CLIENT_ID=<Supabaseで発行されたclient ID>
EXTERNAL_READ_OAUTH_CLIENT_NAME=Grok Bot
EXTERNAL_READ_OAUTH_REDIRECT_URIS=["<Grok画面で確認した完全一致HTTPS callback>"]
```

redirect URIはJSON配列、最大10件、重複不可。productionではHTTPSのみ。client secretはこのアプリへ設定せず、Supabaseで発行後にGrokのConnector設定へだけ入力する。

## 4. 承認後に行う外部設定手順

1. 本番と分離したHTTPS deployment、Supabase Auth／DB、合成本人2名、対象Service／Bunshinを用意する。本番データを複製しない。
2. Grok BotのConnect appsからCustom Connector、Remote HTTPSを開き、Server URLへ`https://<test-host>/api/mcp`を入力する。
3. Grok画面が提示または使用する正確なcallback URI、client種別、Client ID／Secret要件を記録する。秘密値は報告・ログへ残さない。
4. Supabase OAuth Serverを有効化し、Authorization Pathを`/oauth/consent`にする。上記callbackを完全一致で登録した専用clientを作成する。原則は事前登録clientとし、Dynamic Client Registrationは隔離環境で必要性が実測された場合だけ別判断する。
5. custom access-token hookで、このclientの`aud`だけを`https://<test-host>/api/mcp`へ設定する。他clientのtokenを変更しない。
6. deploymentへ上記3つの非秘密設定を入れ、本人画面で同一Bunshinに3操作を個別許可する。
7. Grok Connectorへclient ID／Secretを入力し、本人が既存OAuth画面で許可する。
8. 3 toolを呼び、投稿案を使った改善案と企業企画の制作指示を確認する。
9. Grant解除後の拒否、別User、別Service、別企業、同一操作の複数Bunshin候補の拒否を確認する。
10. Connectorを解除し、検証用client secretを失効する。取得データの削除方法もGrok側で確認する。

## 5. 現時点の検証

- Application: OAuth資格からoperationを解決し、実行前後に一意性を再確認する対象テスト10件成功。
- Config: 3項目同時設定、client ID、JSON redirect、production HTTPS制約の対象テスト13件成功。
- Web: catalog既定停止、有効設定、OAuth同意、MCP surface／HTTP境界の対象テスト30件成功。
- Application、Config、Database、Webの対象typecheck成功。Database lint成功。
- 使い捨てPostgreSQL 16へ全278 migrationを適用し、一意な未結合Grantの解決と複数Bunshin候補の拒否を確認するintegration test 2件成功。検証containerは削除。
- リポジトリ全体の`pnpm typecheck`成功。
- リポジトリ全体の`pnpm lint`成功。変更外の既存ファイルにwarning 4件、error 0件。
- リポジトリ全体の`pnpm build`成功。Next.js production buildを含む13 taskが成功。
- リポジトリ全体の`pnpm test`では、型検査・lintとの同時実行負荷により変更外のDatabase test 5件が5秒でtimeoutした。他の1397件は成功し、timeoutした5 fileを負荷解消後に単独再実行して36件すべて成功した。
- 変更ファイルのPrettier checkと`git diff --check`成功。

ルート`pnpm format:check`は、リポジトリ配下のignore対象ローカル`.pnpm-store`まで走査してcache内TypeScriptを検出する既知の環境問題があるため完走していない。最終PR CIはこの文書作成時点では未実施。

## 6. 未実装・未検証

- Grok Bot実アカウントとCustom Connector画面のcallback／client認証方式
- 独立検証環境の作成・デプロイ
- Supabase OAuth client、Authorization Path、audience hookの実設定
- 実OAuth認可、実Grok tool invocation、解除・分離の実機確認
- Grok側の取得済みデータ保持・削除確認

外部アカウント設定・接続許可・有料実行は明示承認後に行う。実接続が確認できるまでPR-06を完成とは報告しない。

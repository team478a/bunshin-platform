# ADR: LINE設定の環境分離とURL・署名鍵の安全境界

日付: 2026-08-22
状態: Proposed

## Context

LINE Login、Messaging API、Webhook、Mission Deep Linkは外部LINEチャネルと配備URLへ結び付く。Production設定をPreviewやStagingから利用できる設計、URLを管理画面から自由入力する設計、LINE Channel SecretをDeep Link署名へ流用する設計は、環境越境、open redirect、秘密値の用途混在を招く。

## Decision

### Environment

- 設定を`DEVELOPMENT | STAGING | PRODUCTION`で完全分離する。
- 各環境のACTIVE configurationはDB一意制約で最大1件にする。
- runtimeの信頼済み環境値とconfiguration environmentを利用直前にサーバー側で比較し、不一致はfail closedとする。
- Preview、Development、StagingからProduction configurationを解決・検証・送信できないようにする。
- 環境間設定コピーを提供せず、Audit Logへ対象環境を保存する。

### URL

- Callback、Webhook、LIFF Endpoint、Mission Deep Link Base URLは環境別アプリURLと固定pathから自動生成する。
- 管理画面では読み取り専用とし、LINE Developers Console登録用にコピーできるようにする。
- 例外overrideはSUPER_ADMIN、確認画面、理由、Audit Logを必須にする。
- HTTPSと環境別host allowlistを必須にし、ProductionはProduction hostだけを許可する。localhostはDEVELOPMENTだけに限定する。
- user info、任意query、fragmentを拒否し、DB保存後も利用直前に再検証する。
- callback復帰先は相対pathまたは環境別allowlistへ限定し、open redirectを拒否する。

### Deep Link Signing

- LINE Channel SecretとChannel Access Tokenを署名鍵へ流用しない。
- 親鍵を管理画面・DBへ保存しない。
- 環境ごとのVercel環境変数に置く親鍵から、HKDF-SHA-256等でenvironment、purpose、keyVersionをcontextにした署名専用鍵を導出する。
- `ENCRYPTION_KEY`のraw valueを署名処理へ渡さず、暗号化用途と署名用途で異なる導出contextを使う。
- 導出鍵の安全な分離・rotationが困難なら、環境別`LINE_DEEP_LINK_SIGNING_KEY`を使う別ADRを先に承認する。
- stateは短時間、single-use、key version付きとし、消費済みidentifierを再利用させない。
- stateへMission本文、個人情報、秘密値を含めず、署名検証後もresource ownershipを再検証する。

## Consequences

- LINE設定の準備と接続テストを環境ごとに行う必要がある。
- Production Secretを非Production検証へ流用できないため、Staging用LINE公式アカウントとチャネルが必要になる。
- URL変更の自由度は下がるが、環境越境とopen redirectをサーバー側で防止できる。
- key versionとsingle-use stateの保存領域が必要になるが、署名鍵のrotationとreplay防止が可能になる。

## Rejected Alternatives

- 全環境で単一LINE configurationを共有する: Production SecretがPreview/Stagingへ露出するため却下。
- URLを管理画面から自由入力する: 誤設定、環境越境、open redirectを防げないため却下。
- Channel SecretをDeep Link署名へ流用する: Provider認証とapplication署名の用途分離が失われるため却下。
- expiryだけでstate再利用を防ぐ: 有効期間内のreplayを拒否できないため却下。

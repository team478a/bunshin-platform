# Phase 6-C LINE Connection / Webhook Core 実装報告

日付: 2026-08-22

## 完了範囲

- DEVELOPMENT / STAGING / PRODUCTION別の`LineConnection`
- raw bodyと`x-line-signature`のHMAC-SHA256検証
- follow / unfollowの環境別冪等処理
- 最小`LineWebhookEvent`履歴
- unfollow / 明示解除時の未送信配信取消
- 実送信前の所有権・友だち状態・二重同意を検証するrecipient resolver

## セキュリティとプライバシー

WebhookからUserを自動作成せず、検証済み`AuthIdentity(provider=LINE)`と明示作成済みConnectionへだけ状態を適用する。Webhook Event履歴にはraw payload、LINE user ID、reply token、Provider response、Secretを保存しない。署名は復号した同一環境のACTIVE Messaging Secretで検証し、比較には`timingSafeEqual`を使用する。

受信者解決は、runtime environment、Active User、Active Workspace、Active Membership、対象Bunshin、ACTIVE Connection、FOLLOWING、Connectionの同意、Bunshin単位の通知ON・同意をすべて満たす場合だけ一時的にLINE user IDを返す。別Workspace、別User、別Bunshin、別環境は解決しない。

## DB変更

- `line_connections`
- `line_webhook_events`
- Connection / Friendship / Event Type / Outcome enum
- `environment + workspaceId + userId`および`environment + providerEventId`の一意制約

Migration: `20260822060000_line_connection_webhook_core`

## 対象外

- Supabase Custom OIDCを使うLINE Login本番導線
- 新規User作成、既存Userへの連携・解除UI
- message本文処理、postback業務処理、AI返信
- LINE Developers ConsoleへのProduction Webhook登録
- 実ユーザーPushと配信Jobの最終接続

## 検証

- `pnpm db:validate`: 成功
- PostgreSQL 16への全24 migration適用: 成功
- `pnpm test:integration`: 19件成功
- `pnpm typecheck`: 成功
- `pnpm lint`: 成功
- `pnpm test`: 成功
- Production相当環境変数で`pnpm build`: 成功
- 変更対象の`prettier --check`: 成功
- `git diff --check`: 成功

## 次へ進む条件

6-Bの外部設定GateとDevelopment smokeを完了し、verified LINE identityからConnectionを作る導線をレビューする。その後6-F2bでrecipient resolverを実送信Jobへ接続する。

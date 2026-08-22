# Phase 6-G2b2 LINE運用監視・Production Gate 実装報告

## 完了範囲

- 環境別LINE運用Snapshotと重大度判定
- ACTIVE設定不在・未確認、Dead Job、credential、quota、環境不一致等の分類
- CRON Secretで保護した非送信Readiness API
- 集計値だけを送る外部管理者Webhook Adapter
- HTTPS、host allowlist、redirect禁止、timeoutによるWebhook URL保護
- Vercel Cronによる毎時監視
- GitHub Environment承認と明示確認を要求するProduction LINE Go/No-Go workflow

## エンドポイント

- `GET /api/internal/line/readiness`: 状態確認だけを行い、LINE Pushも外部通知も実行しない
- `GET /api/internal/line/monitor`: 状態を確認し、異常があり外部Webhook設定済みの場合だけ集計アラートを送る

両方とも`Authorization: Bearer <CRON_SECRET>`を要求し、環境はrequestから受け取らずruntimeから導出する。CRITICALがある場合はHTTP 503を返す。Productionでは外部通知未設定もHTTP 503とする。

## 外部通知のデータ境界

送信するのはsource、environment、ready、checkedAt、固定alert code、severity、count、fingerprintだけである。User、Workspace、Bunshin、Mission、Delivery、LINE user ID、投稿本文、Knowledge、Secret、Provider responseは送らない。

## DB変更

なし。既存のLINE設定、配信状態、Job、失敗分類から読み取り専用で評価する。

## 本番利用開始前の人間作業

`LINE_PRODUCTION_GO_NO_GO_RUNBOOK.md`に従い、Vercel Production環境変数、GitHub Environment Secret、受信Webhookの冪等化・疎通、LINE Developers設定を確認する。本PRのマージだけでは実ユーザー送信をGOにしない。

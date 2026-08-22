# LINE Production Go/No-Go Runbook

## 1. 前提

- 対象commitが`main`へマージ済みでCIとVercel Production deploymentが成功している
- ProductionのLINE Login / Messaging API / Webhook設定が他環境と分離されている
- Production ACTIVE設定が接続確認済みで、全体停止の意図が確認されている
- 実ユーザーへ送る前に担当者とrollback責任者を決めている

## 2. Vercel Production環境変数

次をProductionだけへ登録する。値を文書、PR、ログへ貼らない。

- `LINE_ADMIN_ALERT_WEBHOOK_URL`: 外部管理者通知のHTTPS URL。queryとfragmentを含めない
- `LINE_ADMIN_ALERT_WEBHOOK_ALLOWED_HOSTS`: 上記URLのhostを完全一致で列挙する。複数はcomma区切り
- `LINE_ADMIN_ALERT_WEBHOOK_TOKEN`: 受信側がBearer認証を利用する場合だけ登録する

Preview / DevelopmentにはProductionのURL・Tokenを複製しない。登録後に再Deployする。

## 3. GitHub Environment

GitHub Environment `production`に次を設定する。

- required reviewer
- deployment branchを`main`へ制限
- Secret `PRODUCTION_CRON_SECRET`: Vercel Productionの`CRON_SECRET`と同じ値

Secret値をworkflow inputへ入力しない。

## 4. 非送信確認

Vercel Cronまたは認可済み運用端末から`/api/internal/line/readiness`を確認する。成功条件は以下。

- HTTP 200
- environmentが`PRODUCTION`
- readyが`true`
- alertingConfiguredが`true`
- alertsが空

この確認ではLINE Pushを実行しない。

## 5. 外部通知疎通

異常状態をProduction DBへ故意に作らない。まず専用の受信側検証環境でAdapter testを行い、本番ではVercel Cronの実行結果と受信側監査で確認する。受信側は`x-bunshin-alert-key`を冪等keyとして扱い、同一状態の重複通知を抑止する。

## 6. Go/No-Go実行

GitHub Actionsの`Production LINE Go-No-Go`を`main`から実行し、確認欄へ`GO_LINE_PRODUCTION`を入力する。required reviewerの承認後、Health ReadyとLINE Readinessが両方成功した場合だけ技術GateをGOとする。

## 7. 最終人間確認

技術Gate成功後も、LINE Developers ConsoleのCallback / Webhook、利用規約・プライバシー、通知同意、月間quota、問い合わせ窓口、緊急停止担当を確認する。対象commit、workflow run URL、日時、承認者を運用記録へ残して初めて実ユーザー送信をGOにする。

## 8. No-Go / Rollback

失敗時は実ユーザー送信を開始しない。既に開始済みなら、管理画面のProduction全体停止を先に有効化し、未送信Jobを止める。Secret漏えいの疑いがあればWebhook Token、LINE Token、該当用途鍵を個別にrotationし、ログへ平文を残さない。

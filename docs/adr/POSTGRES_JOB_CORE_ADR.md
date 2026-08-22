# PostgreSQL Job Core ADR

- 日付: 2026-08-22
- 状態: Proposed
- 対象: Phase 6-E1

## 決定

初期Job基盤はPostgreSQLへ永続化し、HTTP requestやVercel Cronの実行メモリへ処理状態を保持しない。Cronは後続PRでdue Jobを起動するtriggerとしてのみ接続する。

## 境界

- Job Coreはenqueue、claim、complete、fail、cancelだけを担当する。
- LINE送信、Mission生成、通知設定判定はJob handler側の責務とし、本PRでは実装しない。
- payload本文やSecretをJobへ保存せず、500文字以下のresource referenceだけを保存する。
- `environment + idempotencyKey`をDB一意制約とし、環境をまたいだ重複判定や実行を行わない。
- Workspace、任意のBunshin、requesterを外部キーとrepositoryのscope検証で固定する。

## Claimとlease

- due Jobの取得は`FOR UPDATE SKIP LOCKED`を用いて原子的に1件だけclaimする。
- `PENDING`、期限到来した`RETRY_SCHEDULED`、期限切れ`LEASED`だけを対象にする。
- claim時にattempt countを増やし、worker IDとlease期限を保存する。
- complete/failは未失効leaseのownerだけが実行できる。
- cancelは未開始の`PENDING`または`RETRY_SCHEDULED`だけを対象にする。

## Retry

- retryable failureだけを指数バックオフで再予約する。
- delayは30秒から開始し、1時間を上限とする。
- 非retryableまたはmax attempts到達時は`DEAD`にする。
- errorは分類名だけを保存し、Provider response、Token、個人情報は保存しない。

## 後続PR

1. Weekly / Daily producerとruntime再検証
2. Cron triggerとworker handler registry
3. LINE通知delivery handler、quota、全体停止
4. 管理者向けdead Job確認・manual retry

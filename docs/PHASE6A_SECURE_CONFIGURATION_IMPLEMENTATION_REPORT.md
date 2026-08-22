# Phase 6-A Secure Configuration 実装報告

更新日: 2026-08-22

## 1. Goal

LINE Login、Webhook受信、通知送信、Jobを開始せず、環境分離されたLINE設定をPlatform Adminが安全に登録・検証・有効化できる縦切りを実装する。

## 2. 実装内容

- DEVELOPMENT / STAGING / PRODUCTION別の設定version
- 環境ごとにACTIVE最大1件を保証するpartial unique index
- AES-256-GCM、環境・用途・keyVersion別HKDF導出鍵によるSecret暗号化
- Secret平文を返さず、登録有無と末尾maskだけを返すAPI
- APP_URLと固定pathから生成するCallback / Webhook / LIFF / Deep Link URL
- runtime environmentだけを扱い、requestからenvironmentを受け取らないAPI
- SUPER_ADMINによるDRAFT作成・ACTIVE切替
- SUPER_ADMIN / OPERATORによる接続テスト
- version作成、接続テスト、ACTIVE切替の理由付きAudit
- mobile Web内の最小LINE設定管理画面
- 月間80%警告、90%低優先通知停止の設定値

## 3. Secret境界

DBへ保存するSecretはLINE Login Channel Secret、Messaging Channel Secret、Channel Access Tokenだけである。`ENCRYPTION_KEY`、session、cron、DB、Supabase、Vercel、Deep Link署名親鍵は管理画面・DBへ保存しない。

暗号文はversion、96-bit IV、GCM tag、ciphertextを持ち、environmentと用途をAADおよびHKDF contextへ含める。改ざん、別環境、別keyVersionの誤用は復号時に拒否する。

## 4. 権限

- 全Platform Admin: 対象環境の状態と非機密設定を閲覧
- SUPER_ADMIN / OPERATOR: Secret末尾mask閲覧、接続テスト
- SUPER_ADMIN: 新version登録、ACTIVE切替
- SUPPORT / READ_ONLY: Secret末尾を非表示にして登録済み状態だけ表示

## 5. Connection Test

- LINE Login credentialをtoken endpointの認証境界で検査
- Messaging Channel Access TokenでBot情報取得
- timeout、credential、quota/rate limit、Messaging設定不正を分類
- Provider response、Token、Secret、LINE user IDを保存・log出力しない
- 接続成功前のACTIVE切替を拒否する

## 6. Migration / Rollback

Migrationは新しいenumとtableだけを追加するadditive変更である。既存routeから自動参照せず、未設定状態の既存機能を変えない。問題時は設定をDISABLEDにして外部利用を止め、code rollback後もAuditとversion履歴を保持する。

## 7. 対象外

- LINE Login callbackとsession発行
- Webhook受信
- follow / unfollow
- 通知設定とLINE Push
- Scheduler / Worker / Job
- Mission Deep Link state実装
- LINE Marketing

## 8. 次のGate

Migration、暗号化、権限、接続テスト、管理画面をレビューし、本番・StagingのLINEチャネルと環境変数の準備責任者を確定した後に限りPhase 6-Bへ進む。

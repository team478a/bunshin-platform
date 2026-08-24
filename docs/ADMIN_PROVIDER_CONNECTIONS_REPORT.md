# APIキーと外部サービス接続の管理

## 運用入口

管理画面の「APIキーと接続確認」で、AI・検索サービスとLINEの登録状況、接続確認、有効・停止状態を一覧確認する。

## 管理画面で登録できる情報

- OpenAI API Keyと利用モデル、日次・月次予算
- Grok API Keyと利用モデル、日次・月次予算
- Exa API Keyと予算
- Firecrawl API Keyと予算
- LINE Login Channel ID / Secret
- Messaging API Channel ID / Secret / Channel Access Token
- LIFF ID、通知時間、Quiet Hours、配信停止基準

## 接続確認

- OpenAI / Grok: 指定モデルを利用できるか確認
- Exa / Firecrawl: 最小の検索・取得リクエストで確認
- LINE Login: Channel ID / Secretの認証エラーを確認
- LINE Messaging API: Bot情報取得、Token有効性、Messaging Channel ID一致を確認

認証エラー、利用上限、モデル不一致、Channel不一致、外部障害を日本語で案内する。

## 管理画面へ移さない情報

暗号化の親鍵、DB接続情報、Supabase管理者鍵、定期処理の秘密鍵、Vercel認証情報は環境変数に残す。これらは漏えい時に保存済み秘密情報すべて、DB、配備環境へ影響するため、日常操作の対象にしない。

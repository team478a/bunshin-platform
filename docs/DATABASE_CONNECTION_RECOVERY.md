# 本番データベース接続の再発防止・復旧手順

## 通常運用

- `DATABASE_URL` はSupabase Transaction Pooler（ポート6543）を使用する。
- アプリはTransaction Poolerを検出し、Prisma向けに `pgbouncer=true` と
  `connection_limit=1` を自動適用する。Vercelへの入力時に付け忘れても実行時に補正される。
- `DIRECT_URL` はマイグレーション用のDirect connectionを使用する。
- 接続URLやパスワードをログ、Issue、PR、チャットへ貼り付けない。

## パスワードをリセットした場合

1. SupabaseのConnect画面を更新せず、新しいパスワードを安全に保管する。
2. Vercel Productionの `DATABASE_URL` を、新しいTransaction Pooler URLへ置き換える。
3. Vercel Productionの `DIRECT_URL` を、新しいDirect connection URLへ置き換える。
4. 最新の本番デプロイをRedeployする。
5. `GET https://www.watashi-works.com/api/health/ready` がHTTP 200になり、
   `configuration`、`authentication`、`database` がすべて `ok` であることを確認する。
6. `/admin` を開き、ログインと管理画面の表示を確認する。

片方のURLだけを更新した状態では再デプロイしない。認証エラーが出た場合、繰り返しリセットせず、
2つのURLが同じ最新パスワードを使用しているかを先に確認する。

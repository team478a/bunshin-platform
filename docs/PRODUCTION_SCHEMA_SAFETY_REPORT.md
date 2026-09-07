# 本番Schema不整合・404誤変換 再発防止報告

## 1. 調査した内容

- 2026-09-07の本番障害では、Webの自動配信がDB migrationより先に進み、新しいtableを参照した時点でPrisma `P2021`が発生した。
- `/api/health/ready`は従来`SELECT 1`だけを確認していたため、接続可能だがSchemaが古い状態を正常と判定していた。
- 複数の画面が例外の種類を確認せず`notFound()`へ変換し、DB障害まで404として見せる余地があった。
- GitHub Environment `production`にはDB secret名が存在するが、障害時点では現在のDB認証情報と一致せずmigration workflowが`P1000`で失敗した。
- VercelからGitHubへsecretを自動同期する操作は実行環境の安全制御で許可されなかったため、secret値は変更していない。

## 2. 変更した内容

- Vercel Production buildの先頭へ読み取り専用Schema Gateを追加した。
- Runtime readinessへ最新migration確認を追加し、成功応答へ`databaseSchema: current`を追加した。
- 正式ドメインのlive/readinessを15分ごとに確認するGitHub Actions scheduleを追加した。
- Service、Knowledge、Video、Evidence、Today画面の例外処理を見直し、明示的な不存在・権限エラーだけを404へ変換した。
- ASTを使った回帰テストを追加し、分類していないcatchから`notFound()`を呼べないようにした。
- 最新migration定数がmigration directoryと一致する回帰テストを追加した。

## 3. 主要な設計判断

- Migrationの自動適用は行わない。承認、backup確認、変更windowを維持する。
- 公開前Gateは`_prisma_migrations`を読むだけとし、Schema不足時はbuildを失敗させる。
- Runtime readinessも同じ条件を検査し、デプロイ後の環境変化を監視できるようにする。
- 利用者向け404と運用上の障害を区別し、request logで原因を追跡できる状態を保つ。

## 4. 検証

- Database readiness unit test
- CI temporary PostgreSQLに全migrationを適用した後の`db:assert-ready`
- Web health、public service、route not-found boundary test
- TypeScript typecheck、ESLint、Prettier、全unit test、production build
- PR上のPostgreSQL integration test

## 5. 未解決事項

- GitHub Environment `production`の`DATABASE_URL`と`DIRECT_URL`は、現在のSupabase接続情報へ管理画面から更新する必要がある。
- GitHub Scheduled workflowの失敗通知を確実に受ける担当者と通知先は、Repositoryの通知設定で確認する必要がある。

## 6. 次の運用条件

1. DB password変更時にVercelとGitHub Environmentを同時更新する。
2. migrationを含むreleaseは、Production Database Migration成功後にVercel deploymentを進める。
3. Production Health Smoke失敗時は新規releaseを止め、migration statusとVercel logを確認する。

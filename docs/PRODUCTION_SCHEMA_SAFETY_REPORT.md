# 本番Schema不整合・404誤変換 再発防止報告

## 1. 調査した内容

- 2026-09-07の本番障害では、Webの自動配信がDB migrationより先に進み、新しいtableを参照した時点でPrisma `P2021`が発生した。
- `/api/health/ready`は従来`SELECT 1`だけを確認していたため、接続可能だがSchemaが古い状態を正常と判定していた。
- 複数の画面が例外の種類を確認せず`notFound()`へ変換し、DB障害まで404として見せる余地があった。
- GitHub Environment `production`のDB secretは古く、migration workflowが`P1000`で失敗する一方、Vercel ProductionのDB接続は正常だった。
- Supabaseでmigration専用login roleも検証したが、既存objectのownerである`postgres`を安全に継承できず、所有権の一括移管が必要になるため採用しなかった。
- 初回のVercel Production適用で、build machineからSupabaseのIPv6 direct hostへ到達できず`P1001`になった。旧deploymentは公開されたまま維持され、利用者影響は発生しなかった。

## 2. 変更した内容

- Vercel Production buildの先頭で未適用migrationを適用し、直後に読み取り専用Schema Gateを実行する。
- PreviewとDevelopment buildではmigrationを実行しない。ProductionでDB変数が欠ける場合はbuildを失敗させる。
- Supabaseの`DIRECT_URL`はpasswordとquery parameterを保ったま、migration実行時だけIPv4 session poolerへ変換する。Application runtimeの接続設定は変更しない。
- 古いGitHub DB secretに依存していた手動migration workflowを削除した。
- Runtime readinessへ最新migration確認を追加し、成功応答へ`databaseSchema: current`を追加した。
- 正式ドメインのlive/readinessを15分ごとに確認するGitHub Actions scheduleを追加した。
- Service、Knowledge、Video、Evidence、Today画面の例外処理を見直し、明示的な不存在・権限エラーだけを404へ変換した。
- ASTを使った回帰テストを追加し、分類していないcatchから`notFound()`を呼べないようにした。
- 最新migration定数がmigration directoryと一致する回帰テストを追加した。

## 3. 主要な設計判断

- ProductionのmigrationはVercelが既に保持する有効な`DIRECT_URL`を使い、新アプリのbuildより前に`prisma migrate deploy`で自動適用する。
- Migration失敗時はVercel buildも失敗し、新アプリを公開しない。成功後も`_prisma_migrations`を読むSchema Gateを通してからbuildする。
- Runtime readinessも同じ条件を検査し、デプロイ後の環境変化を監視できるようにする。
- 利用者向け404と運用上の障害を区別し、request logで原因を追跡できる状態を保つ。

## 4. 検証

- Database readiness unit test
- Vercel用wrapperがPreview / Developmentでskipし、ProductionのDB変数不足時に停止するunit test
- Supabase direct URLからIPv4 session poolerへの変換と、password・SSL query・非Supabase URL保持のunit test
- CI temporary PostgreSQL上でVercel用wrapper経由のProduction migrationを実行
- CI temporary PostgreSQLに全migrationを適用した後の`db:assert-ready`
- Web health、public service、route not-found boundary test
- TypeScript typecheck、ESLint、Prettier、全unit test、production build
- PR上のPostgreSQL integration test

## 5. 未解決事項

- GitHub Scheduled workflowの失敗通知を確実に受ける担当者と通知先は、Repositoryの通知設定で確認する必要がある。

## 6. 次の運用条件

1. DB password変更時はVercel Productionの`DATABASE_URL`と`DIRECT_URL`を同時更新する。
2. migrationを含むreleaseは通常どおりmainへmergeし、Vercelのmigration・Schema Gate・buildがすべて成功した場合だけ公開する。
3. Production Health Smoke失敗時は新規releaseを止め、migration statusとVercel logを確認する。

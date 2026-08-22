# Phase 7 Supabase Auth Administration Adapter 実装報告

更新日: 2026-08-22

## 完了範囲

- Provider非依存の`AuthAdministrationPort`と固定結果分類
- Supabase Auth Admin User Delete Adapter
- provider user不在を成功とする冪等削除
- credential、rate limit、provider障害、timeoutの分類
- `APP_ENV`とAuth管理環境の一致検証
- HTTPS必須、Development以外のlocalhost拒否
- Service Role KeyとProvider responseを結果へ含めないテスト
- `@bunshin/auth`のVitest設定追加と既存テストを含む実行保証

## 環境変数

- `SUPABASE_AUTH_ADMIN_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_ADMIN_ENV`

3値は一括設定を必須とする。`SUPABASE_SERVICE_ROLE_KEY`を`NEXT_PUBLIC_`変数、DB、管理画面、Job payload、Audit Logへ保存しない。

## 安全境界

本Adapterは退会Execution Core、Scheduler、API、管理画面へ接続していない。そのため、この変更をdeployしてもSupabase Auth Userの自動削除は開始されない。

Production実削除の開始には、PR Cの匿名化・purge、PR DのScheduler・管理運用、Service Role Key登録担当者、backup保持期間、Go/No-Go確認が必要である。

## 後続

1. PR C: Personal Data PurgeとCOMPLETED確定
2. PR D: Scheduler、BLOCKED確認、理由付き再試行、dry-run
3. 上記完了後にAdapterを実行フローへ接続する

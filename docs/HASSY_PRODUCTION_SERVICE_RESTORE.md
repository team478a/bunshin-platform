# ハッシー本番サービス設定の復元

更新: 2026-10-25

## 原因

本番DBを読み取り専用で確認した結果、`service_configurations` に `hassy` が存在せず、ハッシーの公開サービスを解決できない状態でした。コードにはハッシーの画面・認証後の戻り先・SNS機能が存在していても、サービス設定がないため、認証後の参加状態確認が fail-closed で停止します。マナベルスタイルの設定を流用してはいけません。

## 対応

`20261025120000_seed_hassy_public_service` migrationで、ワタシワークス運営Workspace配下にハッシー専用のGroupとService設定を冪等に作成・補完します。

- service slug / 表示名: `hassy` / `ハッシー`
- visibility: `PUBLIC`
- group: `ACTIVE`
- 新規登録: `PUBLIC`
- メールログイン: 有効
- LINEログイン: 有効
- 招待コード: 無効
- 紹介元記録: 無効
- onboarding: `businessProfileEnabled=true`, `businessProfileInputMode=MINIMAL`
- 事業者プロフィール質問: 業種、事業名、商品・サービス、対象顧客、SNS目的
- SOCIAL / LINE.DAILY_NOTIFICATION: 有効
- 無料テスト定員: 100人

既存の `hassy` 設定がある場合も、対象Workspace・Groupの一致を検証してから不足する公開設定だけを補完します。別Workspaceの同名設定や異なるGroupは例外として停止します。認証情報、メール本文、他サービスのGroupやMemoryは変更しません。

## 検証

1. migrationをreview・CIで検証する。
2. mainへmerge後、Production migration runnerでこのmigrationを適用する。
3. 読み取り専用確認で `hassy` の設定、Group状態、登録policy、commercial limit、feature policyを確認する。
4. `/s/hassy` の未ログイン画面からメール登録を行い、確認リンク後にハッシーの参加登録画面が表示されることを確認する。
5. 登録完了後、ハッシーのonboardingだけが表示され、マナベルや共通アンケートへ遷移しないことを確認する。

## 未解決

Supabase Authの標準magic-linkメール件名・本文（`[BUNSHIN]`）は、このmigrationの対象外です。サービス名をメール本文へ動的に差し込むには、`{{ .ConfirmationURL }}` を使うテンプレート確認と、必要ならSend Email Hookを別途設計・承認する必要があります。今回の根本原因である「ハッシーサービス設定が存在しない」問題とは分けて扱います。

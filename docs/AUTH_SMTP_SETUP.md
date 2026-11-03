# Supabase AuthログインメールのResend設定

## 目的

ユーザーの登録・ログイン用Magic Linkを、Supabaseの組み込みメール送信ではなくResendのCustom SMTPから送信する。

`/admin/email` の「障害通知メール（Resend）」は、管理者へ運用通知を送るための別経路である。設定値や送信先を共有しない。

## 設定手順

1. Resendで認証専用の送信ドメインまたはサブドメインを登録する。
2. Resendが表示するSPF・DKIMレコードをDNSへ追加する。
3. DMARCの方針とFrom addressを確認する。
4. Supabase Dashboardで対象プロジェクトを開き、`Authentication` → `SMTP Settings`へ進む。
5. 次の値を入力する。

   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: Resend APIキー
   - Sender email: Resendで認証済みのFrom address
   - Sender name: サービス名（例: ハッシー、マナベルスタイル）

6. Magic Linkテンプレートを確認する。リンク追跡は無効にし、`token_hash`と`type=email`を本番HTTPS callbackへ渡す。
7. 本番テストアカウントで、メール受信、リンク押下、サービス別画面への復帰、ログアウト後の保護を確認する。

## 秘密情報の境界

- Resend APIキーはSMTP PasswordとしてSupabase側だけに登録する。
- Supabase Service Role Key、Management API token、DB接続情報は管理画面へ入力しない。
- APIキーやSMTPパスワードをGit、Issue、チャット、CIログへ貼り付けない。
- `/admin/email`へ登録するResend APIキーは障害通知用であり、Auth SMTP用のキーと分離する。

## 完了条件

- Resend送信ドメインが認証済みである。
- SPF・DKIM・DMARCを確認できる。
- Supabase AuthのSMTP設定が本番プロジェクトへ反映されている。
- テストメールが受信でき、Magic Linkでログインが完了する。
- 失敗時に、認証失敗理由やtokenを画面・ログへ露出しない。

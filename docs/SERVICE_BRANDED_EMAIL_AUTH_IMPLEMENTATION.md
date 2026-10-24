# サービス別メール認証確認画面

更新: 2026-10-14。実装・実機確認・本番反映は別々に扱う。D-145を参照。

## 目的と範囲

Gmail等でメールmagic linkを開いた際に、ログインを開始したLINE内ブラウザとはCookieが共有されないため、認証試行の確認画面で失敗するケースを利用者へ説明する。サービスから開始したメールログインでは、確認ページと再試行画面を対象ブランドで表示する。

## 設計

- `/auth/email`が既存の許可リストに合格した`returnTo`をメール確認URLへ渡す。`/auth/confirm`は同一originのSupabase callbackだけを処理し、URL/redirect_toの重複・矛盾・未知query、危険なpathは拒否する。
- 確認画面は既存のService auth brand resolverを使う。独立ブランドは明示allowlistだけを使い、公開Service設定が見つからない場合にService参加状態や存在を推測しない。
- attempt-scoped認証ではhidden `returnTo`を表示と失敗後の再試行画面にだけ使い、成功後の遷移は`AuthReturnAttempt.returnPath`を正本とする。旧来認証（`AUTH_RETURN_ATTEMPTS_ENABLED=false`）で試行記録がない場合に限り、同じcallbackから受け取った検証済みのサービス戻り先を遷移のfallbackとして使う。いずれも認可は遷移先で再実行する。
- 認証Cookie/proofを別ブラウザへ渡さない。違うブラウザからのcallbackは既存のAuthReturnAttempt検証で拒否し、LINEで続ける場合はLINEに戻ってLINEログインするよう説明する。
- 試行ID付きの確認画面は、表示時にも現在ブラウザのproof/試行状態を検証する。proofが見つからない場合は、認証POSTボタンを出さず、原因とログイン方法の選び直しを表示する。

## 検証

- callbackがサービス戻り先を引き継ぐこと、外部URLを拒否することをroute testで確認。
- attempt-scoped email callbackが同じbrowser proof要件を維持し、別ブラウザの証明欠落ではOTP providerを呼ばず、再試行URLに対象Serviceを保持するroute testを追加。
- CIと実端末でのLINE/Gmail遷移、ログイン成功、画面表示はマージ前/本番反映前に別途確認する。本報告時点で実機と本番認証設定は未検証。

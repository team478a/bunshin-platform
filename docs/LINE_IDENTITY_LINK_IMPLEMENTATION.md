# 明示的なLINEログイン連携

更新: 2026-10-14

## Hassy / マナベルスタイルの比較

- 両サービスは同じ`POST /auth/line`、Supabase `custom:line` Provider、共通のLINE callbackを使用する。サービスごとのLINE Messaging接続はアプリログインProviderとは別責務。
- LINE認証後のサービス画面では、そのPlatform Userのサービス参加状態を別々に認可する。マナベルの「サービスの利用状態を確認できません」は認証Provider自体の失敗を意味せず、現在のLINE identityに紐づくPlatform Userが当該サービスの参加状態を持たない場合にも発生する。
- production上でHassyとManaberuの対象者レコードを照合するには管理者権限と対象本人の確認が必要。本変更では本番個人データを読まず、Hassyの正常動作からManaberu参加権限を推測しない。

## 実装

- ログイン済みの本人がアカウント設定からLINEを明示連携できる。LINE認証callbackも同じPlatform Userに戻ったこと、LINE subjectが別Platform Userに属していないことを確認する。
- メール一致による自動統合、LINE identityの移動、Membership/Enrollment/Seatの追加・変更をしない。
- 連携試行は専用method、origin・HttpOnly proof cookie・PKCE flow・期限・single-use CASに束縛する。callback先は既存の許可済みreturn pathのみ。
- UI/APIは`LINE_IDENTITY_LINKING_ENABLED=true`および`AUTH_RETURN_ATTEMPTS_ENABLED=true`の両方が設定された場合だけ有効。既定無効。
- Supabase Manual Identity LinkingはBetaであり、環境側の設定・実機smokeが未完了なら有効化もデプロイも行わない。本PRのmigration適用、本番環境変数変更、本番アカウントの修復は別承認を要する。

## 検証 / 残課題

- auth return attempt unit test、route/security tests、migration test、型検査、lintをCIで実施する。
- CI成功は実LINE/Supabase連携・実利用者のサービス参加登録・ログイン回復の証明ではない。
- 次のrelease gate: SupabaseのManual Identity Linking設定をDEVELOPMENTで確認、既存メールアカウントへのLINE連携、新規LINE identity、別アカウントでのcallback、既に使用中のLINE subject、LINE内ブラウザの実機smokeを人間監督下で検証する。
- 既存のLINE identityが別Platform Userへ割当済みの場合は移動せず、運営者が本人確認後に別途調査する。

# 明示的なLINEログイン連携

更新: 2026-10-14

## Hassy / マナベルスタイルの比較

- 両サービスは同じ`POST /auth/line`、Supabase `custom:line` Provider、共通のLINE callbackを使用する。サービスごとのLINE Messaging接続はアプリログインProviderとは別責務。
- LINE認証後のサービス画面では、そのPlatform Userのサービス参加状態を別々に認可する。マナベルの「サービスの利用状態を確認できません」は認証Provider自体の失敗を意味せず、現在のLINE identityに紐づくPlatform Userが当該サービスの参加状態を持たない場合にも発生する。
- production上でHassyとManaberuの対象者レコードを照合するには管理者権限と対象本人の確認が必要。本変更では本番個人データを読まず、Hassyの正常動作からManaberu参加権限を推測しない。

## 実装

- ログイン済みの本人がアカウント設定からLINEを明示連携できる。LINE認証callbackも同じPlatform Userに戻ったこと、LINE subjectが別Platform Userに属していないことを確認する。
- SupabaseのLINE identity連携が成立した後、Platform側のEMAIL identity・actor・LINE subject所有確認に失敗した場合は、callbackで得たidentityをSupabaseからunlinkして部分成功を補償する。連携成立前の失敗ではunlinkしない。補償自体の失敗はLINE subjectのSHA-256ハッシュと安全なエラーコードのみをログに残し、既存のline-linkエラー画面へ戻す。
- メール一致による自動統合、LINE identityの移動、Membership/Enrollment/Seatの追加・変更をしない。
- LINE identityのログイン連携とMessaging APIの通知接続・友だち状態・通知同意は別状態として扱う。本人がサービスを指定して通知範囲へ明示同意した場合に限り、当該Serviceの本人所有Bunshinへ適用する。他Service/他Userへ横展開しない。専用LINE routingは専用接続フローを必須とし、ログイン連携から共通接続へ置換しない。
- サービス付きアカウント画面に「このサービス内の全投稿パートナーからLINE通知を受け取る」任意の未選択checkboxを追加する。認証試行のproof付き`returnPath`に同意選択を保持し、認証完了後にだけ処理する。後から設定する参加者向けにもService LINE設定画面に明示同意の一括設定を提供する。
- SHARED routingでは、同一User・同一Workspace・同一ServiceのLINE identity/ACTIVE Messaging connection/`FOLLOWING`状態、最新のサービス法務同意、全ての本人所有・非アーカイブBunshinの週次計画準備条件を先に確認する。条件未達なら通知設定を一部だけ有効化せず、対象サービスのLINE設定へ案内する。既存の通知時刻/ timezone/ quiet hours/ reminder/ pauseは保持し、Service cadenceだけ既存の配信方針に揃える。
- DEDICATED routingは専用LINE接続・友だち状態を別途確認する既存フローへ案内する。共通LINE connectionを専用接続として流用しない。通知接続の同意前に通知Preferenceを有効化せず、同時送信やRegistration completionの追加Pushをしない。
- DB schema/migrationは追加せず、既存`LineConnection`、`LineNotificationPreference`、weekly preparation jobを使う。
- 連携試行は専用method、origin・HttpOnly proof cookie・PKCE flow・期限・single-use CASに束縛する。callback先は既存の許可済みreturn pathのみ。
- UI/APIは`LINE_IDENTITY_LINKING_ENABLED=true`および`AUTH_RETURN_ATTEMPTS_ENABLED=true`の両方が設定された場合だけ有効。既定無効。
- Supabase Manual Identity LinkingはBetaであり、環境側の設定・実機smokeが未完了なら有効化もデプロイも行わない。本PRのmigration適用、本番環境変数変更、本番アカウントの修復は別承認を要する。

## 検証 / 残課題

- auth return attempt/LINE route・return path/Service通知同意 routeのテスト、型検査、lintをCIで実施する。callback検証失敗時の補償unlink（EMAIL identity不一致、actor不一致、LINE identity重複）、成立前の失敗ではunlinkしないこと、補償unlink失敗時にも既存のエラー画面へ戻ることをモックテストする。
- CI成功は実LINE/Supabase連携・実利用者のサービス参加登録・ログイン回復の証明ではない。
- 次のrelease gate: SupabaseのManual Identity Linking設定をDEVELOPMENTで確認、既存メールアカウントへのLINE連携、新規LINE identity、別アカウントでのcallback、既に使用中のLINE subject、LINE内ブラウザの実機smokeを人間監督下で検証する。
- 既存のLINE identityが別Platform Userへ割当済みの場合は移動せず、運営者が本人確認後に別途調査する。

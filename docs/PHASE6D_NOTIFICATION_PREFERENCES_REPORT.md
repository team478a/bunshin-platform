# Phase 6-D Notification Preferences 実装報告

## ゴール

LINE外部設定を待つ間に、通知同意、時刻、IANA timezone、頻度、Quiet Hours、一時停止、ReminderをBunshin単位で安全に保存できる独立Coreを完成させる。

## 実装範囲

- `LineNotificationPreference`とadditive migration
- `workspaceId + userId + bunshinId`の一意制約
- `DAILY | WEEKDAYS`
- verified-session GET / PUT API
- Bunshin詳細のmobile-first設定UI
- 同意なしの有効化拒否
- HH:mm、IANA timezone、Quiet Hours検証
- Workspace MembershipとBunshin scopeの再検証

## 境界

LINE Login、Identity、Webhook、Connection、Push、Job、配信履歴は実装していない。設定を保存しても通知は送信されない。

## 設計判断

- FREEの対象Bunshinは1体でも、内部modelはUserとBunshinの組み合わせを維持する。
- 通知同意日時は初回同意時を保持し、同意撤回時にnullへ戻す。
- Quiet Hoursは日跨ぎを許可し、開始と終了が同一の設定だけ拒否する。
- 一時停止期限はnullableとし、実行時の停止判定はPhase 6-Eで再検証する。
- Reminderは保存のみとし、実送信はPhase 6-E/Fへ分離する。

## 次へ進む条件

本PRのレビューとmigration確認後、LINE外部設定が完了するまでは6-Bへ進まない。外部設定なしでも次に進める場合は6-E Job Coreを独立PRとして設計レビューする。

# OEM支援候補メール 通知担当者設定報告

- 既存の`ServiceNotificationPreference`を`OEM_SUPPORT_CANDIDATE / EMAIL`用途で再利用した。
- 未設定時は従来互換のため有効なService Owner / Admin全員へ通知する。
- 一度保存した後は、選択した有効な管理者だけを配送キューへ入れる。
- 選択候補は同一Workspace / Serviceの有効な`SERVICE_OWNER / SERVICE_ADMIN`に限定する。
- 設定変更をService Configuration Auditへ保存する。
- 本番での実送信と管理者の異動後の表示は未確認。

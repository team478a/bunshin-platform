# ADR: 本人向け利用実績API

## Status

Accepted for Phase 1-A4 implementation (2026-11-02).

## Decision

- GET `/api/services/[serviceSlug]/bunshins/[bunshinId]/member-usage` を追加する。既存のCurrentUserProvider、resolveMemberServiceContext、GetMemberUsageSummary、PrismaMemberUsageRepositoryをcomposition rootで接続する。
- actorはverified sessionから取得し、Workspace / Serviceはslugの会員向け解決結果、Membershipは同Workspace / Service / 本人のACTIVE所属から取得する。UserやMembershipをリクエストで指定させない。Adapterの現時点での所有権・最新規約同意の再検証を維持する。管理者overrideはない。
- 集計日時はサーバーの現在時刻。timezoneは同Serviceの本人所有Bunshinに紐づく本人のLineNotificationPreferenceから取得する。通知enabledの有無と独立に保存済みtimezoneを利用し、行がない場合だけAsia/Tokyoを使う。不正な保存値は503とし、異なる日付境界へ黙って変更しない。公開query parameterは受け付けない。
- レスポンスは明示的なDTO（member-usage-api-v1）で、全期間・直近7日・30日の件数と活動日数、日時、旧生成の起動元不明件数を返す。内部scope、AI原価、投稿本文、Memory、URL、個別イベントは返さない。selfReportedPostsはSNSでの公開確認ではない。
- 成功・失敗ともprivate, no-storeとVaryを付ける。欠測・上限超過などの不完全Sourceを空集計やクライアント入力エラーへ置き換えず503にする。通常の認可・入力エラーには既存の公開エラーマッピングを使う。
- 共通HTTP Rate Limitは現行コードに存在しない。既存のAI費用予約やJobをHTTP制限の記録先へ流用しない。このAPIに限りverified user単位（Service / Bunshinを跨いで共有）で1分10回・同時1件、最大1,000ユーザーのプロセス内guardを追加し、超過は429とRetry-Afterを返す。期限内エントリを押し出して制限を迂回させず、容量超過も拒否する。finallyで同時実行枠を解放する。
- このguardは複数インスタンス全体の分散制限ではない。100社運用等で全体の厳密な上限が必要な場合、共通gateway等の分散制限を別途整備する。本PRはその実装・本番運用確認を意味しない。
- DB/schema/migration、依存、環境変数、Provider呼出し、行動ログ、lastUsedAt、UIは追加・変更しない。既存認証時のアカウント解決の動作は維持する。

## Consequences

ロードマップUIが本人の利用実績を安全に取得する入口を用意できる。利用実績の全指標、ロードマップ評価、紹介特典、提案エンジンの完成や本番公開を意味しない。

# Service専用LINEの接続と動画完成通知の復旧

## 問題と対応

メールで利用中のService参加者に専用LINEの通知先がない場合、完成済み動画の通知が `NOTIFICATION_SUPPRESSED` になる。従来の自動配信設定はSNS設定とログイン用LINE Identityを必要とするため、動画の完成通知だけを復旧できない。

`/s/[serviceSlug]/bunshins/[bunshinId]/line` で、現在のセッションの所有者が通知への同意と専用LINEのOAuth確認を行い、本人のService専用通知先を登録する。SupabaseセッションとAuthIdentityは変更しない。表示名やメールアドレスによるアカウント統合は行わない。

## 境界と再実行

- 現在のUser、公開Serviceから解決したWorkspace/Group、所有Bunshin、有効な同意済みMembership、検証済み専用LINE設定を開始時と復帰時に検証する。
- 10分期限のstateをHttpOnly/Secure/SameSite=Lax Cookieと照合し、DBではハッシュと単回消費を管理する。PKCE S256、nonce、issuer、audience、subject、expiryを検証する。消費時にnonce/verifierを消去し、期限切れ行は次の開始時に削除する。テーブルはRLS有効、公開ポリシーなし。
- LINEの秘密情報、OAuth code、token、subject、callback URLをログへ出さず、失敗した操作名とrequest IDだけを記録する。
- configuration/provider subjectの一意制約により、他の登録との競合は拒否する。接続登録後の通知設定更新が失敗した場合、接続は残るが成功扱いにせず再接続を案内する。
- 通知許可判定はWorkspace所属に加え、本人所有Bunshinの有効・同意済みGroup所属を許可する。通知停止、夜間停止、他人・別Serviceの境界は維持する。
- 完成から23時間以内、有効な出力がある本人の動画で、未送信かつ抑止取消の通知だけを再開する。通知状態の条件付き更新とジョブ作成を同一トランザクションに置き、動画ID単位の一意キーで重複を防ぐ。完成済み動画の生成・保存処理は再実行されない。

## 本番反映と受入確認

1. PRのCI（型、lint、全テスト、ビルド、PostgreSQL migration/統合テスト）を確認してマージする。
2. `20260908060000_service_line_link` migrationとVercel本番Readyを確認する。
3. 対象ServiceのLINE LoginチャネルのCallback URLに `https://www.watashi-works.com/auth/service-line/callback` を追加する。既存Callback URLは残す。対応するMessaging APIの公式アカウントがLoginチャネルにリンク済みであることを確認する。
4. メールの現在のログイン状態から上記接続画面を開き、本人が同意とLINE認証を完了する。必要なら公式LINEを友だち追加して再接続する。
5. 対象動画の「この動画の完成通知を送る」を実行する。ジョブ実行後、通知SENTと実際のLINE受信を確認する。通知の停止時間中は時間外に再実行する。

本人のLINE確認と実際の受信が終わるまでは、本番の通知復旧完了とは扱わない。

公式仕様: [LINE Login API](https://developers.line.biz/en/reference/line-login/)、[PKCE](https://developers.line.biz/en/docs/line-login/integrate-pkce/)、[セキュリティチェックリスト](https://developers.line.biz/en/docs/line-login/security-checklist/)。

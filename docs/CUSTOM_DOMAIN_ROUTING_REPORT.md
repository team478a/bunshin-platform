# 独自ドメイン接続・公開 実装報告

更新日: 2026-09-15

## 調査結果

従来はホスト名、状態、確認メモを保存できるだけで、`VERIFIED`と`ACTIVE`への変更はAPIで禁止されていました。Vercelへの登録、DNS接続確認、受信ホスト名からServiceを解決する処理もありませんでした。

## 実装内容

- 管理画面からVercelへドメインを登録し、所有確認とDNS接続状態を再確認できるようにした。
- 所有確認とDNS接続の両方が完了した場合だけ`ACTIVE`へ遷移する。
- DNS設定が足りない場合は、Vercelが返したTXT、A、CNAMEの設定値を管理画面へ表示する。
- `ACTIVE`な独自ホストへのアクセスを、対応する`/s/{serviceSlug}`へNext.js Proxyでrewriteする。
- 独自ドメイン上の同一Origin POSTとLINE／メール認証callbackを扱えるようにした。
- ホスト名変更時は過去の確認日時と公開日時を破棄し、再確認を必須にした。
- システム本体、localhost、`vercel.app`のホスト名はサービス専用ドメインに登録できない。

## セキュリティと境界

- Vercel API操作はSUPER_ADMINだけが実行できる。
- 組織の独自ドメイン権利と停止状態を操作のたびに再確認する。
- ルーティング対象は、独自ドメイン、Service、Workspaceがすべて利用中の場合に限定する。
- Vercel API tokenは`VERCEL_CUSTOM_DOMAIN_TOKEN`でサーバー環境だけに保存する。
- Proxyが付与する独自ホスト識別ヘッダーは、受信値を削除してから再設定する。

## 検証

- Webテスト: 228ファイル、1074テスト成功
- Web typecheck: 成功
- Web lint: 成功
- Web production build: 成功

## 運用開始前の設定

1. Vercelの環境変数へ`VERCEL_CUSTOM_DOMAIN_TOKEN`を登録する。
2. `VERCEL_PROJECT_ID`を確認する。Team配下の場合は`VERCEL_TEAM_ID`も確認する。
3. LINEまたはメールログインを使う独自ドメインは、Supabase AuthのRedirect URLsへ`https://{hostname}/auth/**`を追加する。
4. 管理画面でホスト名を保存し、「Vercelへ登録・接続を確認」を押す。
5. 表示されたDNSレコードを設定し、状態が「利用中」になるまで再確認する。

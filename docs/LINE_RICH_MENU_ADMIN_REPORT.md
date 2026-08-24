# LINEリッチメニュー管理画面 実装報告

作成日: 2026-08-24  
対象: Phase 7-O / Operations Admin Console PR 4

## 実現した運用

管理者は`/admin/line`から次の操作を行える。

1. メニュー名、説明、固定テンプレート、画像、変更理由を入力する
2. 下書きを保存する
3. 非公開画像を画面で確認する
4. 確認済みにする
5. LINEで公開・切替する
6. 公開中のメニューを停止する

画像ファイルや設定ファイルをサーバーへ手作業で置く必要はない。

## 固定テンプレート

- 横4列
- 上2個・下2個

操作は次の4種類に固定し、管理者による任意URL入力を許可しない。

- 今日やること
- 分身一覧
- お知らせ設定
- アカウント

リンク先は配備環境の`APP_URL`からサーバー側で生成する。

## 画像保存

- Supabase Storageの非公開`line-rich-menus`Bucketを使用する
- Bucketがない場合はService Roleにより自動作成する
- PNGまたはJPEGのみ
- 最大1MB
- 2500×843または2500×1686のみ
- ファイル名を信用せず、画像ヘッダーから実寸を検証する
- SHA-256をDBへ保存する
- 環境別prefixへランダムUUID名で保存する
- 管理画面の確認画像は管理者認証済みAPIから`private, no-store`で返す

## LINE Provider Adapter

- 現在環境の確認済みACTIVE LINE設定だけを使用する
- LINE全体停止中は公開しない
- LINE側のProvider名に環境、内部ID、versionを含める
- 再試行時は同名メニューを検索して再利用する
- 画像は`api-data.line.me`へ送信する
- 公開時はLINE公式アカウントの標準メニューへ設定する
- 停止時は標準メニューを解除し、対象メニューを削除する
- TokenやProviderレスポンス本文を画面・ログへ出さない

## 権限と環境分離

- 一覧と画像確認は有効なPlatform Admin
- 下書き作成・確認は`SUPER_ADMIN`または`OPERATOR`
- 公開は`SUPER_ADMIN`
- 停止は`SUPER_ADMIN`または`OPERATOR`
- APIはRequest bodyから環境を受け取らず、サーバー実行環境から決定する
- Production公開時は理由入力と確認画面を必須にする

## API

- `GET /api/admin/line-rich-menus`
- `POST /api/admin/line-rich-menus`
- `GET /api/admin/line-rich-menus/:id/image`
- `POST /api/admin/line-rich-menus/:id/verify`
- `POST /api/admin/line-rich-menus/:id/publish`
- `POST /api/admin/line-rich-menus/:id/disable`

状態変更APIは同一Origin検証を行う。

## テスト観点

- 再試行時に既存LINEメニューを再利用する
- LINEへ送る4つのリンクが固定BUNSHIN URLだけである
- 画像アップロード先がLINEの画像専用Endpointである
- LINE全体停止中は外部通信しない
- Provider失敗時はApplication CoreがDB状態を進めない（Coreテストで検証済み）

## 運用前提

既存の`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、環境一致設定を再利用する。これらの起動秘密情報は管理画面へ移さない。

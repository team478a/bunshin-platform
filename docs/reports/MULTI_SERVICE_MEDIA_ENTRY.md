# サービス専用 画像・動画導線 接続報告

## 結果

サービス参加者は、サービスホームから画像・動画機能へ移動した後も`/s/{serviceSlug}`配下で操作できる。一般向け画面に内部のGroup IDや「グループ」導線を表示しない。

## 追加した入口

- `/s/{serviceSlug}/images`
- `/s/{serviceSlug}/videos`
- `/s/{serviceSlug}/video-assets`
- `/s/{serviceSlug}/videos/{videoProjectId}`

## 安全境界

- Slugから公開中のサービス設定と内部Group IDをサーバー側で解決する。
- クライアントからWorkspace ID・Group IDを受け取らない。
- 既存のACTIVE Membership、参加同意、機能Policy、参加者別Assignmentを再検証する。
- 画像は本人所有の投稿案、動画は本人所有の企画・素材だけを扱う。
- Campaign、商品、生成履歴は同じGroup IDで制限する。
- URLだけを別名にせず、既存の生成APIとRepository認可を継続利用する。

## 変更しないもの

- 画像・動画の生成方式
- ポイント消費と上限判定
- 外部レンダリングProvider
- SNSへの手動投稿方針

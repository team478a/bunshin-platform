# サービス専用Bunshin API・画面 実装報告

## 目的

サービス参加者が、共通の個人向け画面へ移動せず、参加サービスの中だけで投稿用Bunshinを作成・確認できるようにする。

## 実装内容

- `/s/{serviceSlug}/bunshins` にサービス専用一覧を追加
- `/s/{serviceSlug}/bunshins/new` に4問だけの簡単作成画面を追加
- `/api/services/{serviceSlug}/bunshins` に一覧・作成APIを追加
- サービスホームから「投稿パートナーを作る・見る」導線を追加
- 利用者向け表示ではBunshinを「投稿パートナー」と説明

## セキュリティ境界

- クライアントから `workspaceId` と `groupId` を受け取らない。
- URLのサービスSlugをサーバー側で解決し、正しいWorkspace・Groupを作成入力へ固定する。
- 作成時はCore Repositoryが作成者と所有者のACTIVEサービス参加を再検証する。
- 一覧は `ListServiceBunshins` を使用し、他サービス・個人Bunshin・未参加ユーザーのデータを返さない。
- POSTは同一Originを必須とする。

## 入力体験

内部SlugやBunshin種別は利用者へ入力させない。以下だけを質問する。

1. 投稿パートナーの名前
2. 何について発信するか
3. 誰に見てほしいか
4. どんな話し方にするか（選択式）

## 次の段階

MS-2Cでサービス所属Bunshinの詳細画面と、SNS設定・毎日の投稿案へのサービス専用導線を接続する。

# Phase 7 Legal Admin 実装レポート

## 完了範囲

- 利用規約・プライバシーポリシーの下書き作成
- 文書種別ごとの自動version採番
- 公開時に旧版をRETIREDへ移行
- 適用日時を含む公開版
- Platform Admin専用管理画面 `/admin/legal`
- 公開ページ `/terms` と `/privacy`

## 権限

- SUPER_ADMIN / OPERATOR: 下書き作成・公開
- SUPPORT / READ_ONLY: 管理画面の閲覧のみ
- 一般ユーザー: 公開済みの現行版だけ閲覧

権限がない管理画面・APIはresource存在を隠すため404とする。

## 設計判断

公開文書は上書きせずversion管理する。本文はプレーンテキストとして保存・表示し、任意HTMLは受け付けない。法的文章の内容はシステムが自動確定せず、人間レビュー後に管理画面から公開する。

## DB変更

`20260821220000_legal_documents`

## 対象外

- 同意記録
- 同意バージョン更新時の再同意
- アカウント削除・退会
- 法的文章そのものの作成・承認

## 次Slice

公開中のTERMS / PRIVACY versionをUser Consentへ記録し、未同意ユーザーを同意画面へ誘導する。

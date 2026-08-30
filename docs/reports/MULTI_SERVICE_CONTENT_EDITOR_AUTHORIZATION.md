# コンテンツ担当者の限定権限 接続報告

## 結果

サービス内の「コンテンツ担当者」は、次の3機能だけを管理できます。

- 公式資料・FAQ
- 公式商品情報
- 参加募集

サービスの見た目・登録設定、専用LINE、参加者、利用規約、バッジ、参加者専用URLは管理できません。

## 認可境界

対象画面はService SlugからWorkspaceとServiceをサーバー側で解決し、有効な所属と`SERVICE_OWNER / SERVICE_ADMIN / CONTENT_EDITOR`のいずれかを確認します。保存・公開処理ではProduct Pack、Group Knowledge、Campaignの各RepositoryがWorkspace、Service、User、Active Membership、Service Roleを再検証します。

旧Group機能との互換性を維持するため、従来のGroup Managerは引き続き操作できます。`CONTENT_EDITOR`の追加認可はService Configurationを持つServiceだけに限定し、通常Groupへは広げません。

## 非対象

設定、LINE、参加者、法務、バッジ、外部成果計測URLのRepository認可は変更していません。一般参加者の権限も変更していません。

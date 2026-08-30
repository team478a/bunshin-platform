# サービス管理者向け専用LINE設定

## 実装範囲

サービス管理者が、自サービスで使用するLINE方式を選び、専用LINEのChannel情報を登録、接続確認、有効化できる画面を追加した。

既存の環境分離、暗号化、Version管理、接続テスト、ACTIVE一意制約、Webhook Routing Key、Audit Logをそのまま利用する。

## セキュリティ境界

- Service Slugをサーバー側でWorkspaceと内部Service IDへ解決する。
- ACTIVEなService Manager MembershipまたはPlatform Operations権限を要求する。
- Service Managerは自サービスの設定だけを操作できる。
- Workspace IDは一覧取得時にサーバー側で上書きする。
- RepositoryはWorkspace、Service、Environmentをすべて条件に含める。
- Channel SecretとAccess Tokenは暗号化して保存し、保存後は末尾マスクだけを返す。
- 接続確認済みかつエラーなしのVersionだけを有効化できる。
- 設定変更と接続確認は既存Audit Logへ記録する。

## 対象外

LINE公式アカウントの自動作成、LINE Developers Consoleの自動変更、共通LINEと専用LINE間のユーザー移行、課金プラン判定は含めない。

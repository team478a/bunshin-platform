# マルチサービス基盤 MS-1B 管理API・UI 実装報告

## 目的

システム管理者が、Groupを別画面で先に準備せず、サービス基本情報・ブランド・登録方針を一度に作成できるようにする。

## 実装内容

- `/admin/services`サービス管理画面
- `/api/admin/services`作成API
- Group、Group Membership、Service Configuration、Brand、Registration Policy、Auditの同一Transaction作成
- 作成済みサービスの公開状態、登録方式、専用slug表示
- 管理画面ナビゲーション
- スマートフォンでは1列になる設定フォーム
- 保存中・成功・失敗の状態表示

## 権限と安全性

- 作成はACTIVEなSUPER_ADMINだけに許可する。
- 対象WorkspaceはACTIVEなORGANIZATIONに限定する。
- Mutationはsame-originとverified sessionを必須にする。
- workspaceIdはサーバー側で再検証する。
- ClientはgroupIdやserviceIdを指定しない。Group IDはTransaction内で生成する。
- 新しいGroupの最初のMANAGERとして操作者をACTIVE登録する。
- Service設定と監査が失敗した場合はGroup作成もRollbackする。
- API応答は`private, no-store`とする。

## 初期値

- 公開状態はPRIVATEを推奨表示する。
- 登録方式はINVITATION_ONLYを初期値にする。
- メール登録を有効、LINE登録を無効から開始する。
- Powered by ワタシワークスを表示する。
- Fontは`system-ui`を使用する。

## 今回含めないもの

- 作成済みサービスの編集・停止
- `/s/{serviceSlug}`公開入口
- 画像ファイルの直接Upload
- サービス別利用規約本文
- サービス内ロール
- 第一号サービスの実データ作成

## 次の実装

MS-1Cで公開slugからサービスを安全に解決する専用入口、Service Context、サービス別ブランド表示を実装する。

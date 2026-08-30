# マルチサービス基盤 MS-1A Core Persistence 実装報告

## 目的

既存`Group.id`を内部のサービス識別子として維持し、サービス基本情報、ブランド、登録方針を安全に保存するCore Persistenceを追加する。

## 追加したデータ

- `ServiceConfiguration`
  - 一意なslug
  - 表示名、説明、運営者、問い合わせ先
  - 公開・非公開、利用期間
  - Powered by ワタシワークス表示
  - 利用規約・プライバシーポリシーURL
- `ServiceBrand`
  - ロゴ、アイコン、ファビコン
  - 主色、副色、表示フォント
- `ServiceRegistrationPolicy`
  - 公開登録、招待限定、承認制、受付停止
  - メール・LINE登録
  - 招待コード、紹介元
  - オンボーディング・アンケート設定
- `ServiceConfigurationAudit`
  - 作成・変更前後、理由、操作者、日時

## 境界

- `workspaceId + groupId`をすべての関係で固定する。
- 1 Groupにつき各設定は最大1件とする。
- 保存はACTIVEなSUPER_ADMINだけに許可する。
- Group管理者とWorkspace OWNER／ADMINは、自分の範囲だけを読み取れる。
- 公開slug解決は公開中かつACTIVEなGroup、利用期間内だけを返す。
- Groupと並行する新しいService IDは作らない。

## 入力安全性

- slugは小文字英数字とハイフンだけを許可する。
- 法務・画像URLはHTTPSを必須にする。
- URL内の認証情報、任意Query、Fragmentを拒否する。
- ブランドカラーは6桁HEXへ正規化する。
- 開始日時より終了日時が後であることを検証する。
- メールまたはLINEの少なくとも一方を登録手段として必須にする。
- Migrationにもslug、期間、HTTPS、色のDB CHECKを追加する。

## 今回含めないもの

- 管理API・管理画面
- `/s/{serviceSlug}`画面
- サービス別利用規約本文
- サービス内ロールの追加
- Bunshin、Mission、Point、Badgeのサービス分離
- 第一号サービスの作成
- 課金、OEM、独自ドメイン

## 次の実装

MS-1BでPlatform Admin向けのサービス作成・設定API/UIを追加する。MS-1Cで公開slugを使う専用入口とService Contextを追加する。

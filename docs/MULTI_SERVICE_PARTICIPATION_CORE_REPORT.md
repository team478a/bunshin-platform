# マルチサービス基盤 MS-1D-A 参加・法務同意 Core Persistence 実装報告

## 目的

公開登録と承認制登録を、既存Groupを内部Service境界として安全に保存できるCoreを追加する。招待限定は既存の一回限り招待機能を継続利用する。

## 実装内容

- `PENDING_APPROVAL`参加状態
- 参加申請・承認の監査イベント
- サービス別利用規約・プライバシー文書の版管理
- 利用者、Service Membership、文書版を結ぶ同意履歴
- PUBLIC登録時の即時有効化
- APPROVAL_REQUIRED登録時の承認待ち保存
- INVITATION_ONLY／CLOSEDで公開登録を拒否
- Service Managerによる承認Use Case

## Isolation

- 公開登録はslugをサーバーで解決し、ClientからService IDを受け取らない。
- 法務同意の外部キーはWorkspace、Group、Membership、Userを複合一致させる。
- 最新の公開済み文書版すべてへの同意が一致しない場合は参加を作成しない。
- 他Serviceの文書IDやMembership IDは利用できない。

## 今回含めないもの

- 公開登録・承認のHTTP API/UI
- サービス別法務文書の管理画面
- 招待メール配信のブランド変更
- オンボーディング回答

## 次の実装

MS-1D-Bで、サービス入口からの規約確認、参加申請、管理者承認API/UIをverified sessionへ接続する。

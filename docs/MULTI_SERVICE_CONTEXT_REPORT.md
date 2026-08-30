# マルチサービス基盤 MS-1C 専用入口・Service Context 実装報告

## 目的

サービスごとの公開slugを専用URLとして利用し、公開画面を表示する前にサーバー側でWorkspaceと内部Service境界（`Group.id`）を確定する。

## 実装内容

- `/s/{serviceSlug}`のサービス専用入口
- 公開中・有効期間内・ACTIVEなサービスだけを解決するService Context
- サービス名、説明、ロゴ、ブランドカラー、表示フォントの反映
- 登録方式別の案内（一般公開、招待限定、承認制、受付停止）
- サービス別運営者、問い合わせ、利用規約、プライバシー表示
- `Powered by ワタシワークス`の設定連動
- LINEログイン後に同じサービス入口へ安全に戻るAllowlist
- 不正slug、任意query、別画面へのOpen Redirect拒否

## データ境界

- ClientからWorkspace IDやGroup IDを受け取らない。
- slugから取得した`workspaceId`と`groupId`だけをService Contextとする。
- PRIVATE、停止中、開始前、期限切れのサービスはRepositoryで除外する。
- Service Contextを解決できない場合は404とし、共通サービスや別サービスへFallbackしない。

## 登録方式の表示

- `PUBLIC`: すぐに開始できる案内
- `INVITATION_ONLY`: 招待リンクが必要であることを案内
- `APPROVAL_REQUIRED`: 参加申請後に確認が必要であることを案内
- `CLOSED`: 新規受付停止を表示し、登録操作を表示しない

## 検証

- Service ContextがRepositoryで確定したWorkspace／Service IDを保持すること
- 不正slugではDBへ問い合わせないこと
- LINE戻り先が正規の`/s/{serviceSlug}`だけを許可すること
- query、危険なslug、別originを拒否すること
- Web typecheck、lint、対象testを実行すること

## 今回含めないもの

- 新規Service Membershipの作成
- 招待コード入力・参加承認API
- サービス別オンボーディング回答
- サービス別法務同意の保存
- 既存Bunshin／Mission等のService Context移行

## 次の実装

MS-1Dとして、Service Membership、サービス別法務同意、公開登録・招待・承認制の参加フローを実装する。その後MS-2で主要データのService分離を進める。

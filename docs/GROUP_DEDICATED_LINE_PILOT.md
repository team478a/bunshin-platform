# グループ専用公式LINE 限定パイロット

## 目的

一般提供やOEM販売に先行して、システム管理者が明示的に許可したテストグループだけで、その企業・グループが所有する公式LINEを利用できるようにする。

## 利用方式

グループと配備環境ごとに次のいずれかを明示する。

- `SHARED`: ワタシワークス共通LINEを利用する
- `DEDICATED`: グループ専用LINEを利用する
- `DISABLED`: LINEを利用しない

`DEDICATED`は`pilotEnabled = true`の場合だけ保存できる。設定がないグループは既存互換のため`SHARED`として扱うが、`DEDICATED`を選んだ後は専用設定の不足・停止・接続未確認を理由に共通LINEへ戻さない。

## 第一実装単位

- Group、Workspace、Environment単位のRouting Policy
- Group専用Channel設定の追記型version
- 環境・GroupごとのACTIVE最大1件
- Login Secret、Messaging Secret、Access Tokenの暗号化保存欄
- 接続確認日時と安全なエラー分類
- 全体停止、配信上限、key version
- Webhookを安全に識別するランダムRouting Key
- actor、理由、before／afterを持つAudit

Callback、Webhook、LIFF URLは配備URLとRouting Keyからサーバー側で生成し、自由入力として保存しない。

## 配信解決

配信Recordへ生成時点のGroup IDをSnapshotする。送信直前にWorkspace、Group、Membership、Routing Policy、実行環境、ACTIVE設定、接続確認、全体停止を再検証する。

1. Group IDなし: 共通LINE
2. `SHARED`: 共通LINE
3. `DEDICATED`: 同じGroup・環境の確認済みACTIVE設定
4. `DISABLED`: 送信取消
5. `DEDICATED`で設定不足・停止・不一致: 送信失敗。共通LINEへfallbackしない

Group IDは、CampaignまたはGroup限定機能の確定済みContextから取得する。利用者入力のGroup IDを信用しない。

## 開始準備の自動診断

サービス管理ホームでは、登録設定とRouting Policyの矛盾、`pilotEnabled`、接続確認済みACTIVE設定、全体停止、直近の接続エラー、現在の設定版への標準リッチメニュー公開を一括確認する。`SHARED`の場合は同じ実行環境の共通LINEが接続確認済みかを確認する。秘密情報そのものやLINE User IDは診断結果へ含めない。

## WebhookとLogin

- Webhook URLは推測困難なRouting Keyを含むが、Routing Keyを署名の代わりにしない
- 対象Group設定のMessaging Secretで未変更raw bodyを署名検証する
- Login stateへGroupとConfiguration versionを署名付きで保持する
- Callback後にUser、Workspace、Group、Membership、Environmentを再検証する
- LINE user IDを別Channel間で同一と仮定しない
- Token、Secret、LINE user ID、Provider応答をAuditや通常ログへ保存しない

## 管理権限

- パイロット許可、方式変更、使用開始、全体停止: `SUPER_ADMIN`
- 下書き登録、接続確認: `SUPER_ADMIN | OPERATOR`
- Group Manager: 設定状態と登録URLの閲覧のみ。Secret登録・変更は不可
- 参加者: 自分が使うLINEが「ワタシワークス」か「グループ専用」かだけ確認可能

Productionの変更理由は必須とし、別環境からProduction Secretを使用しない。

## 次の実装単位

1. Repository／Use Case／Isolation test
2. 管理APIと接続確認
3. システム管理画面とGroup管理者向け読取画面
4. Mission配信へのGroup Snapshotとfail-closed resolver
5. 専用Webhook、Login、LIFF、Rich Menu
6. テストグループでのProduction Gate

## 対象外

- 一般グループへの自動開放
- 共通LINEから専用LINEへの利用者自動移行
- 複数Group間のLINE Identity共有
- 専用LINE設定不備時の共通LINE fallback
- OEMブランド、Tenant独自価格、独自請求
- LINEマーケティング、ステップ配信、AI自動返信

## 完了条件

- 許可されたテストグループだけが`DEDICATED`を選べる
- Group・EnvironmentごとにACTIVE設定が最大1件
- 別Group、別Workspace、別EnvironmentのSecretを解決できない
- 専用設定の停止・不備時に共通LINEから送信されない
- Group退会・停止後に未送信通知が送られない
- Webhook署名を正しいGroup設定だけで検証する
- 管理操作と送信設定解決を監査できる
- SecretとProvider応答が画面、ログ、Auditへ出ない

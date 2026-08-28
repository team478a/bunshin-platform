# テストグループ専用公式LINE 実装報告

更新日: 2026-08-28

## 1. 目的

一般提供やOEM提供を開始せず、システム管理者が明示的に許可したテストグループだけで、グループ独自のLINE Login／Messaging APIチャネルを利用できるようにする。

## 2. 実装範囲

- Group・Environment単位の`SHARED | DEDICATED | DISABLED` Routing Policy
- Group専用LINE設定の追記型Version管理
- Environment・GroupごとのACTIVE最大1件
- LINE Login Secret、Messaging Secret、Channel Access Tokenの暗号化保存
- Secretの末尾マスク表示
- Provider接続確認と確認結果の保存
- 接続確認済みVersionだけの有効化
- Group管理画面からの方式選択、下書き保存、接続確認、有効化
- 配備URLから生成する読み取り専用Callback／Webhook／LIFF URL
- Group専用Messaging設定の実行時解決
- Group、Membership、同意、Environment、Pilot、設定状態の実行直前再検証
- Group専用Webhook Routing Key
- Webhook署名検証、重複防止、Follow／Unfollow反映
- Unfollow時の未送信Group配信取消
- Group専用LINE user IDを共通LINE user IDと別に保持するConnection
- 配信作成時のGroup IDと設定Version Snapshot

## 3. 権限

- SUPER_ADMIN
  - Routing Policy変更
  - 専用LINE設定Versionの登録
  - 接続確認済みVersionの有効化
- OPERATOR
  - 接続確認
- Group管理者
  - 状態確認のみ
- 一般参加者
  - 管理設定を閲覧・変更できない

Repository層でも権限を検証し、画面やAPI Routeの判定だけに依存しない。

## 4. Fail-closed方針

`DEDICATED`選択時、以下のいずれかに該当する場合は送信しない。

- Pilotが許可されていない
- 対象Environmentと設定Environmentが一致しない
- ACTIVE設定がない
- 接続確認前または接続エラー中
- 全体停止中
- Groupが停止中
- Membershipが停止・失効・未同意
- UserまたはWorkspaceが停止中
- Group専用Connectionがない、友だち状態でない、通知同意がない

専用LINE設定の不備を、ワタシワークス共通LINEへ黙ってFallbackしない。

## 5. URLとSecret

- Callback、Webhook、LIFF URLは管理者の自由入力にしない。
- 配備URLとサーバー生成Routing Keyから生成する。
- Secret、Token、Provider生レスポンスを通常ログ、Audit、画面へ出さない。
- Webhookは対象Group設定のMessaging Secretで署名検証する。
- Group専用LINEのprovider user IDはConfiguration単位で保存し、共通LINEや別Groupと共有しない。

## 6. データ変更

- Group配信へ`groupId`と`groupLineConfigurationId`のSnapshotを追加
- `GroupLineConnection`を追加
- `GroupLineWebhookEvent`を追加
- Group専用設定へWebhook Routing Keyを追加
- Group、Workspace、Membership、User、Configurationを複合外部キーで固定
- Environment・Group・ACTIVEの部分一意制約を維持

適用済みMigrationは編集せず、追加Migrationとして管理する。

## 7. テスト

確認対象:

- 別Workspace／別Groupの設定を利用できない
- DEDICATED設定不備時に共通LINEへFallbackしない
- ACTIVE設定だけを配信へ使用する
- 配信作成時に設定Versionを固定する
- Group Membershipと同意を実行直前に再確認する
- Webhook Routing KeyとEnvironmentの一致
- 不正署名の拒否
- Webhook再送の重複処理防止
- Follow／Unfollowの状態反映
- Unfollow時に対象Groupの未送信配信だけを取消する
- 別Configuration／別GroupのLINE user IDを混同しない

ローカル確認結果:

- Application tests: 59 files／252 tests PASS
- Database tests: 19 files／55 tests PASS
- `git diff --check`: PASS（改行コード警告のみ）
- Web tests／typecheck: 依存再取得がネットワーク制限で完了せず、ローカルでは未完了。CIで必ず確認する。

## 8. 運用開始前に必要な外部設定

1. テストグループを作成する。
2. Groupの専用LINE Pilotを有効にする。
3. Group専用のLINE Login ChannelとMessaging API Channelを同一Provider配下に作成する。
4. 管理画面にChannel情報を保存する。
5. 画面に表示されたCallback／Webhook URLをLINE Developersへ登録する。
6. 接続確認を成功させる。
7. 対象Versionの使用を開始する。
8. テスト参加者がGroupへ参加・同意し、専用LINEとのConnectionを完了する。
9. テスト送信、Webhook、Unfollow、再送を確認する。

## 9. 対象外

- 全Groupへの一般提供
- Group管理者によるSecret登録
- Reseller／Private OEM
- Group別課金・決済
- 共通LINEと専用LINEの自動Fallback
- Group間のLINE Identity共有
- 本番チャネルをPreview／Developmentから利用すること

## 10. 次の条件

CIのformat、typecheck、lint、test、buildが全て成功し、Migrationレビューが完了した後にテストグループへ適用する。一般提供はテスト結果と販売プラン判断後の別Phaseとする。

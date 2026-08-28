# ワタシポイント Phase P-2 行動連携 実装報告

## 対象行動

- 企画の初回確認: `MissionActivity.VIEWED`を正本に1WP／日
- 投稿完了: `PostRecord`を正本に5WP／日
- 週3回投稿: 同じ利用者の`PostRecord`を対象地域時間で週集計し10WP／週

ログイン付与は実装していない。

## 冪等性

- 元イベント処理は`workspaceId + eventType + sourceEventId`で一意にする。
- 日次付与は`ruleId + day`、週間付与は`ruleId + week`を口座の冪等Keyにする。
- 同じ元イベントの再送、同日の複数閲覧・投稿、週3件目以降の投稿でも重複付与しない。
- 処理EventとポイントTransactionは同じSerializable DB Transactionで確定する。

## 境界

- ACTIVE User、Workspace、Workspace Membershipを実行時に再確認する。
- Campaign由来の場合は同じWorkspaceのCampaignとGroupを解決し、Transactionへ帰属を固定する。
- RuleはSystem、Workspace、Group、Campaignのうち最も具体的なACTIVE Versionを選ぶ。
- Ruleの期間と予算を付与直前に確認する。
- 投稿本文、Mission内容、Memory、Provider情報をポイント処理Eventへ保存しない。

## 運用

- 初期RuleはMigrationで固定IDを使用し、企画確認1WP、投稿5WP、週3回10WPを有効化する。
- 付与の有効期限は行動日から180日後が属する月の末日とする。
- Processorは最大500件のBatchで実行でき、結果を安全な件数だけで返す。

## 対象外

利用者API／画面、定期Job登録、管理画面、交換、失効処理、DLQ管理画面は後続Phaseへ分離する。

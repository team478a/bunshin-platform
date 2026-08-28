# ワタシポイント Phase P-1 Core Persistence 実装報告

## 調査

- 行動の正本は既存`MissionActivity`、`MissionDecision`、`PostRecord`であり、本変更では接続していない。
- 販売プラン用Creditとワタシポイントは責務が異なるため、別の型・台帳にした。
- Workspace Membershipを本人操作の境界とし、Group／Campaign指定時は同じWorkspaceに属することをRepositoryで検証する。

## 実装

- ポイント口座、版管理Rule、Rule予算、追記型Transaction、消費元Link、処理Eventを追加した。
- 付与、消費、返却、残高取得のApplication Port／Use Caseを追加した。
- 残高は条件付き更新し、DB CHECKでも負数を拒否する。
- Transactionは口座単位の冪等Key、処理EventはWorkspace・Event種別・元Event IDで重複を拒否する。
- 消費元は有効期限が近い付与を優先し、期限なしを最後にする。
- 返却は元の消費Transactionを本人・Workspace範囲で再検証し、過剰返却を拒否する。

## セキュリティと分離

- 全操作で`workspaceId + actorUserId`を必須にした。
- ACTIVE User、Workspace、Workspace Membership以外を拒否する。
- Campaignだけの指定を拒否し、Group／Campaignが対象Workspaceに存在することを確認する。
- 投稿本文、Prompt、Knowledge、Memory、LINE user ID、Provider情報をポイント台帳へ保存しない。

## 対象外

- 既存Activityからの自動付与Processor
- 利用者API／画面、管理画面、CSV
- 画像生成・追加企画生成との交換
- 失効・照合・再処理Job
- Group独自Ruleの作成・承認

これらはPhase P-2以降へ分離する。

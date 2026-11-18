# 外部OAuth staging PoC修正報告

## 調査結果

Vercelのホストruntimeは`NODE_ENV=production`のため`APP_ENV=development`を拒否する。一方、旧実装は`APP_ENV=staging`のOAuth同意も一律停止していたため、Supabase preview branchとVercel custom environmentを使ったPR-06の実機PoCを開始できなかった。

## 変更

- stagingの一律停止を外し、確認済みclient catalogがある場合だけOAuth SDKと本人確認へ進む。
- catalog空、callback metadata不足、client/user/scope/callback不一致の拒否は変更しない。
- stagingの確認済みclientと、空catalogの停止を自動テストする。

## 対象外

ProductionのOAuth client登録、Production設定、本番デプロイ、Grant発行、Grok実接続の完了判定はこの修正に含めない。

# AIキャラクター管理画面 実装報告

## 管理者の操作順

1. キャラクター名と役割を登録
2. 権利者、利用範囲、期間、同意確認を記録
3. 外見、世界観、生成指示、禁止内容、安全ルールを公開

## 安全性

- サービス管理者だけが利用できる。
- Character、License、Prompt Versionを同じWorkspace・Serviceへ限定する。
- 有効期間外または別CharacterのLicenseでは公開できない。
- 公開時点のLicenseをSnapshotし、後日の変更で過去条件を上書きしない。
- 旧Prompt Versionと変更履歴を削除しない。

## 次のPR

AV-4Cで基準画像のPrivate Storage Upload、画像内容確認、署名付き表示、動画作成時Snapshotを接続する。

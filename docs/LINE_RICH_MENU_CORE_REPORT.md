# LINEリッチメニューCore 実装報告

作成日: 2026-08-24  
対象: Phase 7-O / Operations Admin Console PR 3

## 完了範囲

- 環境別、版管理されたリッチメニュー定義
- 画像の保存先、SHA-256、Content-Type、縦横サイズの記録
- 4つの固定操作とタップ領域
- `DRAFT`、`VERIFIED`、`ACTIVE`、`DISABLED`、`ERROR`の状態
- 下書き作成、確認済み化、公開、停止のApplication Use Case
- LINE登録・停止をApplicationから分離するProvider Port
- 操作ごとの決定的な冪等キー
- 作成、確認、公開、停止の監査記録
- 環境ごとに公開中を最大1件にするDB部分一意制約

## 安全境界

- 操作は「今日やること」「分身一覧」「お知らせ設定」「アカウント」の4種類に固定した。任意URLや任意LINE actionは保存しない。
- 画像はPNG/JPEG、幅2500px、高さ843pxまたは1686pxだけを許可する。
- 画像Object Keyは実行対象環境のprefix配下だけを許可し、`..`を拒否する。
- タップ領域は整数、画像内、重複なし、4操作すべて必須とする。
- 一覧・作成・確認・公開・停止は有効なPlatform Adminだけが利用できる。
- 公開は`SUPER_ADMIN`、停止は`SUPER_ADMIN`または`OPERATOR`に限定する。
- DB検索時にIDだけでなく環境も照合し、別環境のメニューを公開・停止できない。
- 外部LINE処理が失敗した場合、DBを`ACTIVE`または`DISABLED`へ進めない。

## 状態遷移

1. `DRAFT`: 管理者が画像情報と領域を登録
2. `VERIFIED`: 内容確認後に公開可能状態へ変更
3. `ACTIVE`: LINE Providerで登録成功後、同じ環境の旧ACTIVEを停止して切替
4. `DISABLED`: LINE Providerで停止成功後、DBも停止済みに変更

公開・停止のProvider呼び出しは再試行される可能性があるため、環境、内部ID、version、操作を含む冪等キーを渡す。

## DB変更

- `LineRichMenu`
- `LineRichMenuArea`
- `LineRichMenuAudit`
- `LineRichMenuStatus`
- `LineRichMenuAction`

Prismaが部分一意制約を表現できないため、環境ごとのACTIVE最大1件はMigration内の部分一意Indexで保証する。

## テスト

- 正常な4領域の作成
- 領域重複の拒否
- 別環境画像キーの拒否
- 公開・停止の冪等キーと処理順序
- Provider失敗時にDB状態を進めないこと

## 次PRへ分離したもの

- 管理画面
- 画像アップロード用の署名付き経路
- LINE Messaging API Adapter
- テンプレートプレビュー
- Providerエラーの管理画面表示と再実行

本PRはCoreと永続化境界だけを実装し、管理画面や実際のLINE登録を先行実装しない。

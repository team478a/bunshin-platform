# 動画生成へのAIキャラクター基準画像Snapshot接続（AV-4C2）

## 目的

動画を作り始める時点で、サービスが用意したAIキャラクターの公開版と基準画像を選び、その時点の情報を動画プロジェクトへ固定する。

## 利用者の流れ

1. サービス管理者がAIキャラクター、利用許諾、公開済み生成設定、基準画像を登録する。
2. 動画を作る利用者は「動画に出すAIキャラクター」を任意で選ぶ。
3. 選択できるのは、同じサービス内で有効・公開済み・基準画像ありのキャラクターだけ。
4. 動画プロジェクトへ、キャラクターの見た目・生成指示・安全ルールと、基準画像の識別情報をSnapshot保存する。
5. 動画詳細画面には、固定済みキャラクター名・版・基準画像数を表示する。

## 保存するもの

- `characterProfileVersionId`
- Character Profile Snapshot: 名称、版、見た目、世界観、基本指示、禁止指示、安全ルール、公開日時
- Reference Asset Snapshot: Asset ID、非公開Storage Key、MIME、SHA-256

キャラクターを選ばない既存動画は従来どおり作成でき、Snapshotは空として保存する。

## 分離と安全性

- 作成時にworkspaceId、groupId、公開済みVersion、ACTIVEなSERVICE Profile、READYな基準画像をDB Transaction内で再検証する。商用利用・改変・参加者への提供が有効期間内に許可されていることも確認する。
- 同じキャラクターでも後から設定・画像を変更しても、既存動画のSnapshotは書き換えない。
- 現在のCreatomate標準レンダリングは、キャラクターのStorage Keyや内部Promptを外部Providerへ送信しない。
- 将来、参照画像対応Providerを追加する際は、SnapshotのSHA-256とStorage Keyを照合し、短期の専用URLまたはProvider Adapter経由でのみ渡す。

## 今回の対象外

- AI動画Providerへの画像送信
- 参照画像対応Providerの選定・接続
- 利用者によるキャラクター画像の編集
- 既存Video Projectへの後付け変更

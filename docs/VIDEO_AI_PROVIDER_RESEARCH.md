# 個別AI動画生成 Provider 調査・接続方針

## 結論

ワタシワークスの動画機能は、同じ完成動画を複数人に配る方式を基本にしない。利用者ごとのVideo Project、分身、ゴール、対象SNS、キャラクター設定、許可済みの商品・URLを使って、利用者ごとの動画を作る。

最初に実装候補とするProviderは、**fal経由のKling Image-to-Video**である。ただし、実際の有料Provider呼び出しを有効にするのは、運営者が接続先・料金上限・利用規約を確認し、管理画面で接続確認と有効化を完了した後だけとする。

## 調査した候補

| 候補                       | 利用できること                                                 | 採否                                     |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| fal + Kling Image-to-Video | 開始画像、終了画像、複数参照画像、3〜15秒、非同期Queue/Webhook | 第一候補                                 |
| fal + Wan Image-to-Video   | 開始画像、Prompt、Queue/Webhook。短い個別動画の低コスト候補    | 第二候補                                 |
| Runpod AI SDK Provider     | Image-to-Videoを含む複数モデルへ接続可能                       | 将来の交換可能Provider候補               |
| Creatomate                 | 字幕・静止画・文字演出の確定的な標準動画                       | 継続利用。AI動画本体のProviderにはしない |

falの公式仕様では、Kling Image-to-Videoは開始画像、複数の参照キャラクター・物体、3〜15秒の長さ、非同期Queue APIを扱える。 [Kling Image-to-Video API](https://fal.ai/models/fal-ai/kling-video/v3/4k/image-to-video)

Wanの公式仕様でも、画像入力、Queue API、Webhook、画像URLまたはBase64データの入力を確認できる。 [Wan Image-to-Video API](https://fal.ai/models/wan/v2.6/image-to-video/flash/api)

RunpodはImage-to-Videoを含むProvider SDKを公開しているが、初期段階ではProvider運用を増やさない。 [Runpod AI SDK Provider](https://github.com/runpod/ai-sdk-provider)

GitHubの実装例では、Providerごとの差を`submit → poll → download`に正規化し、Queue・UI・SchemaをProvider非依存に保つ方法が参考になる。ただし、コードをそのまま取り込まない。 [AI Video StudioのProvider抽象化例](https://github.com/edentheoschlegel-code/ai-video-studio)

## 秘密画像とキャラクター参照の扱い

1. ブラウザからProviderへ直接送信しない。Provider APIキーもブラウザへ渡さない。
2. ワタシワークスのPrivate Storageから、対象Video Projectに固定された基準画像だけをサーバー側で取得する。
3. 画像は短時間のBase64データとしてProviderへ送るか、Provider専用の一時アップロードをサーバー側で行う。ワタシワークスの恒久Storage Keyや公開URLは渡さない。
4. Providerに渡すのは、利用許諾が有効で、同一サービス・同一利用者のProjectに固定された画像だけとする。
5. 画像、Prompt、Providerの生レスポンス、短期URLは監査ログへ保存しない。保存するのはProvider名、モデル、外部ジョブID、原価、状態、失敗分類、出力のPrivate Storage Keyだけとする。
6. 完成動画はワタシワークスのPrivate Storageへコピーしてから、認証済み・所有者限定のダウンロードURLを発行する。

## 個別生成の流れ

```text
利用者が動画企画を承認
  → 管理画面で有効化済みのAI動画Providerを解決
  → Project Snapshot・利用許諾・原価上限を再確認
  → 参照画像と安全な動画Promptをサーバー側でProviderへ送信
  → 非同期Jobを記録
  → 完成動画をPrivate Storageへ保存
  → 利用者本人に確認・ダウンロード・投稿報告を表示
```

## 実装段階

### AV-4D1: Provider非依存Core

- `CREATOMATE`とAI動画Providerを同じRender lifecycleで扱えるProvider選択
- ProjectのAI動画SceneだけをAI Providerへ送る境界
- Provider名、モデル、原価見積もり、入力画像の扱いをSnapshot化
- Providerごとの失敗分類、再試行、緊急停止

### AV-4D2: fal / Kling Adapter

- fal APIキーを既存の暗号化済みProvider設定へ追加
- サーバー側だけで画像を読み、KlingのQueue APIへ送信
- WebhookとPollingの両方で状態を確認
- 完成ファイルをPrivate Storageへ保存

### AV-4D3: 運用画面

- Provider・モデル・上限金額・接続状態を管理画面に表示
- 利用者には「動画を作成中」「確認できます」を平易に表示
- Prompt、基準画像、APIキーは表示しない

## 有効化前に運営者が確定する項目

- 1本あたりの最大原価
- 1日・1か月のサービス全体上限
- 利用者あたりの生成回数
- 生成可能な秒数と縦横比
- 画像を外部Providerへ送ることの同意文と保持期間
- 不適切出力時の停止・再生成・問い合わせ対応

これらの値を未設定のまま、AI動画Providerを有効化しない。

## 今回の対象外

- 同じ完成動画を無制限に配る仕組み
- ブラウザからのProvider直接呼び出し
- APIキーの平文表示
- 実在人物に似せることを目的にした生成
- 自動SNS投稿
- 外部Providerの課金・請求・返金管理

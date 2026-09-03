# 個別AI動画生成 Provider 調査・接続方針

## 結論

ワタシワークスの動画機能は、同じ完成動画を複数人に配る方式を基本にしない。利用者ごとのVideo Project、分身、ゴール、対象SNS、キャラクター設定、許可済みの商品・URLを使って、利用者ごとの動画を作る。

単一のProviderへ固定しない。個別動画の目的ごとに、低コスト検証、キャラクター一貫性、動き・音、企業向けの説明可能性を選べるProvider Adapterにする。

最初に実装候補とするのは、**fal経由のKling Reference-to-Video**である。複数のキャラクター基準画像を使えるためである。ただし、実際の有料Provider呼び出しを有効にするのは、運営者が接続先・料金上限・利用規約を確認し、管理画面で接続確認と有効化を完了した後だけとする。

## 調査した候補

| 候補                               | 5秒の目安原価（米ドル）         | 向く用途                                 | 初期位置付け                     |
| ---------------------------------- | ------------------------------- | ---------------------------------------- | -------------------------------- |
| fal + Kling O1 Reference-to-Video  | 約$0.56（$0.112/秒）            | 最大7枚の参照画像を使うキャラクター動画  | 第一候補                         |
| fal + Kling 2.6 Pro Image-to-Video | 約$0.35（音なし、$0.07/秒）     | 1枚の開始画像から短い人物・商品動画      | 低コストKling候補                |
| Runway Gen-4 Turbo                 | 約$0.25（$0.05/秒）             | 2〜10秒の仮説検証・量産テスト            | 低コスト検証候補                 |
| fal + Veo 3.1 Fast                 | 約$0.50から（音なし、$0.10/秒） | AI透かしを重視する企業向け動画           | 企業向け候補                     |
| fal + Seedance 2.0 Fast            | 約$1.21（720p、$0.2419/秒）     | 動き・演出・音を含む品質重視の動画       | プレミアム候補                   |
| Creatomate                         | 既存設定に従う                  | 字幕・静止画・文字演出の確定的な標準動画 | 継続利用。AI動画本体には使わない |

上記の金額は2026年8月31日に公式ページで確認した概算であり、Providerの価格改定、音声・解像度・参照数により変わる。管理画面でProviderごとの単価と上限を設定・記録し、コードに固定しない。

## 品質・費用・機能の比較

### Kling

- **強み**: Kling O1のReference-to-Videoは最大7枚の参照入力を使える。ユーザーごとに作るキャラクター動画で、見た目をなるべく揃えたい用途に最も合う。
- **費用**: O1 Reference-to-Videoは$0.112/秒。Kling 2.6 Proは音なし$0.07/秒、音あり$0.14/秒。4K版は$0.42/秒で、初期の量産対象には高い。
- **注意**: 高品質版ほど待ち時間と原価が増える。音声の品質・日本語表現は、実データで確認してから標準化する。
- **判断**: キャラクターを強みにする有料コース・完成品コースの標準候補。

[Kling O1 Reference-to-Video](https://fal.ai/models/fal-ai/kling-video/o1/reference-to-video) / [Kling 2.6 Pro](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video) / [Kling V3 4K](https://fal.ai/models/fal-ai/kling-video/v3/4k/image-to-video)

### Runway

- **強み**: Gen-4 Turboは画像から動画を作れ、2〜10秒を必要な長さだけ選べる。公式価格は1クレジット=$0.01、Gen-4 Turboは5クレジット/秒で、5秒なら約$0.25。
- **費用**: 初期の「1人あたり何本作ると投稿されるか」の実証に向く。
- **注意**: 初期設計では複数枚のキャラクター参照を主目的にせず、開始画像を1枚にまとめた短尺生成として扱う。キャラクター一貫性はKling O1の方を優先して比較する。
- **判断**: 無料体験、試作、低原価プランの候補。

[Runwayモデル一覧](https://docs.dev.runwayml.com/guides/models/) / [Runway API料金](https://docs.dev.runwayml.com/guides/pricing/) / [画像入力仕様](https://docs.dev.runwayml.com/assets/inputs/)

### Veo 3.1 Fast

- **強み**: 画像から動画、参照入力、音声を扱える。GoogleのSynthID透かしが動画へ埋め込まれるため、AI生成の説明可能性を重視する企業向け候補になる。
- **費用**: fal公式ではFast Image-to-Videoが音なし$0.10/秒から。Runway経由では音なし$0.10/秒、音あり$0.15/秒として提供されている。
- **注意**: 音声ありの原価は上がる。透かしは無効化できないため、その特性を前提にする。
- **判断**: 企業・OEMの説明責任を重視するプランで、別途品質検証してから採用する。

[fal Veo 3.1](https://fal.ai/models/fal-ai/veo3.1) / [Runway API料金](https://docs.dev.runwayml.com/guides/pricing/)

### Seedance 2.0 Fast

- **強み**: 音・動き・カメラ演出を1回で作り、最大15秒・720p・開始/終了画像に対応する。公式説明では自然なカット、物理表現、同期音声を特徴としている。
- **費用**: Fastで$0.2419/秒、5秒で約$1.21、10秒で約$2.42。音声を有効にしても同額とされている。
- **注意**: 初期の低価格コースへ標準搭載すると原価が重い。
- **判断**: 高単価コース、運営確認済みの完成度重視案件の候補。

[Seedance 2.0 Fast](https://fal.ai/models/bytedance/seedance-2.0/fast/image-to-video)

### Wan / Runpodなど

- **Wan**: falの料金表ではWan 2.5が$0.05/秒の低コスト候補として示されている。品質・キャラクター一貫性・日本語指示は、実証比較で判断する。
- **Runpod**: 複数モデルの実行先として有用だが、Providerの運用・請求・障害対応が増える。初期はfalまたはRunwayを直接接続し、2社目以降の交換先として残す。

[fal料金](https://fal.ai/pricing) / [Runpod AI SDK Provider](https://github.com/runpod/ai-sdk-provider)

## 推奨する提供方法

| 提供方法       | 初期モデル                            | ねらい                                                 |
| -------------- | ------------------------------------- | ------------------------------------------------------ |
| 作り方コース   | Runway Gen-4 TurboまたはKling 2.6 Pro | 小さな原価で、画像・Prompt・作り方を渡す               |
| 完成品コース   | Kling O1 Reference-to-Video           | 複数参照画像を使い、利用者ごとのキャラクター動画を作る |
| プレミアム制作 | Seedance 2.0 FastまたはVeo 3.1 Fast   | 動き・音・企業説明責任を重視する                       |

初期は「Kling O1」「Runway Gen-4 Turbo」の2モデルだけを管理画面で選択可能にし、各モデルを同じ企画・基準画像・秒数で比較する。投稿・登録・再生成・原価を記録してから、SeedanceやVeoを追加する。

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

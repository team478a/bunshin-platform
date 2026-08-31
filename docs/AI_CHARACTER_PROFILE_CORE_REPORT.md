# AIキャラクター設定 Core実装報告

## ゴール

美女、人物、動物、マスコットなど特定用途に固定せず、サービスまたは利用者がAIキャラクターを安全に版管理できる土台を作る。

## 追加Resource

- `AiCharacterProfile`: 名前、説明、PLATFORM／SERVICE／PERSONALの所有範囲
- `AiCharacterLicenseVersion`: 権利者、商用利用、改変、再配布、期間、同意記録
- `AiCharacterProfileVersion`: 外見、世界観、基本Prompt、Negative Prompt、安全ルール、許諾Snapshot
- `AiCharacterReferenceAsset`: Private Storage Key、画像形式、容量、SHA-256、権利確認

## 安全性

- SERVICE/PERSONALはWorkspace・Service複合外部キーで分離する。
- 基準画像はJPEG、PNG、WebP、20MB以下だけを受け付けるCore制約とする。
- SVGや公開URLを基準画像Resourceとして保存しない。
- 安全ルールが空のPrompt Versionは公開準備できない。
- 許諾期限と同意記録をPromptから分離し、生成・配布前に再確認できるようにする。

## 次のPR

AV-4Bで管理API/UI、Private Storage Upload、署名付き表示、動画作成時の公開Version Snapshotを接続する。

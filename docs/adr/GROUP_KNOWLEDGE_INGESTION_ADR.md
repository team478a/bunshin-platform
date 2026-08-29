# Group Knowledge Ingestion ADR

## Status

Accepted for phased implementation.

## Context

企業・代理店グループは、商品資料、FAQ、研修動画、公式Webページをすでに保有している。現行の
`OwnerKnowledge` は個人所有の手入力知識、`ProductPackAsset` は参照URLの登録であり、資料の内容を
抽出・確認してコンテンツ生成へ利用する企業ナレッジ基盤ではない。

## Decision

### 「学習」の意味

基盤モデルの追加学習やファインチューニングは行わない。登録資料を分割して検索可能なナレッジへ
変換し、生成時に必要な根拠だけを参照する Retrieval-Augmented Generation 方式を採用する。

これにより、資料の更新、停止、削除、版の差し替えを次回の生成から反映できる。

### 入力

- PDF
- 動画（音声の文字起こしを後続Phaseで実装）
- HTTPS URL（取得処理を後続Phaseで実装）
- テキスト

FAQ資料もPDFとして登録できる。抽出結果は `FAQ`、事実は `FACT`、必須・禁止事項は `RULE`、
その他は `GENERAL` の候補として保存する。

### 公開フロー

`DRAFT -> PROCESSING -> REVIEW_REQUIRED -> ACTIVE`

- 抽出失敗は `FAILED` とし、生成へ渡さない。
- グループ管理者または組織Workspace管理者が確認して初めて `ACTIVE` にする。
- 同じ `logicalKey` の新版を承認すると旧版を `ARCHIVED` にする。
- 未承認・失敗・停止済みの内容を生成へ渡さない。

### 根拠

各チャンクに、PDFページ、動画開始・終了秒、URLや資料名を保持する。生成結果から元資料へ
たどれるようにし、AIが抽出した内容を公式情報と無条件に同一視しない。

### データ境界

- `workspaceId` と `groupId` を全取得条件に含める。
- 管理は自グループの `MANAGER`、または組織Workspaceの `OWNER/ADMIN` に限定する。
- 生成利用は同意済みかつ有効な自グループ参加者に限定する。
- 個人の `OwnerKnowledge`、`BunshinMemory` と企業共有ナレッジを同じテーブルへ入れない。
- 商品固有資料は任意で `ProductPackVersion` に結び付ける。

### セキュリティ

- 外部URLはHTTPSのみ許可し、URL内認証情報とフラグメントを拒否する。
- ファイル本体は公開URLにせず、private storageと短期署名URLを使う（後続Phase）。
- MIME、拡張子、サイズ、ハッシュ、マルウェア検査をアップロード確定前に検証する（後続Phase）。
- URL取得ではallowlist、SSRF対策、リダイレクト再検証、取得上限を必須とする（後続Phase）。
- 動画・PDF・Web本文に含まれる命令文はデータとして扱い、システムPromptとして実行しない。

## Delivery phases

1. Core: source/version/chunk/citation/status/audit、権限、承認済み取得
2. Upload/API/UI: PDF・動画のprivate upload、テキスト・URL登録、一覧と確認画面
3. Extraction jobs: PDF本文抽出、URL安全取得、動画文字起こし、再試行と原価記録
4. Review: FAQ・事実・ルール候補の編集、差分確認、承認・停止
5. Generation retrieval: 関連チャンク選択、根拠snapshot、商品パック・投稿生成への接続

## Not included in Core

- ファイルの公開配信
- 自動公開
- 基盤モデルのファインチューニング
- 動画の映像内容理解
- 外部サイトの無制限クロール
- 他グループへの暗黙共有

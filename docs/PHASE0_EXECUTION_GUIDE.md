# Phase 0 実行ガイド

## 目的

Phase 0では本格実装を行いません。既存 `stockbusiness/bunshin-blog` の事実確認を行い、BUNSHIN Platformへ安全に統合するための設計資料を作成します。

## 調査対象

- 新リポジトリ: `team478a/bunshin-platform`
- 既存リポジトリ: `stockbusiness/bunshin-blog`

既存リポジトリを参照できない場合、推測で文書を完成させず、アクセス上の制約を明記してください。

## 必須調査項目

### 1. リポジトリ構成

- package manager
- monorepo構成
- frontend/backend
- ORM/DB
- 認証
- LINE
- scheduler/cron/queue
- AI Provider
- deployment
- CI

### 2. 実装済み機能

コード、migration、API、UI、testを根拠に実装状態を分類します。

- 実装済み
- 部分実装
- Mockのみ
- 未実装
- 使用されていない

READMEの記載だけを実装済み根拠にしないでください。

### 3. 再利用分類

すべての主要機能を次に分類します。

- `REUSE_AS_IS`
- `REFACTOR_TO_SHARED`
- `KEEP_AS_BLOG_CAPABILITY`
- `REIMPLEMENT`
- `REMOVE`
- `UNKNOWN`

### 4. データモデル

- Userの定義
- ブログ所有関係
- 認証識別子
- LINE user ID
- WordPress接続情報
- 記事・画像・承認履歴
- Prompt/AI log
- tenant境界

Multi-Bunshin化で衝突する箇所を特定します。

### 5. セキュリティ

- 秘密情報管理
- 暗号化
- 認可
- tenant isolation
- Webhook検証
- cron認証
- 管理者権限
- ログへの機密情報出力

### 6. 技術的負債・リスク

- 密結合
- 巨大service/component
- Provider直結
- test不足
- migration不整合
- retry/idempotency不足
- observability不足
- Windows/CI差異

## 必須成果物

### `CURRENT_SYSTEM_AUDIT.md`

以下を含めます。

1. Executive Summary
2. 技術スタック
3. リポジトリ構造
4. 実装機能マトリクス
5. データモデル
6. 外部連携
7. CI/CD
8. セキュリティ
9. 技術的負債
10. 根拠となるファイルパス

### `REUSE_MAP.md`

最低限、次の表を含めます。

| 対象 | 現状 | 分類 | 移行先 | 理由 | 依存 | リスク |
|---|---|---|---|---|---|---|

### `TARGET_ARCHITECTURE.md`

最低限、次を含めます。

- Context / Container図
- Multi-Bunshin domain boundary
- Capability contract
- SOCIALとBLOGの境界
- Provider adapter
- データ所有境界
- API/Job構成
- 移行方式
- Phase 1開始条件

## 禁止事項

Phase 0では次を行わないでください。

- 既存ブログコードの大規模移動
- 新UIの本格実装
- DB migrationの適用
- 自動投稿実装
- 動画生成実装
- 既存機能の削除
- 根拠のない全面リライト判断

## 完了条件

- 3つの必須成果物が作成されている
- 主要判断がコード根拠付きである
- 不明点が明示されている
- 推奨案だけでなく代替案・リスクがある
- Phase 1で何を作るかが具体化されている
- 仕様書との矛盾がない、または矛盾が明示されている

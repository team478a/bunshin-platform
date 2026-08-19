# BUNSHIN Platform 実装ロードマップ

## 基本方針

SNS版とブログ版を別々の製品として開発しません。Multi-Bunshin Platformを先に作り、SNSとブログをCapabilityとして追加します。

途中まで作られている `stockbusiness/bunshin-blog` は捨てず、Phase 0で再利用範囲を確定します。

## Phase 0: 現状棚卸し・設計確定

### 目的

既存ブログ資産と新仕様の差分を把握し、再利用方針と目標構成を決める。

### 成果物

- `docs/CURRENT_SYSTEM_AUDIT.md`
- `docs/REUSE_MAP.md`
- `docs/TARGET_ARCHITECTURE.md`
- 必要に応じたADR

### Gate

- 現行機能一覧がコード根拠付きで整理されている
- 共通化・Blog専用・廃止・再実装の分類がある
- Multi-BunshinとCapabilityのデータ境界が確定している
- 移行方式とリスクがレビュー可能である

## Phase 1: Platform Foundation

- pnpm/Turborepo等のworkspace基盤
- web / api / adminの基本構成
- TypeScript、lint、format、test、build
- CI
- 環境変数Schema
- ログ・エラー処理の基盤
- DB/Prisma初期化

## Phase 2: Multi-Bunshin Core

状態: コード実装完了。Production利用開始は`PHASE2_PRODUCTION_GATE.md`完了待ち。

- User / Workspace
- Bunshin CRUD
- Objective / Audience / Personality
- Owner Knowledge
- Bunshin Knowledge Grant
- Bunshin Memory
- Capability Contract / Assignment
- 認可・テナント分離
- Cross-user / Cross-bunshin test

## Phase 3: SOCIAL Foundation

状態: 未着手。`PHASE2_COMPLETION_AUDIT.md`の承認後、実装前指示書から開始する。

- Social Profile
- Content Pillar
- Weekly Plan
- Daily Mission
- Mission Content
- Post Record
- Feedback
- 投稿形式の選択ルール

## Phase 4: Daily Mission MVP

- Bunshin Profile Builder
- Mission Planner
- Content Generator
- Quality Checker
- 5枚スライド
- 実写台本
- 外部AI動画プロンプト
- コピーUI
- 投稿完了

## Phase 5: LINE Daily Experience

- LINE Login / session
- Messaging API
- Daily Push
- Today画面へのDeep Link
- 配信設定
- 重複配信防止
- 失敗・再送管理

## Phase 6: Memory / Originality

- 本人由来の質問
- テキスト・音声入力の受け口
- Memory Extractor
- Embedding / 類似度判定
- 過去投稿重複防止
- 「自分らしい／違う」学習

## Phase 7: 100-user Validation Readiness

- 最低限の管理画面
- 登録・利用・投稿・継続KPI
- AI原価・LINE配信数・エラー可視化
- セグメント管理
- 利用規約・プライバシー導線
- データ削除・退会
- 運用手順

ここで100人規模の検証を行います。

## Phase 8: PRO / Multiple Bunshin UX

- 無料1体、上位プラン複数体
- 分身切替
- 複数Mission一覧
- 高度Memory
- 投稿案追加
- Plan制限
- 決済

FREE継続率を確認する前に作り込まないでください。

## Phase 9: BLOG Capability Migration

- WordPress接続
- キーワード・記事・画像・公開処理
- SNS反応から記事化
- 記事からSNS展開
- 既存ブログ資産の移植

## 将来Phase

- Goal/KPI Engine
- LINE Marketing
- LP
- Lead Generation
- Sales
- Customer Support
- Recruit
- 外部AI/制作Provider Adapter拡充
- 承認型自動投稿

## MVP判断指標

- Onboarding完了率
- Bunshin作成率
- First Mission作成率
- Mission閲覧率
- Mission完了率
- 「自分らしい」率
- D1 / D7 / D30継続率
- ユーザー属性別継続率
- 1アクティブユーザー当たり原価

最重要検証は、AIが投稿を作れるかではなく、**毎日具体的な仕事が届くことでユーザーがSNS運用を継続するか**です。

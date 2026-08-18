# BUNSHIN Platform Decision Log

重要な設計判断を時系列で記録します。詳細な検討が必要な場合は `docs/adr/` に個別ADRを作成し、ここからリンクしてください。

## D-001: 新しい親リポジトリを作成する

- 日付: 2026-08-18
- 状態: Accepted
- 決定: `team478a/bunshin-platform` をBUNSHIN Platformの新しい本体リポジトリとする
- 理由: SNS、ブログ、将来能力を単一用途の既存ブログリポジトリへ無理に追加せず、Multi-BunshinとCapabilityを中核に再編するため
- 影響: `stockbusiness/bunshin-blog` は参照元・移行元として維持する

## D-002: 1 User : N Bunshin

- 日付: 2026-08-18
- 状態: Accepted
- 決定: 1ユーザーは複数Bunshinを作成できる
- 理由: 副業、営業、採用、会社紹介など、目的・人格・ターゲット・記憶が異なる活動を分離するため
- 禁止: User Profileを唯一のBunshinとして扱う設計

## D-003: SNSとBlogをCapabilityとして扱う

- 日付: 2026-08-18
- 状態: Accepted
- 決定: SOCIALとBLOGは独立商品ではなく、Bunshinへ追加するCapabilityとする
- 理由: 将来、LINE_MARKETING、LP、LEAD_GENERATION、SALES等へ拡張するため

## D-004: SOCIALを最初のCapabilityとする

- 日付: 2026-08-18
- 状態: Accepted
- 決定: 初期MVPはSOCIALから開始する
- 理由: LINE登録後すぐ価値を体験でき、毎日の接点、本人由来データ、利用継続の検証に適しているため
- 注意: SNS生成機能自体を長期の競争優位としない

## D-005: 既存ブログ版を捨てない

- 日付: 2026-08-18
- 状態: Accepted
- 決定: `stockbusiness/bunshin-blog` をPhase 0で棚卸しし、共通基盤とBLOG専用機能を分離して再利用する
- 理由: 実装済み資産を活かしつつ、新しいCoreへ技術的負債を持ち込まないため

## D-006: 生成AIを競争優位の中心にしない

- 日付: 2026-08-18
- 状態: Accepted
- 決定: 文章、画像、動画の生成モデルは交換可能なProviderとして扱う
- 理由: 生成機能はコモディティ化が進むため、複数分身、目的、記憶、能力、成果履歴を中核資産とする

## D-007: MVPは承認・実行支援型

- 日付: 2026-08-18
- 状態: Accepted
- 決定: MVPではSNS完全自動投稿を実装しない
- 理由: まず「毎日具体的なMissionが届くことでユーザーが行動を継続するか」を検証するため

## D-008: Phase 1のPlatform Foundation構成

- 日付: 2026-08-18
- 状態: Accepted
- 決定: Node.js 24、pnpm 10、Turborepo、Next.jsを採用し、domain/applicationをframework非依存packageへ分離する
- 理由: MVPのdeploy単位を小さく保ちながら、将来API/workerを分離できる境界を作るため
- 影響: Phase 1ではNestJSと独立`apps/admin`を作らない

## D-009: Platform DBと既存Blog DBを分離する

- 日付: 2026-08-18
- 状態: Accepted
- 決定: PlatformはSupabase PostgreSQLを利用し、staging/productionを別projectとし、既存Blog DBとは共有しない
- 理由: Workspace/Bunshinの所有境界を旧schemaへ混ぜず、Strangler移行とrollbackを可能にするため
- 影響: pooled `DATABASE_URL`とmigration用`DIRECT_URL`を分け、ブラウザからDBへ接続しない

## D-010: Workspace権限とPlatform Adminを分離する

- 日付: 2026-08-18
- 状態: Accepted
- 決定: WorkspaceMembershipとPlatformAdminを別modelとし、どちらも他方の権限を暗黙付与しない
- 理由: tenant所有権とPlatform運営権限は異なる責務だから

## D-011: Phase 1ではJob契約だけを定義する

- 日付: 2026-08-18
- 状態: Accepted
- 決定: JobDispatcher/JobRepositoryとcontext型だけを定義し、table、worker、polling、retry、schedulerを作らない
- 理由: 実際の非同期処理が必要になるPhaseまでinfrastructureを先回りしないため

## 未決事項

Phase 0で決める項目:

- 既存ブログ版から移植する具体的module
- monorepoの最終構成
- APIの本番実行環境
- 認証とLINE Providerの詳細
- Scheduler/Queue方式
- 既存DBの移行・併存方式

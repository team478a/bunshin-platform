# BUNSHIN Platform

BUNSHIN Platformは、1人のユーザーが目的ごとに複数のAI分身を作成し、それぞれに人格・目的・知識・記憶・成果指標・Capability（仕事能力）を持たせるためのプラットフォームです。

最初のCapabilityとして実装した `SOCIAL` は、単なるSNS投稿生成機能ではなく、各Bunshinが自身の目的に合わせて「今日やる仕事」を決定し、ユーザーへ実行可能なミッションを届ける能力です。現在はWebに加えてLINE導線、画像・動画支援、継続支援、サービス／Program運用へ拡張されています。

## Core Concept

```text
User / Workspace
  ├─ Bunshin A: AI副業
  │    ├─ Objective / Audience / Personality / Memory / KPI
  │    ├─ SOCIAL
  │    └─ 将来: BLOG / LINE_MARKETING
  ├─ Bunshin B: 営業専門家
  │    ├─ Objective / Audience / Personality / Memory / KPI
  │    ├─ SOCIAL
  │    └─ 将来: BLOG / LP / LEAD_GENERATION
  └─ Bunshin C: 採用広報
       ├─ Objective / Audience / Personality / Memory / KPI
       ├─ SOCIAL
       └─ 将来: RECRUIT / LINE_MARKETING
```

## Non-goals

このリポジトリを、次のいずれかに矮小化しないでください。

- 1ユーザーにつき1体だけのAIコピー
- SNS投稿文だけを生成するSaaS
- Instagram専用ツール
- 動画生成サービス
- 既存ブログ版を捨てて作り直すプロジェクト

## Source of Truth

初期MVPの基準仕様は次のファイルです。

- [`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`](docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md)

現在の実装判断では、基準仕様だけでなく、後続の承認済みDecision Log、Roadmap、最新の機能別報告書も確認してください。古いPhase文書は履歴であり、単独では現在状態を表しません。

- [`AGENTS.md`](AGENTS.md)
- [`docs/ARCHITECTURE_PRINCIPLES.md`](docs/ARCHITECTURE_PRINCIPLES.md)
- [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)
- [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md)
- [`docs/CURRENT_IMPLEMENTATION_HANDOFF_2026-09-28.md`](docs/CURRENT_IMPLEMENTATION_HANDOFF_2026-09-28.md)
- [`docs/REMAINING_FEATURE_IMPLEMENTATION_PLAN.md`](docs/REMAINING_FEATURE_IMPLEMENTATION_PLAN.md)

## Current Status

2026-09-28時点の `main` は、Phase 0〜5の基盤に加えて、次のコード実装を含みます。

- Multi-Bunshin、Workspace／User／Bunshin／Service分離、Knowledge Grant、Memory、Capability Assignment
- SOCIAL戦略、週間計画、Daily Mission、採否、コピー、手動投稿完了、Feedback、活動継続支援
- LINE認証・通知・再試行・運用監視、制限付き画像／動画生成・配布
- Multi-Service、Service Role、Program Runtime、Point、Badge、Reward、Credit
- Fortune、AI Resale、AI TrainingのCapability package
- 契約・注文・請求・決済・OEM支援の運用基盤

「コード実装済み」と「本番運用承認済み」は別です。本番Migration、実アカウント・実端末確認、Provider設定、法務・運用承認の最新証跡は、[`docs/FREE_MVP_PRODUCTION_GATE.md`](docs/FREE_MVP_PRODUCTION_GATE.md)および各機能のProduction Gateで確認してください。SNS自動投稿、既存BLOGの移行、広範な無人自動化は一般提供していません。

## Local Setup

前提はNode.js 24 LTSとpnpm 10.10.0です。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate
pnpm dev
```

詳細は[`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md)を参照してください。

## Recommended Stack

仕様確定後の標準候補です。既存ブログ資産の調査結果により変更する場合は、Decision Logへ理由を残してください。

- React / TypeScript
- Next.js / TypeScript（Phase 1。domain/applicationはframework非依存）
- PostgreSQL / Supabase
- Prisma
- pgvector
- pnpm / Turborepo
- LINE Login / Messaging API
- Vercel（Web）、将来のworkerは必要時にCloud Runを検討
- CI: typecheck / lint / test / build

## Development Rule

- Phase単位で進める
- 大きな変更はブランチとPull Requestで行う
- 仕様変更は実装に埋め込まず、文書を先に更新する
- Multi-Bunshinのデータ分離を最優先する
- Provider固有処理をCoreへ混ぜない
- MVP外機能を先回りして実装しない

## Repository

- Owner: `team478a`
- Repository: `bunshin-platform`
- Default branch: `main`

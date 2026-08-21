# BUNSHIN Platform

BUNSHIN Platformは、1人のユーザーが目的ごとに複数のAI分身を作成し、それぞれに人格・目的・知識・記憶・成果指標・Capability（仕事能力）を持たせるためのプラットフォームです。

初期MVPでは、最初のCapabilityとして `SOCIAL` を実装します。SOCIALは単なるSNS投稿生成機能ではなく、各Bunshinが自身の目的に合わせて「今日やる仕事」を決定し、Web画面でユーザーへ実行可能なミッションを届ける能力です。LINE連携は後続Phaseです。

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

実装仕様の正本は次のファイルです。

- [`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`](docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md)

Codexおよび開発者は、実装前に必ず以下も確認してください。

- [`AGENTS.md`](AGENTS.md)
- [`docs/ARCHITECTURE_PRINCIPLES.md`](docs/ARCHITECTURE_PRINCIPLES.md)
- [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)
- [`docs/PHASE0_EXECUTION_GUIDE.md`](docs/PHASE0_EXECUTION_GUIDE.md)
- [`docs/CODEX_INITIAL_INSTRUCTION.md`](docs/CODEX_INITIAL_INSTRUCTION.md)
- [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md)

## Current Status

Phase 0〜5を実装済みです。現在はMulti-Bunshin、Workspace分離、Knowledge Grant、SOCIAL Capability、Account Strategy、Content Pillar、Weekly Plan、Daily Mission、採用・Copy・手動投稿・Feedback、およびOpenAI AdapterによるMission生成を含みます。本番利用開始は[`docs/FREE_MVP_PRODUCTION_GATE.md`](docs/FREE_MVP_PRODUCTION_GATE.md)の人間承認待ちです。

FREE版は投稿案・画像制作指示・撮影台本・外部動画AI向けPromptまでを生成します。SNS自動投稿、画像・動画binary生成、LINE実接続、Memory自動学習、BLOG移行、Job queue、課金は未実装です。

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

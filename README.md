# BUNSHIN Platform

BUNSHIN Platformは、1人のユーザーが目的ごとに複数のAI分身を作成し、それぞれに人格・目的・知識・記憶・成果指標・Capability（仕事能力）を持たせるためのプラットフォームです。

初期MVPでは、最初のCapabilityとして `SOCIAL` を実装します。SOCIALは単なるSNS投稿生成機能ではなく、各Bunshinが自身の目的に合わせて「今日やる仕事」を決定し、LINE経由でユーザーへ実行可能なミッションを届ける能力です。

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

現在は**実装前のリポジトリ初期化段階**です。

最初に行う作業はPhase 0です。いきなりアプリケーションを実装せず、既存の `stockbusiness/bunshin-blog` を調査し、再利用方針と目標アーキテクチャを確定してください。

Phase 0の必須成果物は次の3ファイルです。

```text
docs/CURRENT_SYSTEM_AUDIT.md
docs/REUSE_MAP.md
docs/TARGET_ARCHITECTURE.md
```

## Recommended Stack

仕様確定後の標準候補です。既存ブログ資産の調査結果により変更する場合は、Decision Logへ理由を残してください。

- React / TypeScript
- NestJS / TypeScript
- PostgreSQL / Supabase
- Prisma
- pgvector
- pnpm / Turborepo
- LINE Login / Messaging API
- Vercelおよび適切なAPI実行環境
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

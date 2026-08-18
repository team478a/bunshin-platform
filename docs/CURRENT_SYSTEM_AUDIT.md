# Current System Audit: `stockbusiness/bunshin-blog`

## 1. Executive Summary

調査基準日は 2026-08-18。対象は `stockbusiness/bunshin-blog` の `main`、commit `5cfa0764c2ce31f0b9c786998b4707993383efd9` である。本書はREADMEの自己申告ではなく、実コード、Prisma schema/migration、route、test、CI/CD設定を根拠にしている。

既存システムは Next.js App Router 上にUI、Route Handler、domain module、Prismaを同居させたTypeScriptモジュール型モノリスである。59個のAPI route、32個のmigration、17個のdomain module、199個のtest fileがあり、LINE/LIFF認証、複数Persona、ブログ、WordPress、記事計画・生成、承認、ジョブ、管理画面、分析まで広い実装資産がある。全面廃棄は合理的でない。

一方、BUNSHIN Platform仕様との主要な差は次の通りである。

- 所有境界は `User` 直下であり、`Workspace` がない。
- `Persona` により1 User:N Personaは既に成立するが、目的・Audience・人格がJSON中心で、PlatformのCoreモデルとは一致しない。
- `Blog` は `Persona` に必須で紐づくが、正式な `BunshinCapability`/Capability Contractはない。
- `PersonaFact` はPersona単位の記憶に近いが、Owner Knowledge、Grant、汎用Bunshin Memoryの分離がない。
- AI/LINE/WordPressは一定のadapter化があるものの、共通contractとして独立package化されていない。
- 外部実サービスを使うE2E確認は既存文書上未完了であり、mockとの適合だけでは本番互換性を保証できない。

従って推奨は「既存ブログへSOCIALを追加」でも「全面rewrite」でもなく、新Platform Coreを親に据え、既存ブログの境界を固めながら段階的にBLOG Capabilityへ移す方式である。

## 2. 調査スコープと規模

| 項目                 | 確認値 | 根拠                          |
| -------------------- | -----: | ----------------------------- |
| TypeScript/TSX files |    542 | `src/**/*.ts`, `src/**/*.tsx` |
| API route files      |     59 | `src/app/api/**/route.ts`     |
| Test files           |    199 | `src/tests/**/*.test.ts(x)`   |
| Domain modules       |     17 | `src/modules/*`               |
| Prisma migrations    |     32 | `prisma/migrations/*`         |
| Prisma models        |     29 | `prisma/schema.prisma`        |

調査対象外または未確認:

- 本番DBの実データ量・品質・migration適用状況
- Cloud Run/Cloud SQL/LINE/WordPress/AIの現時点の稼働状態
- GitHub Actionsの最新実行結果
- 外部Providerとの実機E2E

## 3. 技術スタック

| 層              | 現状                                                                          | 根拠                                                                              |
| --------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Frontend        | Next.js 16 App Router、React 19、TypeScript 5.9、Tailwind CSS 4               | `package.json`, `src/app/`                                                        |
| Backend         | Next.js Route Handlers（別API serverなし）                                    | `src/app/api/`                                                                    |
| Package manager | npm / `package-lock.json`                                                     | `package.json`, `package-lock.json`                                               |
| DB/ORM          | PostgreSQL、Prisma 6                                                          | `prisma/schema.prisma`                                                            |
| Validation      | Zod 4                                                                         | `package.json`, route/module schemas                                              |
| Auth            | LIFF ID token検証 + application session cookie、Admin magic link              | `src/modules/auth/`, `src/app/api/auth/liff/route.ts`, `src/app/api/admin/login/` |
| Notification    | LINE Messaging API / webhook / rich menu                                      | `src/lib/line/`, `src/modules/line/`                                              |
| AI              | 独自`AiProvider`、Anthropic実装、OpenAIは設定型のみ                           | `src/lib/ai/provider.ts`, `src/lib/ai/config.ts`                                  |
| Job             | PostgreSQL-backed job table + HTTP worker                                     | `src/modules/jobs/`, `src/app/api/jobs/run/`                                      |
| Test            | Vitest、Testing Library、jsdom、PostgreSQL integration test                   | `vitest*.config.ts`, `src/tests/`                                                 |
| Deploy          | Docker multi-stage build、Cloud Build、Cloud Run、Cloud SQL                   | `Dockerfile`, `cloudbuild.yaml`, `docs/DEPLOY.md`                                 |
| CI              | GitHub Actions: lint/format/typecheck/test/build/schema/migration/integration | `.github/workflows/ci.yml`                                                        |

新仕様の推奨スタックとの差は、npm単一package/Next.js一体型であり、pnpm/Turborepo/NestJS/Supabase/pgvectorは未採用である。ただし仕様自身がPhase 0の調査後に最終決定するとしているため、差だけを理由に置換すべきではない。

## 4. リポジトリ構造

```text
bunshin-blog/
├─ src/app/                 Next.js UI + Route Handlers
│  ├─ liff/                 利用者向けモバイルUI
│  ├─ admin/                管理画面
│  └─ api/                  HTTP API / webhook / worker
├─ src/modules/             domain/application/repository modules
├─ src/lib/                 DB、AI、LINE、HTTP、暗号、Google等の共通部
├─ src/tests/               unit/component/integration tests
├─ prisma/                  schema + migrations
├─ docs/                    仕様、運用、設計履歴
├─ .github/workflows/ci.yml CI
├─ Dockerfile               Cloud Run image
└─ cloudbuild.yaml          build/deploy pipeline
```

`src/lib/db.ts` はPrismaへの直接アクセスをmodule外で禁止する方針を記載し、`docs/MODULE_RULES.md` もmodule ownershipを定義する。実装は完全なClean Architectureではないが、移植可能なmodule境界を既に持つ。

## 5. 機能実装マトリクス

状態定義: **実装済み** = schema/APIまたはUI/テストが揃う、**部分実装** = 主要コードはあるが実配線・実機・仕様要件が不足、**Mock検証のみ** = 外部実サービス未確認、**未実装** = 対応コードなし。

| 領域                           | 状態                         | 実装内容                                                                             | 主な根拠                                                                                                |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| User / consent / withdrawal    | 実装済み                     | 状態、同意、onboarding、export、withdraw                                             | `src/modules/users/`, `src/app/api/onboarding/`, `src/app/api/admin/users/`                             |
| Multi-Persona                  | 実装済み（Platform差あり）   | 1 User:N Persona、CRUD、active上限、所有権付き取得                                   | `prisma/schema.prisma` `Persona`, `src/modules/personas/persona-repository.ts`, `src/app/api/personas/` |
| Workspace                      | 未実装                       | Workspace model/境界なし                                                             | `prisma/schema.prisma`                                                                                  |
| Capability assignment/contract | 未実装                       | `entitlements.ts`の操作名はあるが全許可。Bunshinへの能力割当なし                     | `src/lib/entitlements.ts`, `src/tests/lib/entitlements.test.ts`                                         |
| Persona memory                 | 部分実装                     | `PersonaFact`はPersona単位。汎用型・embedding・active/importance等は不足             | `prisma/schema.prisma` `PersonaFact`, `src/modules/personas/facts.ts`                                   |
| Owner Knowledge / Grant        | 未実装                       | 共通知識とBunshin別許可なし                                                          | `prisma/schema.prisma`                                                                                  |
| Blog management                | 実装済み                     | Personaに属するBlog、枠、設定、genre、schedule                                       | `src/modules/blogs/`, `src/app/api/blogs/`                                                              |
| WordPress                      | 実装済み、実機未確認         | 認証情報暗号化、接続テスト、draft、sync、上書き保護                                  | `src/modules/wordpress/`, `src/app/api/blogs/[blogId]/wordpress/`                                       |
| Affiliate/ASP                  | 実装済み                     | offer catalog、LP評価、link、banner、CSV import、redirect                            | `src/modules/affiliate/`, `src/modules/banners/`, `src/app/api/admin/offer-catalog/`                    |
| Content planning               | 実装済み                     | plan builder、4段階評価、制約、publish order                                         | `src/modules/content-planning/`                                                                         |
| Article generation             | 実装済み、実AI未確認         | prompt、生成、構造化、fact check、risk flag、quality                                 | `src/modules/content-generation/`                                                                       |
| Approval workflow              | 実装済み                     | propose/view/approve/revision/skip/retention                                         | `src/modules/approvals/`, `src/app/api/approvals/`                                                      |
| LINE Login/session             | 実装済み、実機未確認         | ID token検証、LINE subjectからUser作成、signed session                               | `src/modules/auth/liff/`, `src/modules/auth/session.ts`                                                 |
| LINE messaging/webhook         | 実装済み、実機未確認         | signature、reply intake、notify、rich menu、limits                                   | `src/modules/line/`, `src/lib/line/`, `src/app/api/line/webhook/route.ts`                               |
| Admin auth                     | 実装済み、メール実送信未確認 | email magic link、ADMIN guard                                                        | `src/modules/auth/admin-login/`, `src/app/admin/login/`                                                 |
| Scheduler/job                  | 実装済み                     | DB queue、lease/retry/backoff/checkpoint/idempotency、HTTP drain                     | `src/modules/jobs/`, `src/app/api/jobs/run/`                                                            |
| Analytics                      | 実装済み/部分実装            | Search Console、daily aggregate、click、AI referral、manual results                  | `src/modules/analytics/`, `src/lib/google/`                                                             |
| AI cost/log                    | 実装済み/部分実装            | usage/cost/budgetを記録。新仕様のlatency/status/error/prompt privacy要件は再設計必要 | `src/modules/ai-costs/`, `prisma/schema.prisma` `AiUsageLog`                                            |
| Audit log                      | 実装済み/限定的              | selected actionsを記録。全管理者debug accessの強制ではない                           | `src/modules/audit/`, `prisma/schema.prisma` `AuditLog`                                                 |
| SOCIAL / Daily Mission         | 未実装                       | SocialProfile、Pillar、WeeklyPlan、DailyMission、Feedbackなし                        | `prisma/schema.prisma`, `src/modules/`                                                                  |
| CI/CD                          | 実装済み                     | verification、migration integration、Cloud Run deploy                                | `.github/workflows/ci.yml`, `cloudbuild.yaml`                                                           |

既存 `docs/IMPLEMENTATION_STATUS.md` が明示する残件として `/api/admin/blogs` と記事再生成経路があり、`docs/DEPLOY.md` は実LINE・実AI・実WordPressの通し確認が未実施とする。

## 6. データモデルとMulti-Bunshin差分

### 現状の所有グラフ

```text
User
├─ Persona[]
│  ├─ PersonaFact[]
│  └─ Blog[]
│     ├─ WordpressConnection
│     ├─ BlogPersonaSetting
│     ├─ AffiliateOffer / Banner
│     ├─ ContentPlan / ContentItem / ArticleVersion
│     ├─ Approval / WordpressPost
│     └─ MetricDaily / AiUsageLog
└─ MonitorProfile / AuditLog / AdminLoginToken
```

良い点:

- `Persona` は `userId` を持ち、既に1 User:Nを表現する。
- Blogは `(persona_id, user_id) -> personas(id, user_id)` の複合外部キーで越境割当をDBでも防ぐ。
- `PersonaFact` は`personaId`に属し、別Personaの記憶を暗黙共有しない方向へ既に移行済み。
- Blog配下のrepositoryは多くが`userId`/`blogId`を条件に含め、越境testもある。

衝突点:

- `Workspace` がなく、将来のBUSINESS/OEM所有境界を表現できない。
- `User.role`がADMIN/MONITORを同居させ、Workspace membership/roleとは分離されていない。
- `Persona.identity/expertise/audience/business` はJSONで、Objective/Audience/Personalityの個別ライフサイクルやqueryが困難。
- `Blog` はPersonaに直接属するが、`BunshinCapability(BLOG)`による有効化・状態・configがない。
- `PersonaFact` はBlog生成に特化したfact vocabularyで、PlatformのBunshin Memory全体を代替できない。
- Owner KnowledgeとGrantがなく、ユーザー共通素材を安全に選択共有できない。
- 大半のBlog固有tableは`blogId`で分離されるが`workspaceId`を直接持たず、Platform側の防御的tenant filtering方針へそのまま移せない。

## 7. 認証・認可・tenant isolation

### 認証

- LIFF ID tokenはLINE検証endpointへ照会し、検証済み`sub`だけを`lineUserId`の源にする: `src/modules/auth/liff/verify-id-token.ts`, `authenticate.ts`。
- application sessionは署名tokenをCookieに保持する: `src/modules/auth/session.ts`。
- status/role/consentはCookieを信用せずDBを再確認する: `src/modules/auth/guard.ts`。
- Adminはメールmagic linkで分離され、one-time tokenはhash保存: `src/modules/auth/admin-login/`, `AdminLoginToken`。

### 認可

- routeで`requireUser`/`requireConsentedUser`/`requireAdmin`を使用し、repositoryでも所有者条件を付ける二段構えが多い。
- 他人のresourceを404に寄せる設計と越境integration testがある: `src/tests/integration/tenant-isolation.test.ts`。
- ただしtenant rootがUserでありWorkspaceではない。Platform移行時に`workspaceId`を全経路へ明示的に追加する必要がある。
- `Capability` permissionは未実装で、`src/lib/entitlements.ts`は現在すべてtrueを返す。

## 8. 外部連携

### LINE

`src/lib/line/` にtransport/signature/messaging/rich-menu、`src/modules/line/` にapplication logicがあり、分離度は比較的高い。Webhook signature、reply classification、送信制限、通知schedule、rich menuが存在する。PlatformではProvider adapterとして再利用候補だが、通知の宛先・idempotencyを`bunshinId`/Missionへ拡張する必要がある。

### AI

`src/lib/ai/provider.ts` は`AiProvider.complete()`を定義し、model tier、timeout、usage、costを隠蔽する。呼び出し側からmodel名を分離している点は再利用価値が高い。ただし実動するproviderはAnthropicのみで、OpenAIは設定型とmodel mapがあるだけで`notConfigured`となる。新仕様の`generateStructured<T>`/`embed()`、schema repair、task-level log contractはない。

### WordPress

接続情報をAES-256-GCMで暗号化し、URL guard、安全なHTTP transport、権限test、draft/sync、user edit保護がある。これはBLOG固有資産であり、Coreへ移さず`capability-blog`内に保持すべきである。

### Google/Search Console・Mail

Search Console adapterとResend mailerが存在する。Search ConsoleはBLOG専用analytics、mailerはshared provider候補である。

## 9. Scheduler / Job

`Job` tableと`src/modules/jobs/`でqueueを実装し、claim lease、attempt、retry、backoff、checkpoint、idempotencyを持つ。`/api/jobs/run`をCloud Schedulerが毎分起動し、時間budget内でdrainする構成である。

強み:

- HTTP lifecycleに個別cron処理を直書きせずhandlerへ分離。
- idempotency、lease、retry、手動再実行、監査の基盤がある。
- 小規模MVPで運用可能な単純性がある。

制約:

- Web processとworkerが同じNext.js deploy unitで、独立scale/deployできない。
- PostgreSQL polling方式の性能上限と長時間AI処理時のlease設計を再評価する必要がある。
- Jobの`blogId`中心のpayload/handlerを、workspace/bunshin/capability-aware contextへ変更する必要がある。

## 10. 管理画面

`src/app/admin/(protected)/` にdashboard、users、jobs、settings、genres、offer catalog、rich menu、fact issues、monitor activity、publish paceがある。100-user validation運用の土台として再利用価値はあるが、大半がBLOG運用概念に依存する。Admin shell、auth guard、共通UI、job/setting/observability画面はshared/admin候補、genre/offer/fact/publish画面はBLOG Capability側に残す。

## 11. CI/CDと検証

`.github/workflows/ci.yml` はPR/main pushで次を実行する。

- npm ci
- lint / format check / typecheck
- unit/component tests + coverage
- Next.js build
- Prisma validate/migrate deploy/drift check
- DB CHECK constraintsの実動確認
- PostgreSQL integration tests

`cloudbuild.yaml` はmainのimageをArtifact RegistryへpushしCloud Runへdeployする。migrationはdeploy pipelineから意図的に外し、運用手順で先行適用する。これはexpand/contractを守る限り合理的だが、人手適用漏れがリスクとなる。

## 12. セキュリティ評価

### 確認できた対策

- Webhook署名検証: `src/lib/line/signature.ts`, `src/app/api/line/webhook/route.ts`
- Cron bearer secretのfail-closed: `src/app/api/jobs/run/route.ts`
- WP credential暗号化: `src/lib/crypto/`, `WordpressConnection`
- Admin token hash保存・expiry・single use: `AdminLoginToken`, `src/modules/auth/admin-login/`
- SSRF対策とredirect/DNS考慮: `src/lib/http/`
- structured loggerのsecret redaction: `src/lib/logger.ts`
- Prisma query本文をlogしない: `src/lib/db.ts`
- `.env.example`に秘密の実値を置かない方針
- user/persona/blog ownershipのintegration test

### リスク・不足

1. Workspace境界がないため、Platformのtenant isolation要件を満たさない。
2. User所有条件がrepositoryごとの実装規律に依存する箇所があり、新規経路で条件漏れが起きうる。
3. Capability permissionが未実装である。
4. 外部Providerはmock中心で、実LINE/AI/WordPress互換性が未確認である。
5. `AuditLog`は限定イベントのみで、管理者の全debug accessを強制記録する仕組みではない。
6. 暗号鍵rotation/versioningの仕組みは確認できず、`ENCRYPTION_KEY`変更で既存資格情報を失う運用になっている。
7. AI prompt/contextの保存最小化は新仕様の明示要件に合わせ再点検が必要である。
8. migration適用がdeploy外の手動手順であり、コードとDBのrollout順序に運用依存がある。

## 13. 技術的負債と最大リスク

| リスク                            | 影響                                        | 根拠/説明                                      | 優先度   |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------- | -------- |
| Userをtenant rootとして固定       | Workspace導入時の全面的な認可差分           | schema全体とrepository条件が`userId`中心       | Critical |
| PersonaとPlatform Bunshinの意味差 | データ誤移行、Memory混在                    | JSON profile、PersonaFact、Blog 1:1運用        | Critical |
| Capability contract不在           | SOCIAL/BLOGの密結合                         | entitlementは全許可、Blogが直接Persona配下     | High     |
| 外部実機未検証                    | 本番初回にProvider差異が顕在化              | `docs/DEPLOY.md` 8章                           | High     |
| Next.js単一deploy unit            | API/worker/adminの独立scale困難             | `src/app/`, Dockerfile                         | Medium   |
| provider contract不足             | structured output/embedding追加時の変更拡大 | `AiProvider.complete()`のみ                    | High     |
| JSON中心のPersona                 | migration/query/validationが難しい          | `Persona.identity/expertise/audience/business` | Medium   |
| Blog固有概念がUser周辺に広い      | shared抽出時の依存連鎖                      | schema、admin、jobs、analytics                 | High     |
| 手動migration rollout             | deploy事故                                  | `cloudbuild.yaml`, `docs/DEPLOY.md`            | Medium   |

最大のリスクはコード量ではなく、既存`Persona`を新`Bunshin`と同一視してそのままCoreへ流用することである。似ているが所有境界・知識・記憶・Capabilityの意味が異なるため、明示的な変換と移行mappingが必要である。

## 14. 結論

既存ブログ版には、BLOG Capabilityとして守るべき業務資産と、Platform sharedへ抽出できる技術資産が十分ある。一方、Platform Coreへそのまま昇格できるdomain modelはほぼない。Phase 1では既存コードを移動せず、新Platformのfoundationと境界contractを確定し、Phase 9まで旧システムを参照・併存できる形を選ぶべきである。

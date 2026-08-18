# Reuse Map: `stockbusiness/bunshin-blog` → BUNSHIN Platform

## 1. 分類基準

| 分類                      | 意味                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `REUSE_AS_IS`             | 意味・所有境界・契約を変えず利用可能。配置変更やimport修正程度は許容  |
| `REFACTOR_TO_SHARED`      | 実装知見を維持し、Platform共通contract/tenant contextへ適合させて抽出 |
| `KEEP_AS_BLOG_CAPABILITY` | BLOG固有資産として保持し、Coreへ混ぜない                              |
| `REIMPLEMENT`             | 新Core要件と意味が異なり、安全な変更より新規実装が妥当                |
| `REMOVE`                  | 移行完了後に廃止。Phase 0で削除はしない                               |
| `UNKNOWN`                 | 実環境/データ/契約の確認なしには決められない                          |

分類はコードの品質評価ではなく、**新しい所有境界に対する適合性**を示す。`REIMPLEMENT`は既存コードの即時削除を意味しない。

## 2. 主要機能・module

| 対象                          | 現状                                                     | 分類                      | 移行先                                                  | 理由                                                                | 依存                              | リスク                             |
| ----------------------------- | -------------------------------------------------------- | ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- | ---------------------------------- |
| `User` model                  | LINE user、role、plan相当、timezoneを保持。Workspaceなし | `REIMPLEMENT`             | `bunshin-core` + `database`                             | 新仕様のWorkspace/User分離とmembershipを先に確立する必要            | Prisma、auth、全所有repository    | ID mappingを誤ると全資産が孤立     |
| `Persona` model               | 1 User:N、JSON identity/expertise/audience/business      | `REIMPLEMENT`             | `bunshin-core` `Bunshin`/Objective/Audience/Personality | 方向性は近いが新Coreの意味・制約・所有境界と不一致                  | users、blogs、facts、generation   | Persona=Bunshinと短絡する危険      |
| `PersonaFact`                 | Persona単位の検証済みfact                                | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog`、必要分だけBunshinMemoryへ変換        | Blog記事のfact verification semanticsが強い                         | personas、article generation      | 全件Memory化でノイズ/権限混在      |
| `MonitorProfile`              | Blog検証参加者の設定                                     | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog` profile/config                        | SOCIAL利用者の汎用profileではない                                   | users、onboarding、schedule       | Core Userへ残すとBlog概念が漏れる  |
| Owner Knowledge               | 存在しない                                               | `REIMPLEMENT`             | `bunshin-core`                                          | Grant default DENYを新規実装する必要                                | Workspace/Bunshin authz           | 暗黙共有による情報漏えい           |
| Bunshin Memory                | PersonaFactで一部代替                                    | `REIMPLEMENT`             | `bunshin-core`                                          | source/confidence/importance/active/embeddingとisolationが必要      | AI context、feedback              | 既存factとの二重管理               |
| Capability assignment         | 実体なし、entitlementは全許可                            | `REIMPLEMENT`             | `capability-contract` + Core assignment                 | Bunshin単位のstatus/config/permissionが必要                         | policy、API guard                 | 未付与Capability実行               |
| Blog aggregate                | Persona必須、schedule/status/configを保持                | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog`                                       | BLOG固有のaggregate root                                            | Persona/User、WordPress、planning | 旧IDとBunshinCapabilityのmapping   |
| Blog slot/3件制限             | `slotNumber` 1..3                                        | `REMOVE`                  | Platform Plan Policy                                    | 旧検証固有。新仕様はplanのmaxBunshins/capabilityで制御              | blogs、tests、DB CHECK            | 早期削除で旧運用破壊               |
| Blog persona setting          | pen name/tone/writing rules                              | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog` config                                | Blog媒体固有overrideとして有用                                      | Blog、Persona                     | Core personalityとの優先順位       |
| WordPress module              | connection/auth/test/draft/sync                          | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/providers/wordpress`                   | BLOG固有で成熟度が高い                                              | crypto、HTTP、Blog/Post           | 実WordPress未確認                  |
| Content planning              | 記事構成、constraint、publish order                      | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/planning`                              | SEO/記事専用ロジック                                                | affiliate、persona、AI            | shared plannerへ一般化し過ぎる危険 |
| Content generation            | 記事、fact check、structured data                        | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/generation`                            | Article/SEO/WordPress semanticsが中心                               | AI、facts、offers                 | AI port抽出前の密結合              |
| Approvals core utilities      | status transition/retention/activity                     | `REFACTOR_TO_SHARED`      | `shared/approval` contract                              | SOCIAL Missionにも承認/skip/feedbackの類似概念がある                | Blog ArticleVersion、User         | 無理な共通化で状態語彙が崩れる     |
| Blog approval screens/routes  | 記事承認・revision                                       | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog` UI/API                                | Article固有payload                                                  | approvals、WordPress              | shared approvalとの境界            |
| Affiliate module              | offer/LP/link/scoring/catalog                            | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/affiliate`                             | ASP・記事収益固有                                                   | Blog、AI、HTTP                    | 将来SALES Coreへ混ぜない           |
| Banner module                 | WordPress slot banner                                    | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/banner`                                | Blog layout固有                                                     | Blog、affiliate                   | SOCIAL assetと誤統合               |
| Analytics module              | Search Console、click、revenue、publish pace             | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/analytics`                             | Blog KPI/SEO固有                                                    | Google、WordPress、affiliate      | Platform KPIとmetric名衝突         |
| Generic event/metric patterns | event id、daily aggregate、未報告と0の区別               | `REFACTOR_TO_SHARED`      | `observability`/analytics contracts                     | 実装パターンは汎用価値がある                                        | Prisma、datetime                  | schemaをそのまま共用しない         |
| Job runner                    | DB queue、lease、retry、backoff、checkpoint              | `REFACTOR_TO_SHARED`      | `shared/jobs` または `api` worker infrastructure        | 冪等処理の資産価値が高いがcontextがBlog中心                         | Prisma、handlers、cron            | 長時間AI、multi-tenant、scale      |
| Blog job handlers             | article schedule/generation/publish等                    | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/jobs`                                  | BLOG固有                                                            | jobs、WordPress、AI               | handler registryの循環依存         |
| Scheduler HTTP entry          | secret認証 + bounded drain                               | `REFACTOR_TO_SHARED`      | `apps/api`/worker entry                                 | 小規模MVPで再利用可能                                               | env、job runner                   | APIとworkerの同一scale             |
| AI provider interface         | `complete`, timeout, usage, cost                         | `REFACTOR_TO_SHARED`      | `packages/ai`                                           | model隠蔽・usage計測は有用。structured/embed contractへ拡張必要     | env、fetch、AI cost               | OpenAIは未実装、型互換なし         |
| AI model tier/config          | operation→tier→model                                     | `REFACTOR_TO_SHARED`      | `packages/ai/providers`                                 | 呼び出し側からmodelを分離済み                                       | env、provider                     | 旧model名/価格の鮮度               |
| Blog prompts                  | article/planning/fact-check prompts                      | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/prompts`                               | BLOG固有                                                            | AI、PromptVersion                 | SOCIALへ流用すると目的混同         |
| PromptVersion model           | key/version/body/active                                  | `REFACTOR_TO_SHARED`      | `packages/ai`/database                                  | 全AI taskでversionが必要                                            | Prisma、admin未完                 | activation scopeとimmutable policy |
| AiUsageLog                    | user/blog/job単位                                        | `REFACTOR_TO_SHARED`      | `observability`/database                                | usage/cost資産は有用。workspace/bunshin/task/latency/statusへ再設計 | AI、jobs、budget                  | 旧/new二重集計                     |
| LINE low-level client         | signature/messaging/transport/rich-menu                  | `REFACTOR_TO_SHARED`      | `packages/line` provider adapter                        | CoreからLINE SDK型を隔離できる                                      | runtime settings、fetch           | 実機未確認                         |
| LINE business messages        | Blog proposal/reply classification                       | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/line`                                  | Blog承認語彙に依存                                                  | approvals、jobs                   | SOCIAL Mission通知と混同           |
| LIFF ID token verification    | token verification、verified sub                         | `REFACTOR_TO_SHARED`      | `apps/api/auth` + `packages/line`                       | security patternを維持しWorkspace provisionへ変更                   | settings、User repository         | channel設定/issuer差異             |
| Session cookie                | HMAC signed application session                          | `REFACTOR_TO_SHARED`      | `apps/api/auth`                                         | 基本実装は再利用可能、workspace/membership contextが必要            | env、User lookup                  | rotation/revocation設計            |
| Admin magic link              | hash token、expiry、Resend                               | `REFACTOR_TO_SHARED`      | `apps/admin/auth`                                       | Platform adminにも有用                                              | users、mailer、session            | role model変更、実送信未確認       |
| Auth guards                   | active/consent/admin checks                              | `REIMPLEMENT`             | `apps/api` authz middleware/policy                      | User tenantからWorkspace+Bunshin+Capability scopeへ変更が大きい     | 全routes/repositories             | 条件漏れが重大                     |
| Audit module                  | structured action + metadata                             | `REFACTOR_TO_SHARED`      | `observability`                                         | admin intervention追跡に利用                                        | Prisma、modules                   | 記録失敗を常に無視する方針         |
| Structured logger             | JSON、redaction、child context                           | `REUSE_AS_IS`             | `observability`                                         | Provider非依存で新仕様のcontext追加が容易                           | console only                      | redaction完全性、集約backendなし   |
| App errors                    | status/code/details pattern                              | `REUSE_AS_IS`             | `shared/errors`                                         | Provider非依存                                                      | routes/modules                    | NestJS採用時のadapter必要          |
| AES-GCM crypto                | secret encryption helpers                                | `REFACTOR_TO_SHARED`      | `shared/crypto`                                         | WP/Provider credential保存に有用                                    | env key                           | key rotation/versioningなし        |
| Safe HTTP/SSRF guard          | address/redirect/transport                               | `REUSE_AS_IS`             | `shared/http`                                           | 外部URL取込で有用                                                   | DNS/fetch                         | proxy/IPv6/実環境再検証            |
| Settings module               | catalog、mask、encrypted secret、connection test         | `REFACTOR_TO_SHARED`      | `shared/settings`/admin                                 | runtime provider configに有用                                       | crypto、Prisma、providers         | tenant/global scopeの分離          |
| Mailer/Resend                 | adapter interfaceあり                                    | `REFACTOR_TO_SHARED`      | `shared/mailer`                                         | admin auth/alertsに有用                                             | env、Resend                       | 実送信未確認                       |
| Google Search Console         | service account、analytics、inspection                   | `KEEP_AS_BLOG_CAPABILITY` | `capability-blog/providers/google`                      | Blog SEO固有                                                        | settings、HTTP                    | quota/property permission          |
| LIFF UI shell/provider        | mobile bootstrap/session                                 | `REFACTOR_TO_SHARED`      | `apps/web`                                              | LINE起点mobile UXの基礎                                             | Next.js、LIFF SDK                 | Bunshin selector/Today UXへ再設計  |
| Existing Blog LIFF screens    | onboarding/blog/offers/approvals/results                 | `KEEP_AS_BLOG_CAPABILITY` | 旧運用継続またはBLOG UI                                 | Blog workflow固有                                                   | legacy API                        | Platform navigation統合            |
| Admin shell/nav/UI primitives | protected layout、共通UI                                 | `REFACTOR_TO_SHARED`      | `apps/admin`                                            | 100-user運用基盤に活用                                              | Next.js auth                      | design system未整備                |
| Admin Blog screens            | genre/catalog/facts/publish pace                         | `KEEP_AS_BLOG_CAPABILITY` | BLOG admin area                                         | Blog固有                                                            | legacy modules                    | Core adminへ露出し過ぎない         |
| CI verification pattern       | lint/typecheck/test/build/schema/integration             | `REUSE_AS_IS`             | root CI（commandはpnpm化）                              | quality gateが明確                                                  | npm scripts、Postgres             | monorepo時間増大                   |
| Docker/Cloud Run build        | standalone Next image                                    | `UNKNOWN`                 | apps別deploy                                            | 本番実績はあるがtarget runtime未決                                  | GCP、Next.js                      | Nest/API/worker分割で再設計        |
| Cloud Build deployment        | main→Cloud Run                                           | `UNKNOWN`                 | platform deployment pipeline                            | API本番環境が未決事項                                               | GCP IAM/Artifact Registry         | migration rollout、人手依存        |
| Existing DB rows              | 本番内容未調査                                           | `UNKNOWN`                 | migration/import pipeline                               | 件数、品質、PII、orphanを確認できていない                           | production access                 | irreversible mapping               |

## 3. `REUSE_AS_IS`の限定

「そのまま」はsource fileを無編集でmonorepoへコピーすることを保証しない。現時点で意味を維持できるのは次の技術的に閉じた部品である。

- structured logger/redaction
- common application error pattern
- safe HTTP/SSRF primitives
- CIのquality gate構成思想

これらもpackage境界、import path、test runnerの変更はあり得る。

## 4. 移行順序

1. Phase 1でPlatform foundationとcontractだけを作り、旧コードは移動しない。
2. Phase 2でWorkspace/User/Bunshin/Capability/ownershipを新DBに確立する。
3. shared候補は、SOCIALで実需要が生じた時点にcontract-firstで抽出する。
4. BLOGは旧システムを稼働させたまま、Phase 9でAnti-Corruption Layer経由で接続する。
5. 実データをinventoryし、User/Persona/Blog ID mappingとknowledge/memory変換をdry-runする。
6. read parity、dual-readまたはshadow comparison、rollback条件を満たしてから切替える。
7. 旧route/tableの`REMOVE`は移行完了・rollback期間終了後だけ行う。

## 5. 明示的に再利用しないもの

- `slotNumber`によるPersona/Blog上限をPlatform Plan Policyとして流用しない。
- Persona JSONをそのまま新Bunshin profileの正本にしない。
- `PersonaFact`を無条件にOwner KnowledgeまたはBunshin Memoryへ複製しない。
- Blogのproposal/approval状態をSOCIAL Daily Mission状態へ共通化しない。
- WordPress/affiliate/SEO型をCore Entityへ持ち込まない。
- `entitlements.ts`の全許可実装をCapability permissionとして扱わない。

## 6. 未決事項

- 旧Userと新Workspace/UserのIDを維持するかmapping tableを使うか。
- 旧Persona 1件を新Bunshin 1件へ必ず対応させるか、品質確認後に選択移行するか。
- 新旧DBを分離する期間と、BLOG Capabilityの最初の接続をAPI/DB importのどちらにするか。
- GCP継続、Supabase採用、または併用の運用責任。
- 旧本番データ、外部資格情報、暗号鍵の移行権限と手順。

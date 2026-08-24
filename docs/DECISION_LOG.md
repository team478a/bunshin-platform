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

## D-012: Phase 2を独立した縦切りで進める

- 日付: 2026-08-18
- 状態: Accepted（Phase 2 Slice 2.1-A / 2.1-B完了）
- 提案: Phase 2はBunshin Identity、Owner Knowledge/Grant、Bunshin Memory、Capability Assignmentの順に独立PRで進める
- 理由: Multi-Bunshinの所有境界を先に検証し、SOCIAL、AI、LINE、BLOGの関心事をCoreへ混在させないため
- 最初のSlice: Bunshin CRUDとObjective/Audience/Personality、およびCross User isolation
- 詳細: `docs/PHASE2_READINESS_PLAN.md`

## D-013: 初期本番環境はVercelとSupabaseを東京に配置する

- 日付: 2026-08-18
- 状態: Accepted
- 決定: Web/APIはVercel Pro `hnd1`、PostgreSQLはSupabase Pro `ap-northeast-1`を使用する
- 理由: Next.js/Prismaの現行構成との差分と少人数運用の負担を抑え、applicationとDBを同じ東京圏に配置するため
- 接続: runtimeはSupavisor transaction mode、migrationはdirect connectionまたはsession poolerを使用する
- 環境方針: 実運用開始まではstaging専用Supabaseを作成せず、local development、GitHub Actionsの一時DB、productionの3環境で運用する
- 禁止: Preview deploymentをproduction DBへ接続しない
- Staging追加条件: 実ユーザー受入前、またはproduction相当環境でDB migration・認証・外部連携の事前検証が必要になった時点
- 将来: worker、長時間Job、private network等が必要になった時点でCloud Run / Cloud SQLを再評価する
- 詳細: `docs/PRODUCTION_ENVIRONMENT_PLAN.md`

## D-014: Phase 2 Slice 2.1を認証Gateで分割する

- 日付: 2026-08-18
- 状態: Accepted（PR 2.1-AでCore Persistenceを実装）
- 提案: PR 2.1-AではBunshin Core Persistenceだけを実装し、Production API/UIはapplication sessionとCurrentUserProvider adapterを承認したPR 2.1-Bまで公開しない
- 理由: Productionに実認証がない状態でactorUserIdをrequestから受け取ると、Workspace/Bunshin境界を保証できないため
- 禁止: header、query、cookieの任意User IDを信頼するmock認証をProduction routeへ接続しない
- 詳細: `docs/PHASE2_SLICE_2_1_IMPLEMENTATION_INSTRUCTION.md`

## D-015: Web認証/sessionにSupabase Authを採用する

- 日付: 2026-08-18
- 状態: Accepted
- 提案: Email Magic Link + PKCE、Supabase SSR cookie、server-side `getUser()`検証を採用する
- 認可: Supabase JWT claimではなくPlatform DBのactive User/AuthIdentity/WorkspaceMembershipを正本とする
- Session案: access token 1時間、最大30日、inactivity 7日、初期段階ではsingle-sessionを無効とする
- 防御: Origin validation、Supabase Auth rate limit、Vercel WAF rate limitを併用する
- SMTP: Resend Freeを認証メール専用で使用し、認証専用subdomainのSPF/DKIM/DMARCを設定する
- 禁止: request由来User ID、Productionでのmock auth、BrowserからのBunshin table直接access
- Gate: custom SMTP、Site/Redirect URL、session値、WAF値の承認後にSlice 2.1-Bを開始する
- 詳細: `docs/AUTH_SESSION_ADR.md`

## D-016: Owner Knowledge Grantは明示ALLOWと監査可能な失効で管理する

- 日付: 2026-08-18
- 状態: Accepted（PR #9で承認）
- 提案: 有効なGrantが存在しない状態をdefault DENYとし、Grantは`ACTIVE | REVOKED`で保持する
- 監査: revokeは物理削除せず`revokedAt`を記録し、再grantは同一rowを再有効化する
- 境界: KnowledgeとBunshinは同じWorkspaceに限定し、application/repository transactionとPostgreSQL integration testで保証する
- PR分割: Slice 2.2-AはCore Persistenceのみ、認証済みAPI/UIは2.2-Bへ分離する
- 禁止: AI抽出、embedding、RAG、import、file upload、Memory、Capability、SOCIAL、LINE、BLOG、Jobを混在させない
- 詳細: `docs/PHASE2_SLICE_2_2_IMPLEMENTATION_INSTRUCTION.md`

## D-017: Knowledge API/UIは本人所有と最小Grant操作に限定する

- 日付: 2026-08-18
- 状態: Accepted（PR #11で承認）
- 提案: Knowledge CRUDはverified session user本人の所有Knowledgeだけを扱い、Bunshin詳細へ最小のgrant/revoke操作を追加する
- DTO: `ownerUserId`と`grantedByUserId`を通常の公開responseから除外する
- 防御: mutationはsame-originとJSONを必須とし、default DENYと既存Bunshin管理policyを再利用する
- 禁止: 他User Knowledgeの候補表示、AI抽出、embedding、RAG、import、file upload、Memory、Capability、SOCIAL、LINE、BLOG、Job
- Gate: Supabase Auth本番設定、migration、browser smoke、human security reviewの完了前はProduction公開しない
- 詳細: `docs/PHASE2_SLICE_2_2B_IMPLEMENTATION_INSTRUCTION.md`

## D-018: Bunshin Memoryはsoft deleteしembeddingをPhase 6まで延期する

- 日付: 2026-08-18
- 状態: Accepted（PR #13で承認）
- 提案: Memoryは`workspaceId + bunshinId`でscopeし、無効化とsoft deleteを区別する
- 削除: `active=false`と`deletedAt`を記録し、通常取得から除外する
- embedding: provider、model、次元数、index、再生成方針が未決定のため、Phase 6のADRとmigrationまでcolumn追加を延期する
- 作成元: Slice 2.3では`USER_INPUT`だけを許可する
- PR分割: 2.3-A Core Persistenceと2.3-B authenticated API/UIを分離する
- 禁止: AI抽出、要約、pgvector、RAG、Mission連携、Bunshin間Memory共有を混在させない
- 詳細: `docs/PHASE2_SLICE_2_3_IMPLEMENTATION_INSTRUCTION.md`

## D-019: Memory API/UIはBunshin配下の手動管理に限定する

- 日付: 2026-08-18
- 状態: Accepted（PR #15で承認）
- 提案: Memory API/UIはverified sessionと既存Bunshin管理policyへ接続し、Bunshin詳細内でactive/inactive Memoryの手動管理だけを提供する
- 一覧: 通常はactiveのみ、明示切替時はinactiveのみを返し、deleted Memoryの取得・復元経路は作らない
- DTO: `sourceId`と`deletedAt`を公開せず、Memory本文・summaryをlogへ記録しない
- 削除: HTTP DELETEでsoft deleteし、物理削除と復元UIは提供しない
- 禁止: AI抽出、AI要約、embedding、RAG、Mission連携、Bunshin間共有を混在させない
- 詳細: `docs/PHASE2_SLICE_2_3B_IMPLEMENTATION_INSTRUCTION.md`

## D-020: Capability Assignmentは明示割当とCore guardで管理する

- 日付: 2026-08-19
- 状態: Accepted（PR #17で承認）
- 提案: CapabilityはBunshin本体へ直書きせず、Workspace/Bunshin scoped Assignmentとして`ACTIVE | SUSPENDED | LOCKED`を管理する
- 一意性: `workspaceId + bunshinId + capabilityType`
- 実行防御: 未割当、SUSPENDED、LOCKEDを`RequireActiveBunshinCapability`がapplication層で拒否する
- 公開範囲: Coreは既存CapabilityType全体を保持可能とするが、Phase 2のAPI/UIで新規割当できるのはSOCIALだけとする
- config: DBには空objectで保持し、Capability側のschemaが決まるまでinput/DTOへ公開しない
- 状態遷移: assign/activate/suspendを冪等にし、LOCKED操作、削除、unassignはPhase 2で提供しない
- PR分割: 2.4-A Core Persistenceと2.4-B authenticated API/UIを分離する
- 禁止: Capability handler、Provider、投稿、AI、LINE、BLOG、Jobを混在させない
- 詳細: `docs/PHASE2_SLICE_2_4_IMPLEMENTATION_INSTRUCTION.md`

## D-021: Phase 2のCapability管理UIはSOCIAL割当状態だけを公開する

- 日付: 2026-08-19
- 状態: Accepted（PR #19で承認）
- 提案: 既存Bunshin詳細へ最小Capabilityセクションを追加し、公開mutationをSOCIALのassign／activate／suspendだけに限定する
- HTTP: listとSOCIAL状態変更はverified session、same-origin、JSON、`no-store`を必須とする
- DTO: `config`と`assignedByUserId`を公開しない
- 非目標: SOCIAL処理、Provider、AI、Job、LOCKED操作、削除、unassign、config編集は実装しない
- 理由: Capability実行機能より先に明示割当とtenant／Bunshin境界をHTTP/UIまで一貫させ、未承認機能の公開を防ぐため
- 詳細: `docs/PHASE2_SLICE_2_4B_IMPLEMENTATION_INSTRUCTION.md`

## D-022: Phase 3は手動Social Profileから開始する

- 日付: 2026-08-19
- 状態: Accepted（PR #22で承認）
- 提案: Phase 3最初のSliceをSocial Profileとし、3.1-A Core Persistenceと3.1-B authenticated API/UIへ分割する
- 一意性: `workspaceId + bunshinId + platform`
- Capability: mutationはACTIVE SOCIAL Assignmentを必須とする
- 状態: ProfileのACTIVE/INACTIVEとCapability AssignmentのACTIVE/SUSPENDED/LOCKEDを別状態として管理する
- 形式: preferredFormatsはtyped arrayとして検証し、DBではJSON arrayとして保持する
- 禁止: Content Pillar、Mission、AI、SNS Provider、LINE、BLOG、Jobを混在させない
- 理由: ProviderやAIより先にSOCIAL固有package、tenant/Bunshin境界、Capability guardを最小modelで検証するため
- 詳細: `docs/PHASE3_SLICE_3_1_IMPLEMENTATION_INSTRUCTION.md`

## D-023: Social Profile API/UIはBunshin詳細内の手動設定に限定する

- 日付: 2026-08-19
- 状態: Accepted（PR #24で承認）
- 提案: Social Profileは`workspaceId + bunshinId + platform`で識別し、既存Bunshin詳細内でlist/create/update/activate/deactivateだけを提供する
- 状態: Assignment停止中はread-onlyとし、外部SNS通信を行わない
- HTTP: createは201、updateと冪等な状態変更は200とする
- 禁止: Profile ID path、DELETE、platform変更、SNS OAuth、投稿、AI、Mission、Jobを提供しない
- 理由: Coreのtenant/Bunshin境界とCapability guardをHTTP/UIでも維持し、Provider接続や投稿実行を後続Sliceへ分離するため
- 詳細: `docs/PHASE3_SLICE_3_1B_IMPLEMENTATION_INSTRUCTION.md`

## D-024: Content Pillarは安定IDを持つ手動管理resourceとする

- 日付: 2026-08-19
- 状態: Accepted（PR #26で承認）
- 提案: Content PillarはUUID、title、description、weight、active、deletedAtを持ち、3.2-A Core Persistenceと3.2-B API/UIへ分割する
- 一意性: `workspaceId + bunshinId + title`。soft delete後もtitleを再利用しない
- weight: 1..100の相対優先度とし、合計100や件数5〜10を強制しない
- delete: soft delete。restoreと物理削除は提供しない
- Capability: mutationはACTIVE SOCIAL Assignmentを必須とし、停止中もreadを許可する
- 禁止: AI、Weekly Plan、Mission、SNS Provider、LINE、BLOG、Jobを混在させない
- 理由: 後続Weekly Planが参照できる安定IDとtenant/Bunshin境界を、生成機能より先に確立するため
- 詳細: `docs/PHASE3_SLICE_3_2_IMPLEMENTATION_INSTRUCTION.md`

## D-025: Content Pillar API/UIはBunshin詳細内の手動管理に限定する

- 日付: 2026-08-19
- 状態: Accepted（PR #28で承認）
- 提案: Bunshin scopeされたUUID pillarIdでlist/detail/create/update/activate/deactivate/soft-deleteを提供する
- HTTP: createは201、それ以外の成功は200。DELETEはbodyを受け付けない
- Capability: Assignment停止中もreadを許可し、mutationだけを拒否する
- UI: 既存Bunshin詳細内の最小セクションとし、削除前確認とrestore不可を明示する
- 禁止: AI、Weekly Plan、Mission、Provider、LINE、BLOG、Jobを提供しない
- 理由: Coreで確立したtenant/Bunshin/soft-delete境界を維持し、計画生成より先に安全な手動管理を公開するため
- 詳細: `docs/PHASE3_SLICE_3_2B_IMPLEMENTATION_INSTRUCTION.md`

## D-026: Weekly Planはtimezone snapshot付きlocal DATEと明示状態遷移で管理する

- 日付: 2026-08-19
- 状態: Accepted（PR #30で承認）
- 提案: 週をIANA timezone上の月曜〜日曜とし、Planへtimezone snapshot、Plan/ItemへPostgreSQL DATEを保存する
- 一意性: 同一Workspace/Bunshin/週は1 Plan、同一Plan/日は1 Itemとする
- 状態: DRAFTだけを編集可能とし、CONFIRMED/EXPIREDはimmutable、confirm/expireは冪等とする
- Pillar: DRAFT Itemとconfirmでは同一Bunshinのactive Content Pillarを必須とし、確定済み履歴はPillar停止後も保持する
- PR分割: 3.3-A Core Persistenceと3.3-B authenticated API/UIを分離する
- 禁止: AI planner、Daily Mission、scheduler、Provider、LINE、BLOG、Jobを混在させない
- 理由: AI生成や日次Missionより先にcalendar、tenant/Bunshin/Pillar境界と計画の確定点を安定させるため
- 詳細: `docs/PHASE3_SLICE_3_3_IMPLEMENTATION_INSTRUCTION.md`

## D-027: Weekly Plan API/UIはBunshin詳細内の手動計画に限定する

- 日付: 2026-08-19
- 状態: Accepted（PR #32で承認）
- 提案: Bunshin scopeされたUUID Plan/Item APIと既存Bunshin詳細内の最小手動管理UIを提供する
- HTTP: Plan/Item createは201、その他は200。DELETEはbodyを受け付けない
- timezone: browser timezoneは作成フォーム初期値にだけ使用し、保存前にUserが確認・変更する
- 状態: DRAFTだけを編集可能とし、確定・失効後はread-onlyにする
- Capability: Assignment停止中もreadを許可し、mutationだけを拒否する
- 禁止: AI planner、Daily Mission、scheduler、Provider、LINE、BLOG、Jobを提供しない
- 理由: 3.3-Aで確立したcalendar、tenant/Bunshin/Pillar、確定点をHTTP/UIでも維持し、自動生成を後続Phaseへ分離するため
- 詳細: `docs/PHASE3_SLICE_3_3B_IMPLEMENTATION_INSTRUCTION.md`

## D-028: Daily Missionはformat別Contentを持つ必須1対1aggregateとする

- 日付: 2026-08-19
- 状態: Accepted（PR #34で承認）
- 提案: Slice 3.4をCore Persistenceだけに限定し、DailyMissionとstrict validation済みMissionContentを同一transactionで保存する
- 一意性: 通常Missionは`workspaceId + bunshinId + missionDate`で1件とする
- 日付: missionDateはtimezoneを持たないDATEとし、Missionへtimezone snapshotを保存しない
- 状態: GENERATED / VIEWED / STARTED / COMPLETED / SKIPPED / EXPIREDを持ち、terminal状態はimmutable、同一状態操作は冪等とする
- Capability: Assignment停止中もreadを許可し、mutationだけを拒否する
- 禁止: API/UI、AI、Feedback、PostRecord、LINE、Jobを提供しない
- 理由: Phase 4の生成adapterより先にtenant、日付、content、状態の保存境界を固定し、不完全な生成結果や越境参照を防ぐため
- 詳細: `docs/PHASE3_SLICE_3_4_IMPLEMENTATION_INSTRUCTION.md`

## D-029: FREE SOCIAL MVPをAI企画担当として再定義する

- 日付: 2026-08-19
- 状態: Accepted（PR #37で承認）
- 提案: BUNSHIN SOCIAL FREEを、自動制作・自動投稿サービスではなく、SNS戦略、投稿企画、投稿文章、構成、外部AI向けPrompt、採否と行動の学習を担うAI企画担当として再定義する
- 分担: BUNSHINは戦略と実行指示を提供し、ユーザーが必要に応じて外部サービスで画像・動画を制作して自分で投稿する
- Strategy: SocialProfileの上にversion管理・承認可能なSocialAccountStrategyを追加する
- Primary SNS: 内部の複数SNS対応を維持しながら、FREEでは1 BunshinにつきPrimary SNS 1件に制限する。具体的なDB表現は後続指示書で承認する
- Platform / Format: `THREADS`、`YOUTUBE_SHORTS`と`TEXT`を追加候補とし、既存データ互換性を確認する独立PRで扱う
- Decision: DailyMission lifecycleを維持し、採用/不採用をMissionDecisionへ分離する。PENDING行をMission作成時に必須化するかは後続指示書で確定する
- Activity: VIEWED、ACCEPTED、REJECTED、COPY、POSTED、FEEDBACK等をappend-only Raw Eventとして保存し、再送を重複計上しないidempotency境界を持つ
- Learning: PreferenceとOutcomeを分離し、不採用1件を自動Memory化しない。FREEではRaw Eventを正しく蓄積する
- Provider: SNS OAuth、自動投稿、自動metrics、画像・動画生成Providerを100人検証前に実装しない。将来もPort / Provider Adapter方式とする
- Share / Referral: FREE継続率確認後のPhaseへ延期し、現金報酬を実装しない
- KPI: 最重要指標を「7日間でBUNSHINの指示に従って3回以上実際に投稿したユーザー率」とする
- PR分割: 最初は文書だけを承認し、Platform/Format、Strategy Core、Wizard、Generator、Mission API/UI、Decision/Activity、PostRecord/Feedback、Mission Generatorを独立PRで進める
- 禁止: 本決定の文書PRへコード、schema、migrationを混在させない
- 詳細: `docs/FREE_SOCIAL_MVP_REBASELINE.md`

## 未決事項

後続Phaseで決める項目:

- 既存ブログ版から移植する具体的module
- APIの本番実行環境
- 認証とLINE Providerの詳細
- Scheduler/Queue方式
- Phase 9における既存DBの具体的な移行手順
- Supabase RLSの採用可否

## D-030: SocialAccountStrategyを不変versionとして管理する

- 日付: 2026-08-20
- 状態: Accepted
- 決定: Strategy本文は更新せず、SocialProfile単位でversionを追加する
- 承認: 現在のAPPROVEDは最大1件とし、新version承認時に旧版をSUPERSEDEDへ遷移する
- 整合性: application transactionに加え、DBの部分unique indexと複合外部キーで競合・tenant混入を防ぐ
- 保留: Primary SNSの表現は既存Profileのbackfill方針が決まるまで実装しない

## D-031: Account Strategy生成はCore PortとOpenAI Responses Adapterを分離する

- 日付: 2026-08-20
- 状態: Accepted（PR #41で承認）
- 決定: Coreへ`StrategyGeneratorPort`を置き、OpenAI固有処理はWeb Provider Adapterへ隔離する
- 出力: Responses APIのstrict `json_schema`とCore validationを併用し、6つのStrategy本文を構造化出力する
- Privacy: `store: false`を指定し、生成contextは対象Bunshin、Wizard回答、同一scopeのGrant済みOwnerKnowledgeだけに限定する。Memoryはまだ利用しない
- Version: 生成結果は既存use caseで`PROPOSED` versionとして保存し、承認済みversionを上書きしない
- Observability: model、prompt version、token数、latency、成功/失敗を記録し、入力本文、Knowledge本文、生成本文、credentialを記録しない
- Model: `OPENAI_STRATEGY_MODEL`で切替可能とし、初期既定値を`gpt-5.2`とする
- 禁止: Mission生成、Decision / Activity、PostRecord、Feedback、Memory学習、Publishing Providerを混在させない
- 詳細: `docs/STRATEGY_GENERATOR_REPORT.md`

## D-032: Daily Mission API/UIはlifecycle操作だけを公開する

- 日付: 2026-08-20
- 状態: Accepted（PR #42で承認）
- 決定: 既存DailyMission Coreをverified sessionへ接続し、list/detail/createと明示lifecycle遷移を提供する
- UI: Bunshin詳細でformat別内容を表示し、VIEWED / STARTED / COMPLETED / SKIPPEDだけをユーザー操作として提供する。EXPIRED APIは将来Jobが同じCoreを利用できるよう保持する
- Create: 後続AI Generator用APIは提供するが、手動作成フォームは提供しない
- 分離: Mission lifecycleへ採用/不採用を追加せず、Decision、Activity、Copy、PostRecord、Feedbackを別resourceとして後続PRへ分離する
- Capability: Assignment停止中もreadを許可し、mutationだけを拒否する
- 禁止: AI生成、Provider、regenerate、Decision / Activity、PostRecord / Feedback、LINE、Jobを混在させない
- 詳細: `docs/DAILY_MISSION_API_UI_REPORT.md`

## D-033: Mission Decisionを必須1対1、Activityをappend-onlyにする

- 日付: 2026-08-20
- 状態: Accepted（PR #43で承認）
- Decision: Mission作成時にPENDING rowを同一transactionで作り、既存Missionもmigrationでbackfillする
- 更新: 現在判断は1 Mission 1 rowへ保存し、判断変更履歴はActivityへappendする
- Rejection: REJECTEDは理由必須、OTHERだけ任意詳細を許可し、ACCEPTEDは不採用情報を持たない
- Activity: 3.6-AではVIEWED、ACCEPTED、REJECTED、format別COPYを定義する
- Idempotency: keyを必須とし、Workspace/Bunshin/actor/keyをuniqueにする。同一payload再送は既存結果、異なるpayload再利用はCONFLICTとする
- Metadata: event別strict schemaとし、本文、Knowledge、Memory、credential、Provider payloadを保存しない
- 分離: API/UI、PostRecord、Feedback、AI、LINE、Jobを混在させない
- 詳細: `docs/PHASE3_SLICE_3_6A_IMPLEMENTATION_REPORT.md`

## D-034: 採用判断をコピー操作より先に要求し、成功した操作だけをActivityへ記録する

- 日付: 2026-08-20
- 状態: Accepted（PR #44で承認）
- API: DecisionとActivityをDailyMission配下の独立resourceとして公開し、verified sessionのactorだけを使用する
- UX: 投稿案の表示後は採用/不採用を先に提示し、採用後だけformat別コピー操作を表示する
- Rejection: 不採用理由はワンタップを基本とし、OTHERだけ任意詳細を許可する
- Copy: Clipboard API成功後にだけformat別COPY Activityをappendし、失敗操作を計測しない
- IMAGE: 画像制作指示は`COPIED_IMAGE_INSTRUCTION`、投稿文は`COPIED_TEXT`として別々にコピー・計測する。指示文本文はActivity metadataやlogへ保存しない
- Activity: VIEWEDは内容を開いた行動として記録し、Mission lifecycleのVIEWEDとは別責務のRaw Eventとする
- 禁止: PostRecord、Feedback、AI生成、Provider、LINE、Jobを混在させない
- 詳細: `docs/PHASE3_SLICE_3_6B_IMPLEMENTATION_REPORT.md`

## D-035: PostRecordを投稿事実の正本、MissionFeedbackを本人らしさの現在評価とする

- 日付: 2026-08-20
- 状態: Accepted（PR #45で承認）
- PostRecord: ACCEPTED済みMissionに対する手動投稿を1 Mission 1件で保存し、SNS API由来の値をFREE Coreへ要求しない
- Atomicity: PostRecordとPOSTED Activityを同一transactionで保存する
- Lifecycle: 投稿事実とDailyMission lifecycleを分離し、投稿記録時にCOMPLETEDへ暗黙遷移しない
- Feedback: PostRecord作成後だけGOOD / NEUTRAL / BADを保存し、現在評価は1件、変更履歴はappend-only Activityへ残す
- Preference / Outcome: PostRecordをOutcome、MissionFeedbackをPreferenceとして分離する
- Idempotency: Workspace / Bunshin / actor / keyで再送を重複計上せず、Mission単位の一意制約も併用する
- Privacy: Activity metadataへ投稿本文、URL、外部ID、metricsを複製しない
- 分離: API/UI、SNS自動投稿、Analytics、AI、Memory学習、LINE、Jobを混在させない
- 詳細: `docs/PHASE3_SLICE_3_7A_IMPLEMENTATION_REPORT.md`

## D-036: 投稿完了後にだけ本人らしさFeedbackを提示する

- 日付: 2026-08-20
- 状態: Accepted
- API: PostRecordとMissionFeedbackをDailyMission配下の独立resourceとして公開し、verified sessionのactorだけを使用する
- Posted UX: ACCEPTED済みMissionへ「投稿しました」を表示し、サーバーでPostRecord保存に成功した後だけ投稿済み表示へ切り替える
- Feedback UX: PostRecord作成後だけGOOD / NEUTRAL / BADを提示し、現在評価を`aria-pressed`で表現する
- Platform: Missionに関連するSocialProfileのplatformを使用し、未関連Missionでは投稿完了操作を無効にする
- Input: FREE APIからpostedAt、source、externalPostId、manualMetrics、actor等を受け取らない
- Security: same-origin、strict JSON、no-store、Workspace / Bunshin isolationを維持する
- 分離: SNS自動投稿、Analytics、AI、Memory学習、LINE、BLOG、Jobを混在させない
- 詳細: `docs/PHASE3_SLICE_3_7B_IMPLEMENTATION_REPORT.md`

## D-037: Weekly Plannerは承認済み戦略からatomicなDRAFTを生成する

- 日付: 2026-08-20
- 状態: Accepted
- Context: 対象Bunshin、Active SocialProfile、その承認済みAccount Strategy、Active Content Pillar、Grant済みOwnerKnowledgeだけを利用する
- Isolation: verified sessionのactorを起点にWorkspace / Bunshinを絞り、クライアントからKnowledgeや戦略本文を受け取らない
- Provider: Coreは`WeeklyPlannerPort`だけに依存し、WebのOpenAI AdapterがResponses APIのstrict JSON Schemaを使う
- Persistence: 生成結果をCoreで再検証し、Planと1〜7件のItemを同一transactionでDRAFT保存する。自動CONFIRMEDにしない
- Cost guard: SOCIALのActive状態、同週重複、Active Pillar、Active Profile、承認済み戦略をProvider呼び出し前に検証する
- Observability: model、prompt version、input/output token、latency、statusを記録し、Prompt、生成本文、Knowledge、credentialはログに残さない
- Model: `OPENAI_WEEKLY_PLANNER_MODEL`で切替可能とし、初期既定値を`gpt-5.2`とする
- 分離: Daily Mission生成、Content Generator、Quality Checker、画像/動画binary、自動投稿、Memory学習、LINE、BLOG、Jobを混在させない
- 詳細: `docs/PHASE4_SLICE_4_1_IMPLEMENTATION_REPORT.md`

## D-038: Daily Mission Plannerは本文のないMission Briefを生成する

- 日付: 2026-08-21
- 状態: Accepted
- Responsibility: Plannerは確定済みWeekly Planの当日Itemから`topic / angle / reason / estimatedMinutes`だけを生成する
- Trusted values: `socialProfileId / weeklyPlanItemId / missionDate / format`はProvider出力を信頼せず、scope検証済み入力から引き継ぐ
- Context: 承認済みWeekly Plan、当日Item、Active Content Pillar、Bunshin、承認済みStrategy、Grant済みOwnerKnowledgeを使う
- Feasibility: `estimatedMinutes`はStrategy Wizardの`availableMinutes`以内とし、ユーザーが今日実行できる計画に限る
- Provider: Coreは`DailyMissionPlannerPort`に依存し、Web AdapterはOpenAI Responses APIのstrict JSON Schemaと`store: false`を使う
- Persistence: MissionContent必須aggregateを守るため、Planner単体でDailyMissionを保存しない。Content GeneratorとQuality Checker完了後にorchestrationがまとめてatomic保存する
- Privacy: ProviderへWorkspace ID、Bunshin ID、Plan ID、Item IDを渡さず、Prompt、Knowledge、生成本文、credentialをログへ保存しない
- Model: `OPENAI_DAILY_MISSION_PLANNER_MODEL`で切替可能とし、初期既定値を`gpt-5.2`とする
- 分離: Content Generator、Quality Checker、API/UI、Job、画像/動画binary、自動投稿、Memory学習、LINE、BLOGを混在させない
- 詳細: `docs/PHASE4_SLICE_4_2_IMPLEMENTATION_REPORT.md`

## D-039: Daily Missionは品質合格後にだけ完全aggregateとして保存する

- 日付: 2026-08-21
- 状態: Accepted
- Pipeline: Daily Mission Planner → Content Generator → Quality Checkerを同期実行し、途中結果は保存しない
- Content: `TEXT / SLIDE / IMAGE / LIVE_ACTION / AI_VIDEO_PROMPT`を同じPortで生成し、Coreがformat別schemaを再検証する
- Quality: Stage 1でformat/platformとschemaを決定的に検査し、Stage 2で`PASS / REVISE / REJECT`、0〜100点、構造化issuesをstrict schemaで受ける
- Repair: `REVISE`はrepairInstructionだけを限定contextとして最大1回再生成し、再検査が`PASS`以外なら保存しない
- Persistence: 品質合格後だけ既存`CreateDailyMission`へBrief、Content、qualityScoreを渡し、Mission / Content / PENDING Decisionを同一transactionで保存する
- Cost guard: verified session、Active SOCIAL、同日重複、Active Profile、承認済みStrategy、確定済みWeekly Planと当日ItemをProvider呼び出し前に検証し、DB claimで並行生成を抑止する
- Isolation: ProviderへWorkspace ID、Bunshin ID、Profile ID、Plan ID、Item IDを渡さず、Grant済みKnowledgeだけを利用する
- Observability: task type、provider、model、prompt version、token、latency、成否を構造化ログへ記録し、Prompt、生成本文、Knowledge、credentialは記録しない
- Provider: Responses APIのstrict JSON Schemaと`store: false`を使用し、modelは`OPENAI_CONTENT_GENERATOR_MODEL`、`OPENAI_MISSION_QUALITY_MODEL`で任意上書きする。timeout、rate limit、Provider error、不正JSONを分類する
- HTTP: Quality不合格は422、Provider一時障害は503、同日競合は409とする
- UX: ActiveなSNS Profileと日付を選び、既存Missionがない日だけ画面から生成できる
- 分離: Job、LINE、SNS自動投稿、画像・動画binary生成、Memory自動学習、BLOGを実装しない
- 詳細: `docs/PHASE4_INTELLIGENCE_COMPLETION_REPORT.md`

## D-040: Phase 6のLINEをMission通知と入口に限定する

- 日付: 2026-08-22
- 状態: Proposed
- Product: LINEはDaily Missionの準備完了を通知し、対象Mission画面へ戻す入口とする
- Notification: 投稿本文、Prompt、KnowledgeをPushせず、Mission生成成功後だけ1回通知する
- Separation: 通知機能と将来の`LINE_MARKETING` Capabilityを分離し、販促ステップ配信、セグメント配信、AI自動返信を実装しない
- Provider: Login、Messaging、Webhookは用途別PortからLINE Adapterを呼び、SDK型とraw responseをCoreへ渡さない
- Automation: Vercel Cronをtrigger、PostgreSQL Jobを状態・lease・retry・idempotencyの正本とする
- 詳細: `docs/PHASE6_LINE_IMPLEMENTATION_PLAN.md`

## D-041: LINE Loginを既存actor認可へ収束させる

- 日付: 2026-08-22
- 状態: Proposed
- Login: LINE Login v2.1 Authorization Code Flowで`state`、`nonce`、PKCE S256を必須とする
- Identity: 検証済みLINE `sub`を`AuthIdentity(provider=LINE)`へ保存し、LINE user IDをUser直下へ重複保存しない
- New User: 未登録LINE Identityは新規UserとPERSONAL Workspaceを作成可能とする
- Linking: 既存Userへの追加はverified session中の明示連携だけ許可し、メール一致で自動統合しない
- Authorization: LINE起点sessionも共通`CurrentUserProvider`へ変換し、Workspace / Bunshin / Capability / resource scopeを維持する
- Gate: Supabase SSR sessionへ安全に収束できるか6-B前にspikeし、困難な場合はProvider共通Platform sessionの別ADRを先に承認する
- 詳細: `docs/adr/LINE_AUTH_SESSION_ADR.md`

## D-042: LINE秘密値は暗号化DB設定、親鍵は環境変数で管理する

- 日付: 2026-08-22
- 状態: Proposed
- Configuration: DEVELOPMENT、STAGING、PRODUCTIONごとに単一ACTIVE設定とversion履歴を持ち、DB一意制約で重複ACTIVEを防ぐ
- Isolation: runtime environmentとconfiguration environmentをサーバー側で照合し、Production設定をPreview、Development、Stagingから利用しない
- Encryption: Channel SecretとChannel Access TokenはAES-256-GCM等の認証付き暗号でDB保存し、`keyVersion`を保持する
- Root Key: `ENCRYPTION_KEY`はVercel Production環境変数に残し、DB、管理画面、Audit Logへ保存しない
- Display: Secret平文再取得APIを作らず、保存後は必要な権限へ末尾maskだけを表示する
- Rotation: 新versionの接続検証成功後だけatomicにACTIVEを切り替え、失敗時は旧versionを維持する
- Authorization: Secret登録・更新・無効化はSUPER_ADMIN、接続テストはSUPER_ADMIN / OPERATORに限定する
- 詳細: `docs/PHASE6_LINE_IMPLEMENTATION_PLAN.md`

## D-043: LINE URLは環境から自動生成し例外overrideを制限する

- 日付: 2026-08-22
- 状態: Proposed
- Generation: Callback、Webhook、LIFF Endpoint、Mission Deep Link Base URLを環境別アプリURLと固定pathから原則自動生成する
- Admin: 管理画面では読み取り専用とし、例外変更はSUPER_ADMIN、確認画面、理由、Audit Logを必須にする
- Validation: HTTPS、環境別host allowlist、Production host限定、DEVELOPMENT以外のlocalhost禁止をサーバー側で検証する
- Input: URL user info、任意query、fragmentを拒否し、DB保存値も利用直前に再検証する
- Redirect: Callback後の復帰先を相対pathまたはallowlistへ限定してopen redirectを拒否する
- 詳細: `docs/adr/LINE_CONFIGURATION_SECURITY_ADR.md`

## D-044: Mission Deep Link署名鍵をLINE秘密値から分離する

- 日付: 2026-08-22
- 状態: Proposed
- Separation: LINE Channel SecretとChannel Access TokenをDeep Link署名へ流用しない
- Derivation: 環境変数の親鍵からHKDF等でenvironment、purpose、keyVersion別の署名鍵を導出し、`ENCRYPTION_KEY`のraw valueを署名APIへ渡さない
- Storage: 署名親鍵を管理画面・DBへ保存しない。安全な導出が困難なら環境別専用署名鍵の別ADRを先に承認する
- State: expiry、single-use identifier、keyVersionを必須とし、使用済みstateのreplayを拒否する
- Privacy: Mission本文、個人情報、Secretをstateへ含めず、署名検証後もUser / Workspace / Bunshin / Mission ownershipを再検証する
- 詳細: `docs/adr/LINE_CONFIGURATION_SECURITY_ADR.md`

## D-045: Phase 6-Aは環境別version設定と接続成功後の明示ACTIVE切替にする

- 日付: 2026-08-22
- 状態: Proposed
- Persistence: DEVELOPMENT / STAGING / PRODUCTIONごとにversion履歴を持ち、partial unique indexでACTIVEを最大1件にする
- Secret: LINE Secretは環境・用途・keyVersionをcontextにしたHKDF導出鍵とAES-256-GCMで暗号化し、APIは平文を返さない
- URL: Callback / Webhook / LIFF / Deep Link URLはruntimeの`APP_URL`と固定pathから生成し、requestからenvironmentやURLを受け取らない
- Authorization: version作成とACTIVE切替はSUPER_ADMIN、接続テストはSUPER_ADMIN / OPERATORに限定する
- Activation: 接続成功日時がなく、または最新接続結果がerrorのversionはACTIVEにできない
- Audit: version作成、接続テスト、ACTIVE切替でactor、environment、action、reason、changed fieldsを保存し、SecretとProvider responseは保存しない
- 分離: LINE Login callback、Webhook、Push、Job、Deep Link state、LINE Marketingを実装しない

## D-046: LINE LoginはSupabase Custom OIDC Providerへ収束させる

- 日付: 2026-08-22
- 状態: Accepted for spike / Production implementation gated
- Session: LINE専用sessionを作らず、Supabase AuthのCustom Providerが発行する既存SSR sessionを利用する
- Security: PKCEを有効、nonce検証を有効、scopeは初期MVPで`openid profile`としemail一致の自動統合を避ける
- Callback: LINEへ登録するProvider CallbackはSupabase project URL由来、Application Callbackは`APP_URL`由来として分離する
- Identity: LINE subject、Supabase Auth User ID、Platform User IDを別識別子として扱う
- Linking: 既存verified sessionからの明示操作だけ許可し、メール一致で統合しない
- Gate: 環境別Custom Provider、Redirect Allowlist、manual linking有効化、DEVELOPMENT smokeの完了まで6-B本実装へ進まない

## D-047: 通知設定をLINE接続・送信から独立したBunshin単位resourceにする

- 日付: 2026-08-22
- 状態: Accepted
- Scope: `workspaceId + userId + bunshinId`で一意とし、verified actor本人の設定だけを取得・更新する
- Consent: 同意なしの有効化を拒否し、撤回時は無効化して同意日時を削除する
- Schedule: IANA timezone、`HH:mm`、日跨ぎQuiet Hours、`DAILY | WEEKDAYS`を保存する
- Pause: `pausedUntil`とReminder設定は保存・判定までとし、Job・Pushは6-E/Fへ分離する
- Isolation: Workspace MembershipとBunshin scopeをrepositoryで毎回再検証する
- 詳細: `docs/PHASE6A_SECURE_CONFIGURATION_IMPLEMENTATION_REPORT.md`

## D-048: Phase 6-E Job CoreをPostgreSQL永続化と短期leaseで構成する

- 日付: 2026-08-22
- 状態: Proposed
- Persistence: Job状態をPostgreSQLへ保存し、CronやHTTP requestのメモリへ保持しない
- Idempotency: `environment + idempotencyKey`を一意とし、同一環境の重複Job作成を防ぐ
- Claim: `FOR UPDATE SKIP LOCKED`でdue Jobを原子的にclaimし、worker ownerとlease期限を保存する
- Retry: retryable failureは指数バックオフ、非retryableまたは上限到達は`DEAD`にする
- Isolation: enqueueとclaimの両方でenvironmentを固定し、Workspace / Bunshin / requester scopeを検証する
- Payload: Jobにはresource referenceだけを保存し、Secret、生成本文、Knowledge、Provider responseを保存しない
- Separation: Cron配備、LINE送信、Mission生成、Webhook、manual retry UIは後続PRへ分離する
- 詳細: `docs/adr/POSTGRES_JOB_CORE_ADR.md`

## D-049: Mission Automation Jobは登録時と実行直前の二段階でscopeを検証する

- 日付: 2026-08-22
- 状態: Proposed
- Producer: Weekly Plan準備とDaily Mission生成をBunshin・対象日単位の決定的idempotency keyで登録する
- Runtime Gate: handler実行直前にWorkspace、Membership、Bunshin、SOCIAL Capability、ACTIVE Social Profile、APPROVED Strategyを再検証する
- Weekly Gate: Weekly Plan準備には有効なContent Pillarを最低1件必要とする
- Daily Gate: Daily Mission生成には対象日のitemを持つCONFIRMED Weekly Planを必要とする
- Revocation: 登録後に権限・Capability・Strategy・Planが無効になったJobはProviderを呼ばず、非retryable `SCOPE_NO_LONGER_ELIGIBLE`で終了する
- Handler: Job typeとhandlerをregistryで対応付け、Provider実装をJob Coreへ混ぜない
- Separation: Cron trigger、OpenAI handler接続、LINE通知、Webhookは本PRへ含めない

## D-050: Job worker HTTP境界を短時間・固定batch・fail closedで構成する

- 日付: 2026-08-22
- 状態: Proposed
- Authentication: 32文字以上の`CRON_SECRET`をBearer tokenとして要求し、SHA-256 digestをconstant-time比較する
- Environment: Job environmentは`APP_ENV`からサーバー側で固定し、queryやrequest bodyから受け取らない
- Bound: 1 request最大5件、application上限10件、最大実行時間25秒、route上限30秒とする
- State: request内へretry状態を保持せず、各Jobのclaim / lease / resultをPostgreSQLへ保存する
- Isolation: 1件のinfrastructure failureでbatch全体を中断せず、lease期限後に回収可能な状態を維持する
- Observability: Job ID、payload、秘密値をresponse / logへ出さず、状態別件数だけを記録する
- Fail Closed: Weekly / Daily concrete handlerが両方登録されるまではendpointを503とし、Jobをclaimしない
- Separation: Vercel Cron schedule、OpenAI handler、LINE deliveryは後続PRへ分離する

## D-051: Weekly Planの手動生成とJob生成を同一serviceへ収束させる

- 日付: 2026-08-22
- 状態: Proposed
- Orchestration: Capability、既存週、Content Pillar、ACTIVE Social Profile、APPROVED Strategy、Bunshin、Grant済みKnowledgeの検証と生成・保存・AI usage記録を共通serviceへ集約する
- Idempotency: 手動APIは既存週を`CONFLICT`、Job handlerは既存週を成功扱いで返し、再実行時にProviderを呼ばない
- Scope: Jobの`workspaceId`、`bunshinId`、`requestedBy`だけをactor scopeに使用し、別Workspace / Bunshin / 未Grant Knowledgeを参照しない
- Defaults: JobはBunshin単位の通知設定timezoneを優先し、未設定時は`Asia/Tokyo`、Primary SNSはACTIVE Social Profileから解決する
- Usage: Job ID由来の決定的idempotency keyで成功・失敗を記録し、Provider responseや生成本文をusage logへ保存しない
- Fail Closed: Weekly handlerを登録してもDaily handler完成まではWorker endpointを503にし、Jobをclaimしない
- Separation: Daily handler、Vercel Cron有効化、LINE送信は後続PRへ分離する

## D-052: Daily Mission生成pipelineを手動APIとJobで共有する

- 日付: 2026-08-22
- 状態: Proposed
- Pipeline: Planner、Content Generator、Quality Checker、最大1回の修復、Mission永続化、AI usage記録を共通serviceへ集約する
- Idempotency: 手動APIは既存日を`CONFLICT`、Job handlerは既存Missionを成功扱いで返し、Providerを再呼び出ししない。生成claimにはJobの決定的idempotency keyを使用する
- Runtime Gate: claim後もWorkspace、Bunshin、actor、SOCIAL Capability、ACTIVE Profile、APPROVED Strategy、CONFIRMED Weekly Plan、Grant済みKnowledgeを共通serviceで検証する
- Defaults: JobのtimezoneはBunshin単位の通知設定を優先し、未設定時は`Asia/Tokyo`、Primary SNSはACTIVE Social Profileから解決する
- Worker: Weekly / Daily handlerが揃ったため、認証済みWorkerをPostgreSQL Job executorへ接続する。環境固定、lease、retry、実行直前scope再検証を維持する
- Privacy: Job payloadへMission本文、Knowledge、Provider response、Secretを保存せず、logとusage eventにもProvider responseを保存しない
- Separation: Vercel Cron schedule有効化、LINE Push、Deep Linkは後続PRへ分離する

## D-053: Vercel Cronを毎分のScheduler / Worker triggerとして使用する

- 日付: 2026-08-22
- 状態: Proposed
- Trigger: Vercel Cronから毎分SchedulerとWorkerをGETし、処理状態・lease・retryはPostgreSQL Jobを正本とする
- Authentication: 両endpointで32文字以上の`CRON_SECRET`をBearer認証し、digestをconstant-time比較する。URL、response、logへsecretを出さない
- Environment: Job environmentは`APP_ENV`から固定し、query、header、request bodyによる上書きを禁止する。PreviewへProduction secret / DBを渡さない
- Local Time: Cron自体はUTCで起動し、各PreferenceのIANA timezone、local time、pause、quiet hours、WEEKDAYSをapplicationで評価する
- Weekly: Sundayのlocal timeに翌MondayのDRAFT Weekly Plan準備Jobを登録する。WEEKDAYSでもWeekly準備は行うが、pause / quiet hours / consentは尊重する
- Daily: 対象local dateにCONFIRMED Weekly Plan itemがある場合だけDaily Jobを登録し、未承認Planを追い越さない
- Idempotency: Workspace / Bunshin / local date由来の決定的keyを使用し、Cron重複配送やScheduler再実行でJobを重複作成しない
- Bound: 1回最大1,000件をID順で走査し、truncatedと件数だけをresponse / logへ出す。個別User / Bunshin IDは出さない
- Separation: LINE Push、Deep Link、独立Worker / Cloud Runは後続PRへ分離する

## D-054: LINE配信履歴とMission Deep Link stateをProvider送信から分離する

- 日付: 2026-08-22
- 状態: Proposed
- Delivery: 環境、Workspace、Bunshin、User、Daily Mission、用途、状態を持つ配信履歴と、attempt番号ごとの結果をPostgreSQLへ保存する
- Idempotency: `environment + idempotencyKey`および`environment + user + mission + kind`で同一通知の重複準備を防ぐ
- State: Deep Link tokenにはランダムstate ID、環境、鍵version、期限だけを含め、Mission本文、User ID、Knowledge、秘密値を含めない
- Key Separation: 環境別`ENCRYPTION_KEY`を直接HMACへ渡さず、HKDFで`line-mission-deep-link`用途・環境・version専用鍵を導出する
- Rotation: `LINE_DEEP_LINK_KEY_VERSION`を現行versionとし、検証時は現行と直前versionだけを受け付ける
- Single Use: stateは10分で期限切れとし、DBの条件付き更新で1回だけconsumedにする。競合した2回目は拒否する
- Ownership: 署名検証後もUser、Workspace Membership、Bunshin、Daily Mission、実行環境をrepositoryで再検証する
- Privacy: LINE user ID、Provider response、Token、Secret、Mission本文を配信履歴・state・logへ保存しない
- Separation: 本PRでは実際のLINE Push、Webhook、LINE Login、quota、再送UIを実装しない

## D-055: LINE送信を短期lease、Provider Port、quota Gateで保護する

- 日付: 2026-08-22
- 状態: Proposed
- Claim: 配信前に`environment + deliveryId`を条件として30秒leaseを取得し、attempt番号をatomicに増加する
- Concurrency: `PROCESSING`中の配信は別workerが取得せず、lease期限切れの場合だけ回収可能とする
- Ownership: attempt完了とpolicy停止は、同じenvironment、lease owner、attempt番号を満たすworkerだけが更新できる
- Provider: Applicationは`LineMessagingProviderPort`だけを参照し、LINE HTTP、SDK型、raw responseをCoreへ渡さない
- Message: Push本文はMission完成通知と短期Deep Linkだけに固定し、投稿本文、Prompt、Knowledgeを送信しない
- Classification: credential、rate limit、invalid recipient、timeout、provider unavailableを分類し、retry可否をapplicationへ返す
- Quota: 80%相当の設定値でwarning、90%相当でReminder停止、100%で全送信停止とし、Daily Missionを優先する
- Pause: 全体停止中はProviderと受信者解決を呼ばず、claimを理由付きでcancelする
- Secrets: Access TokenはACTIVEかつ接続確認済みの同一環境設定から実行時だけ復号し、DB履歴、attempt、response、logへ保存しない
- Separation: LINE Identity / Connectionが未実装のためRecipient ResolverはPortに留め、実ユーザーPushとJob接続は行わない

## D-056: LINE Webhookを署名済み最小eventと環境別Connectionへ収束させる

- 日付: 2026-08-22
- 状態: Proposed
- Signature: `x-line-signature`を未変更raw bodyとMessaging Channel SecretでHMAC-SHA256検証し、constant-time比較する
- Environment: ACTIVE Secret、Connection、Webhook Eventをruntime environmentへ固定し、ProductionとStagingを混在させない
- Event: `environment + webhookEventId`を一意にし、follow / unfollowを冪等適用する。raw payload、reply token、LINE user ID、Provider responseはevent履歴へ保存しない
- Identity: WebhookのLINE user IDだけでUserを新規作成せず、既存`AuthIdentity(provider=LINE)`と明示作成済みConnectionへだけ適用する
- Isolation: recipient解決時にActive User、Workspace Membership、Bunshin、環境、FOLLOWING、Connection consent、Bunshin別通知同意を再検証する
- Cancellation: unfollowまたは明示解除時は未送信・処理中・失敗中の配信を`RECIPIENT_UNAVAILABLE`として取消し、以後Providerを呼ばない
- Scope: message / postback業務処理、LINE Login本番導線、Production Webhook接続、実ユーザーPushは後続へ分離する

## D-057: Daily Mission完成通知を独立したLINE配信Jobへ接続する

- 日付: 2026-08-22
- 状態: Proposed
- Producer: Daily Mission生成が成功または既存Missionを冪等取得した後だけ、環境・User・Mission・用途で一意な`LineMessageDelivery`と`LINE_MISSION_DELIVER` Jobを登録する
- Payload: JobにはopaqueなDelivery IDだけを保存し、Mission本文、Deep Link state、LINE user ID、Access Tokenを含めない
- Isolation: 配信実行前にenvironment、Workspace、Bunshin、actor User、Membership、Missionをrepositoryで再検証し、別scopeのDeliveryを取得しない
- Execution: 配信lease取得後、同一環境のACTIVE設定、全体停止、Connection、通知同意、quotaを順に検証し、すべて通過した場合だけ短期single-use Deep Link stateを発行してProviderを呼ぶ
- Retry: rate limit、timeout、Provider障害、設定一時不在、lease競合だけを既存Jobの指数backoffへ接続し、停止・quota停止・recipient不在などの非retry結果は配信状態を正本としてJobを終了する
- Idempotency: DeliveryとJobにそれぞれ決定的な一意keyを持たせ、Daily生成Jobの再実行でも同一Missionを二重送信しない
- Production Gate: コード接続は行うが、LINE Login / Identity外部設定とProduction Smokeが完了するまで実ユーザー送信をGOとしない
- Separation: Mission Callback / click、理由付き手動再送、管理者警告、LINE Login UIは後続PRへ分離する

## D-058: LINE運用指標を環境別の非機密Read Modelとして公開する

- 日付: 2026-08-22
- 状態: Proposed
- Scope: runtime environmentで固定したConnection、Delivery、Attempt、LINE Delivery Job、ACTIVE設定だけを集計する
- Authorization: Active Platform Adminだけに許可し、非管理者にはresourceの存在を示さない
- Privacy: providerUserId、User ID、Workspace ID、Bunshin ID、Mission ID、Secret、Provider responseをAPI・HTMLへ返さない
- Bound: 失敗分類は直近500試行から上位8分類に制限し、運用画面の無制限scanを避ける
- Separation: 個別利用者検索、理由付き再送、外部警告通知、Funnel、Production Smokeは後続へ分離する

## D-059: Mission Deep Linkはverified sessionで消費してからMissionへ遷移する

- 日付: 2026-08-22
- 状態: Proposed
- Consumption: URLの短期stateを一度だけ消費し、署名だけでなくUser、Workspace、Bunshin、Mission所有権をDBで再検証する
- Activity: 消費したstate ID由来の冪等keyで`VIEWED`を記録し、tokenやLINE user IDをActivityへ保存しない
- Redirect: 遷移先はDBで検証済みのBunshin IDから固定pathを構築し、外部return URLを受け付けない
- Failure: 無効、期限切れ、再利用、別User、別環境は同じ404境界で拒否する
- Authentication return: 未ログイン時は、`/today?state=...`だけを許可する短時間のHttpOnly Cookieへ戻り先を保存する。LINE Loginおよび必要な規約同意の完了後にCookieを削除して復帰し、任意URL、外部origin、追加query、fragmentを拒否する
- Ownership: Cookieは認可情報として扱わない。復帰した`/today`で署名、single-use、環境、User／Workspace／Bunshin／Mission所有権を必ず再検証する

## D-060: 管理者再送は同一失敗attemptにつき理由付き1回へ限定する

- 日付: 2026-08-22
- 状態: Proposed
- Eligibility: `FAILED`かつ未送信・未取消で、設定一時不在、rate limit、timeout、Provider一時障害の配信だけを対象にする
- Authorization: runtime environmentに固定し、ACTIVEなSUPER_ADMIN / OPERATORだけに許可する。対象外・別環境・権限なしは存在を秘匿する
- Audit: environment、Delivery ID、失敗時attempt count、actor、3〜500文字の理由、生成Jobを専用履歴へ保存する
- Concurrency: `deliveryId + deliveryAttemptCount`をDB uniqueとし、同じ失敗回への二重クリック・並行操作をatomicに拒否する
- Ownership: 再送Jobの`requestedBy`は元の受信Userを維持し、既存のWorkspace / Bunshin / User / Mission再検証を通す。管理actorを受信者として流用しない
- Privacy: 管理API / UIにはopaqueなDelivery ID、分類、試行回数、日時だけを出し、User・Workspace・Bunshin・Mission識別子、LINE user ID、Secret、Provider responseを出さない
- Separation: LINE Login、Production実送信、外部管理者警告、Funnelは本変更へ含めない

## D-061: LINE Funnelは送信コホートと同一環境Deep Link消費で帰属させる

- 日付: 2026-08-22
- 状態: Proposed
- Cohort: 指定期間内に送信成功したLINE Deliveryを母集団とし、送信件数とユニークUser数を分ける
- Attribution: 同一runtime environmentのMission Deep Link stateを送信後に消費した場合だけOpenとし、そのOpenを通過したMissionの採用、Copy、投稿完了だけを後続段階へ帰属させる
- Period: コホートは`sentAt`が期間内のもの、後続行動は送信後かつ期間終了前のものとする
- Isolation: Environmentを全LINE resourceで固定し、別環境のstate消費を採用・Copy・投稿の入口として認めない
- Privacy: API/UIへ集計値だけを返し、User、Workspace、Bunshin、Mission、Delivery、LINE user ID、Secret、Provider responseを返さない
- Bound: 最大5,000 Deliveryを集計し、超過時は`truncated`として不完全なOpen率・通知→投稿率を表示しない
- Semantics: unfollowはLINE上の解除・ブロック相当として表示し、厳密なProvider理由だと断定しない
- Separation: Provider課金原価、外部管理者通知、Production Smoke / Go-No-Goは後続へ残す

## D-062: LINE Production Gateは非送信Readinessと集計アラートで保護する

- 日付: 2026-08-22
- 状態: Proposed
- Assessment: runtime environmentと同じ環境のACTIVE設定、接続確認、全体停止、FAILED Delivery、再試行待ち、Dead Job、失敗分類だけから運用状態を判定する
- Severity: 設定不在・未確認、Dead Job、環境不一致、credential失効、quota枯渇をCRITICALとし、それ以外の再試行・失敗・全体停止をWARNINGとして明示する
- Alert Provider: Applicationは通知Portだけを参照し、Web側の汎用Webhook Adapterから集計値だけを送る。送信先URL、認証Token、host allowlistは環境変数に置く
- SSRF: HTTPS、host完全一致allowlist、redirect禁止、URL user info・query・fragment禁止、5秒timeoutを必須とする
- Privacy: 外部通知にUser、Workspace、Bunshin、Mission、Delivery、LINE user ID、本文、Secret、Provider responseを含めない
- Environment: runtime environmentはrequest入力から受け取らずサーバー設定から導出し、Productionでは外部管理者通知未設定をNO-GOとする
- Smoke: Production gateはmain、GitHub Environment承認、明示文字列、Health Ready、CRON認証済みLINE Readinessを要求し、LINE Pushを実行しない
- Execution: コードとworkflowの成功は本番GOを意味しない。Vercel環境変数、GitHub Secret、外部Webhook疎通、LINE外部設定、人間承認後に本番workflowを実行する

## D-063: 退会完了はUser物理削除ではなく段階的停止・外部Auth削除・匿名化とする

- 日付: 2026-08-22
- 状態: Proposed / 人間レビュー待ち
- Identity: 14日猶予終了後に処理対象をclaimし、本人操作と通知を停止してからSupabase Auth Userを削除し、成功後にPlatform AuthIdentityを削除する
- User Row: 監査resourceのRestrict参照を維持するためUser行は消さず、emailをnull、displayNameを固定値、statusをDELETEDにする
- Workspace: Organizationデータは削除せずMembershipだけをREVOKEDにする。唯一OWNERとACTIVE Platform Adminは自動処理せずBLOCKEDにする
- Personal Data: LINE外部ID、Post URL、自由記述metadata、Knowledge、Memory、Mission Content等の個人情報・本文をtable別にpurgeする
- Execution: PROCESSING / BLOCKED、短期lease、attempt、versionを持つ専用実行状態で並行処理とcrash再開を安全にする
- Secrets: Supabase Service Role KeyはProduction環境変数だけに置き、DB、管理画面、Job、logへ保存しない
- Retention: request、監査、AI usage、配信attempt、backupの保持期間とlegal holdは実装前の人間確認事項とする
- Gate: `ACCOUNT_DELETION_EXECUTION_PLAN.md`承認前にMigration、Supabase Admin API、不可逆匿名化を実装しない

## D-064: 退会実行Coreは外部削除前のatomic suspensionまでを担当する

- 日付: 2026-08-22
- 状態: Proposed
- Claim: 猶予終了済みREQUESTEDまたはlease切れPROCESSINGを条件付き更新し、同一requestを一workerだけが取得する
- State: PROCESSING / BLOCKED、5分lease、attempt count、execution versionを持ち、Userごとに未完了requestは最大1件とする
- Gate: ACTIVE Platform Admin、Organization唯一OWNER、Organization内の本人所有Knowledge / BunshinをBLOCKEDとし、Userを変更しない
- Suspension: claimと同じtransactionでUser / Membership、LINE同意 / Connection、未送信Delivery / Job、未使用Deep Linkを停止する
- Privacy: request summaryはtable別更新件数だけとし、email、LINE user ID、Workspace / Bunshin / Mission識別子、本文、Provider responseを含めない
- Separation: Supabase Auth / AuthIdentity削除、DELETED化、個人データpurge、Scheduler、管理者再実行はPR B〜Dへ分離する

# D-065: Supabase Auth管理Adapterは環境一致を必須とし、実削除フローへの接続を分離する

- 日付: 2026-08-22
- 状態: 採用
- 決定:
  - Supabase Auth User削除はProvider非依存の`AuthAdministrationPort`を介し、`@bunshin/auth`のAdapterに閉じ込める。
  - `SUPABASE_AUTH_ADMIN_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_AUTH_ADMIN_ENV`はすべてサーバー環境変数とし、3値の一部設定を拒否する。
  - `SUPABASE_AUTH_ADMIN_ENV`と`APP_ENV`が一致しない場合はProviderへ通信しない。
  - 404は冪等成功、429・timeout・5xxは再試行可能、401・403は固定分類の非再試行失敗とする。
  - Secret、Provider response、provider user IDを結果・log・DBへ複製しない。
  - Adapter完成だけではProduction削除を有効化せず、PR Cの匿名化transactionとPR Dの運用Gateが揃うまで実行フローへ接続しない。

## D-066: 退会時のPersonal Data Purgeは匿名User行を残して単一transactionで完了する

- 日付: 2026-08-22
- 状態: 採用
- 決定:
  - Supabase Auth削除成功後専用のRepository境界としてpurgeを実行し、正しいrequest、User、worker lease、SUSPENDED状態を必須とする。
  - AuthIdentity、LINE Connection、LINE通知設定、Deep Link stateは削除する。
  - User行は監査参照維持のため削除せず、emailをnull、displayNameを固定値、statusをDELETEDにする。
  - Personal WorkspaceをARCHIVED化し、Bunshin、Knowledge、Memory、Strategy、Mission、Post URL、自由記述metadataを匿名化する。
  - Organization Workspaceの共有資産は変更せず、本人MembershipだけをREVOKEDにする。本人所有のOrganization Knowledge / Bunshinが見つかった場合は再検証でBLOCKEDにする。
  - purgeとrequestのCOMPLETED確定を同じDB transactionで行い、crash時に部分匿名化を残さない。
  - summaryは処理件数のみとし、削除値やProvider responseを保存しない。

## D-067: 退会Schedulerはdisabledを既定としProduction有効化に二重Gateを要求する

- 日付: 2026-08-22
- 状態: 採用
- 決定:
  - `ACCOUNT_DELETION_EXECUTION_MODE`は`disabled | dry-run | enabled`とし、既定値を`disabled`にする。
  - dry-runは件数集計だけを行い、claim、Auth削除、DB更新を行わない。
  - Productionの`enabled`には`ACCOUNT_DELETION_PRODUCTION_APPROVED=true`を追加で必須とする。
  - Cron endpointはCRON Secretで保護し、1回最大3件、1日1回とする。
  - Auth削除成功後だけpurgeへ進み、retryable Provider障害はleaseを延長し、credential・環境不一致はBLOCKEDにする。
  - BLOCKED再試行はSUPER_ADMIN限定、10〜500文字の理由必須とし、専用Auditへ遷移前後の状態を保存する。
  - logとレスポンスは集計件数・固定分類のみとし、User ID、providerUserId、email、削除本文を含めない。

## D-068: FREE利用者UIはスマートフォンの「今日やること」を正本にする

- 日付: 2026-08-23
- 状態: Proposed（デザイン方向は人間確認済み）
- Entry: 認証後は機能一覧ではなく、現在のBunshinと今日のMissionを第一導線にする。
- Navigation: FREE利用者はHome、Mission、Progress、ProfileのBottom Navigationを基本とし、管理機能と内部用語を混ぜない。
- Visual: warm ivory、deep navy、indigo、mintと2円のBUNSHINモチーフを採用し、過度に未来的なAI表現を避ける。
- Mobile: 375〜430pxを正本とし、主要操作領域44px以上、Primary Action 48px以上、Safe Area対応を必須とする。
- Architecture: UI刷新は既存Use Case、Persistence、Isolation、Provider境界を変更せず、presentationとView Modelへ閉じ込める。
- Delivery: Design Foundation、Public Auth、App Shell、Onboarding、Today / Mission、SOCIAL Settings、Admin QAへPRを分割する。

## D-069: 日常運用設定を管理画面へ集約する

- 日付: 2026-08-23
- 状態: 採用
- 決定: OpenAI APIキー、AIモデル、LINEチャネル設定、通知制御、LINEリッチメニューを環境別・版管理された管理画面から操作可能にする。
- 決定: 秘密値は暗号化して保存し、保存後は平文を再表示しない。変更者、理由、対象環境、変更項目を監査履歴へ残す。
- 決定: `DATABASE_URL`、`SESSION_SECRET`、`ENCRYPTION_KEY`、`CRON_SECRET`等の起動・復号に必要な秘密値は環境変数に残す。
- 理由: 日常運用の再配備依存を減らしながら、管理画面侵害だけで暗号化親鍵と全秘密情報が同時に失われる構造を避けるため。
- 詳細: `docs/OPERATIONS_ADMIN_CONSOLE_PLAN.md`

## D-070: SNS・投稿方法とBUNSHINの作成支援レベルを分離する

- 日付: 2026-08-23
- 状態: 採用
- Separation: 投稿先は既存`SocialPlatform`、投稿方法は既存`SocialPreferredFormat`、BUNSHINが作る範囲は新しい`ContentAssistanceLevel`として分離する。
- Levels: `IDEA_ONLY | GUIDED | READY_TO_USE`の3段階とし、画面では「企画だけ」「作り方まで」「そのまま使えるもの」のやさしい日本語を使う。
- Default: 初回の推奨は`READY_TO_USE`とするが強制せず、SocialProfileの初期値と当日Missionの選択を分ける。
- Recipe: SNS別に必要な成果物一式を投稿セットとして定義し、facePolicy、声、作業時間、外部AI利用可否、最近の形式、採用・不採用を入力として実行可能な形式を選ぶ。
- Persistence: SocialProfileへ初期値、DailyMissionへ生成時snapshotを持たせる案をPR 2前に人間確認する。別Workspace、User、Bunshin、SocialProfileの値を利用しない。
- Migration: 第1段階は既存MissionContent必須1対1aggregateと品質合格後のatomic保存を維持し、企画・作り方・完成版のView ModelとActivityを追加する。
- Cost: 企画から完成版への段階生成は、第1段階の利用率とAI原価を確認した後にPersistence、version、Quality Check、同時生成を独立再設計する。
- LINE: SNS、やさしい形式名、目安時間、短いテーマ、短期Deep Linkだけを通知候補とし、投稿本文、画像・動画の指示文、Knowledge、MemoryをPush・Job・logへ複製しない。
- Admin: 初期はSNS別ルールと支援レベル指標を読み取り専用にし、本番Promptや生成ルールの自由編集はversion、テスト、承認、rollback、Auditが揃うまで実装しない。
- Scope: 画像・動画本体生成、SNS自動投稿、LINE上だけでのMission完結、課金、Memory自動学習は含めない。
- 詳細: `docs/ADAPTIVE_CONTENT_ASSISTANCE_PLAN.md`

## D-071: トレンド調査をEvidence付き週次Researchとして開始する

- 日付: 2026-08-24
- 状態: Proposed
- Product: 「必ずバズる」と保証せず、「最新情報を調べ、利用者に合う動画企画を提案する」と表現する。
- Cadence: 初期FREE検証は週1回、SocialProfileごとに最大3候補を作り、毎日のMissionで再利用する。毎日調査は採用率・投稿率・原価確認後の有料候補とする。
- Provider: Coreは`TrendResearchPort`だけに依存し、Web Search、YouTube Data等をAdapterへ隔離する。Provider採用はspike後に別判断する。
- Evidence: 候補は出典URL、公開日時、取得日時、短い要約、有効期限、適合理由を持つ。全文、動画、画像、コメント、個人プロフィール、raw responseを保存しない。
- Isolation: 別Workspace / User / Bunshin、GrantされていないKnowledgeを利用しない。検索queryへ内部ID、個人情報、秘密値、Knowledge全文を含めない。
- Safety: SNSを無断スクレイピングせず、他者投稿をコピーせず、外部ページ内の命令をPrompt instructionとして扱わない。
- Failure: Provider障害・期限切れ時は通常Missionへ戻し、古い候補を最新として表示しない。
- Scope: SNS自動投稿、SNS OAuth、画像・動画本体生成、高度Analytics、課金、自動Memory化を含めない。
- Gate: FREE頻度、Evidence保持、高リスク領域、Provider予算、出典表示範囲を人間確認してからCore実装へ進む。
- 詳細: `docs/TREND_RESEARCH_DELIVERY_PLAN.md`、`docs/adr/TREND_RESEARCH_PROVIDER_ADR.md`

## D-072: トレンド検索Providerの採用は実測後に確定する

- 日付: 2026-08-24
- 状態: Proposed
- Contract: Coreは共通の`TrendResearchProviderPort`だけを公開し、Exa／Firecrawl固有の型と認証をWeb Adapterへ隔離する。
- Safety: Provider応答は信頼しない。HTTPS URL、短い題名、短い根拠、公開日時だけへ変換し、raw responseや本文全文を保存しない。
- Failure: 認証、回数制限、残高、通信、Provider障害、壊れた応答を固定分類する。
- Candidate: 暫定第一候補はEvidence取得に適したExa、Firecrawlはページ取得重視の比較候補とする。
- Gate: 日本語品質と費用をまだ実測していないため本番採用しない。DEVELOPMENT限定キー、費用上限、同一query比較を承認後に行い、別ADRで確定する。
- Scope: APIキー登録、外部API実行、課金契約、Job／Mission生成への接続を含めない。
- 詳細: `docs/TREND_PROVIDER_SPIKE_REPORT.md`

## D-073: 外部AI・AgentをBUNSHINの制御下にあるAdapterとして扱う

- 日付: 2026-08-24
- 状態: Proposed
- Core: BUNSHINのDomain／Applicationを正本とし、Hermes等の外部Agentは`AgentRuntimePort` Adapter候補に限定する。
- WorkOrder: 目的、許可context、許可Skill／Tool、timeout、予算、data policy、出力schemaを明示する。
- Prohibited: DB直接接続、Secret、任意HTTP／shell、LINE直接送信、SNS直接投稿、本番設定変更を許可しない。
- Validation: 実行前後にtenant／Bunshin／Grantを再検証し、Schema合格後だけatomicに保存する。
- Audit: workflow／schema／provider／model version、費用、token、遅延、成否、固定error分類を記録し、本文、思考過程、raw response、個人情報、Secretを保存しない。
- Learning: AIはMemory、設定、Prompt、Skillを直接変更せず、将来のProposalと人間承認を経由する。
- Reuse: MissionActivity、PostRecord、MissionFeedback、BunshinMemoryを正本とし、汎用Outcome／Preference tableを先に重複作成しない。
- Gate: 本文書の人間レビュー前にProvider Registry、Learning、Skill、Agent Runtime、MCPを実装しない。
- 詳細: `docs/AI_AGENT_COMPATIBILITY_REBASELINE.md`、`docs/adr/AI_AGENT_RUNTIME_BOUNDARY_ADR.md`

## D-074: Production Gateは自動確認と人間承認を分離する

- 日付: 2026-08-24
- 状態: Accepted
- Automatic: 実行環境、AI／LINE／定期処理、公開中の法務文書、Auth管理設定、退会実行モードは管理画面で自動判定する。
- Manual: Migration／Health run、backup復元、実ログイン、スマートフォンsmoke、LINE Go/No-Go、責任者承認は人間が実行・記録する。
- Fail closed: Preview／StagingをProduction Readyと表示しない。自動確認がすべて成功しても、人間確認を完了した証拠がなければ開始可能と表示しない。
- Secret: 管理画面には設定の有無と案内だけを表示し、DB URL、Service Role Key、親鍵、Cron Secretを表示・保存しない。
- Authority: 本画面は外部DashboardやGitHub Actionsを操作せず、Production利用開始の権限を自動付与しない。

## D-075: Production Gateの人間確認は対象commit別の追記型証跡として保存する

- 日付: 2026-08-24
- 状態: Accepted
- Decision: 復元訓練、Migration/Health、認証、FREE MVP実端末、退会dry-run、LINE Go/No-Go、最終承認を`ProductionGateEvidence`へ保存する。
- Scope: Productionのみを対象にし、`VERCEL_GIT_COMMIT_SHA`と一致する40桁SHAをサーバー側で固定する。別commitの証跡は引き継がない。
- Audit: 確認と取消を上書きせず`RECORDED` / `REVOKED`イベントとして追記し、実施者・日時・理由を残す。
- Authorization: 閲覧は有効なPlatform Admin、記録と取消はSUPER_ADMINだけに許可する。
- Approval: 最終承認は同じcommitで他の6項目がすべて現在有効な場合だけ記録できる。後から前提項目を取り消した場合、開始判定も即時に未完了へ戻す。
- Evidence URL: HTTPSかつGitHub、Vercel、Supabaseの許可ドメインだけを保存する。秘密情報・利用者情報は保存しない。
- Fail closed: Production環境または対象commitを確定できない場合、記録画面/APIを利用させず開始可能と判定しない。

## D-076: Platform Adminの権限変更を管理画面と追記型監査へ集約する

- 日付: 2026-08-24
- 状態: Accepted
- Operation: 登録済みユーザーへの管理権限付与、役割変更、停止、再開を管理画面から実施する。
- Authorization: 変更は有効なSUPER_ADMINだけに許可し、閲覧は有効なPlatform Adminに許可する。
- Safety: 自分自身の停止と、最後の有効なSUPER_ADMINの停止・降格を拒否する。
- Audit: 対象者、実施者、変更前後の役割・状態、理由、日時を追記型履歴へ保存する。
- Privacy: パスワード、認証Token、API Key、DB接続情報は管理画面・監査履歴へ保存しない。
- Login operation: Supabaseのメール送信上限を成功として扱わず、利用者へ待機とLINEログインを案内する。

## D-077: 日常利用する外部サービス認証情報は管理画面から版管理する

- 日付: 2026-08-24
- 状態: Accepted
- Scope: OpenAI、Grok、Exa、FirecrawlのAPIキーとLINE Channel Secret／Access Tokenを管理画面から登録し、環境別・版別に管理する。
- Secret: 平文はAES-256-GCMで暗号化して保存し、保存後は末尾マスクと登録有無だけを表示する。ログと監査履歴へ平文を残さない。
- Test: 有効化前にProviderへ最小リクエストを送り、認証、利用上限、モデル不一致、Channel不一致、通信障害を固定分類する。
- LINE: Channel Access Tokenの検証応答に`client_id`がある場合、登録したMessaging Channel IDとの一致を必須とする。
- Keep in environment: ENCRYPTION_KEY、DB接続情報、Supabase Service Role Key、CRON_SECRET、Vercel認証情報は管理画面へ移さない。
- Audit: 作成、接続確認、有効化、停止は対象環境・版・実施者・理由を既存の追記型監査履歴へ残す。

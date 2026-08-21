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
- IMAGE: 専用Activity typeが未定義のため画像制作指示を誤分類せず、今回はcaptionの`COPIED_TEXT`だけを提供する
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

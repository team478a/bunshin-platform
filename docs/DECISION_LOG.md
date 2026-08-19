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

## D-029: Mission結果はFeedbackとPostRecordをMission状態と原子的に記録する

- 日付: 2026-08-19
- 状態: Proposed
- 提案: Slice 3.5を3.5-A Core Persistenceと3.5-B authenticated API/UIへ分け、先にMissionFeedback、PostRecord、manual metricsの保存境界を確立する
- Feedback: `workspaceId + bunshinId + dailyMissionId + userId`で1件とし、LATERからYES/NOへ変更できる最新状態としてupsertする
- Post Record: 通常Missionは1投稿を表すため`workspaceId + bunshinId + dailyMissionId`で1件とし、重複投稿履歴を作らない
- 原子性: posted YESはMission COMPLETED、Feedback YES、PostRecordを同一transactionで記録し、posted NOはMission SKIPPEDとFeedback NOを同一transactionで記録する。LATERはMission状態を変更しない
- Metrics: manualMetricsはviews / likes / comments / shares / savesの非負整数だけをstrict JSONで保持し、自動取得値やProvider responseを混在させない
- Capability: Assignment停止中もreadを許可し、mutationだけを拒否する
- 禁止: SNS API投稿、自動metrics取得、AI、LINE、Job、Provider、BLOGを提供しない
- 理由: Missionの完了状態、本人評価、実投稿記録が部分成功で矛盾することを防ぎ、Phase 4の投稿完了UIが安全に接続できる永続化境界を先に固定するため
- 詳細: `docs/PHASE3_SLICE_3_5_IMPLEMENTATION_INSTRUCTION.md`

## 未決事項

後続Phaseで決める項目:

- 既存ブログ版から移植する具体的module
- APIの本番実行環境
- 認証とLINE Providerの詳細
- Scheduler/Queue方式
- Phase 9における既存DBの具体的な移行手順
- Supabase RLSの採用可否

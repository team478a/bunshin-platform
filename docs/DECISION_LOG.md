# BUNSHIN Platform Decision Log

重要な設計判断を時系列で記録します。詳細な検討が必要な場合は `docs/adr/` に個別ADRを作成し、ここからリンクしてください。

## D-087: 外部成果計測URLは参加者帰属の直接URLとして決定的に挿入する

- 日付: 2026-08-25
- 状態: Proposed
- Responsibility: ワタシ企画室は専用URLの登録、選択、挿入、使用Snapshotだけを担当し、クリック、成約、報酬、顧客、不正判定を持たない。
- Ownership: URLはGroup／Group Membership／Product Pack／Campaignの組合せへ属し、Bunshinや人格を成果帰属単位にしない。
- Selection: Campaign＋Member、Product＋Member、Member、Campaign、Product、Groupの順で決定し、同順位重複はfail closedとする。
- Navigation: MVPでは独自短縮URLやredirectを発行せず、Allowlistで検証した外部完全URLを投稿本文へ直接挿入する。
- Snapshot: URL変更後も過去Missionで使用した完全URLを追跡できるよう、Missionと同一transactionで利用Snapshotを固定する。監査ログには完全queryを残さない。
- Generation: AIへURL選択・変更を任せず、品質・広告安全検査後の決定的Post Processorで差し込む。
- Status: Core実装前に`docs/EXTERNAL_TRACKING_LINK_REBASELINE.md`の人間レビュー事項を確定する。

## D-086: トレンド調査は設定確認と本番実行証跡の両方を開始条件にする

- 日付: 2026-08-25
- 状態: Accepted
- Automatic: ProductionでGrok、Exa、FirecrawlのいずれかがACTIVE、非停止、接続確認済みであることを管理画面から自動確認する。
- Manual: 実際の本番データで週次調査を1回実行し、Evidence、Candidate、期限、Mission採用、設定原価を人が確認して対象commitへ証跡を残す。
- Approval: `TREND_RESEARCH_SMOKE`が記録されていなければ最終承認を保存できない。別commitへ確認結果を暗黙継承しない。
- Failure: Provider未設定・停止・接続未確認を開始前に表示する。調査障害時に通常Missionを止めない既存フォールバックは維持する。
- Boundary: グループ発信の1社先行テストは人格学習G7の開始条件であり、一般FREE検証の開始判定へ混ぜない。
- 詳細: `docs/PRODUCTION_VALIDATION_DASHBOARD_REPORT.md`

## D-085: トレンド調査は週次冪等Jobと管理予算で実行する

- 日付: 2026-08-25
- 状態: Accepted
- Schedule: 毎週月曜00:00 UTCに、ACTIVE SOCIAL、ACTIVE SocialProfile、APPROVED Strategyを持つBunshinだけを列挙し、Workspace・Bunshin・SocialProfile・週を含む一意キーでJobを登録する。
- Revalidation: Job実行直前にWorkspace Membership、Bunshin所有権、SOCIAL Assignment、SocialProfile、Strategyを再検証し、撤回済みscopeではProviderを呼ばない。
- Provider: 管理画面で接続確認・有効化されたGrok、Exa、Firecrawlの設定だけを使い、Coreは共通Portに依存する。APIキー未登録・停止・予算到達時は調査を行わず、通常Mission生成を継続する。
- Cost: Provider設定に「調査1回の原価」を持たせ、実行ごとにAI Usageへ記録する。0または不明は未計測として管理画面に明示し、推測値を実費として表示しない。
- Expiry: Research Run、Evidence、Candidateはscope内で期限切れへ遷移し、期限切れ情報をMission入力へ渡さない。
- Failure: 認証、quota、rate limit、network、invalid responseを分類し、retry可否をJobへ反映する。失敗内容に検索結果本文やAPIキーを残さない。
- Scope: SNS自動投稿、成果保証、無断スクレイピング、画像・動画本体生成は含めない。
- 詳細: `docs/TREND_RESEARCH_OPERATIONS_REPORT.md`

## D-084: グループ類似検査は本文共有ではなく非可逆署名と集計で行う

- 日付: 2026-08-25
- 状態: Accepted
- Signature: Mission ContentをNFKC正規化し、SHA-256 fingerprintと文字3-gram由来の64-bit SimHashを生成する。本文、Prompt、Knowledge、Memory、他参加者の識別情報は類似検査記録へ保存しない。
- Gate: Campaign Missionは保存前に同じCampaignの合格済み署名と比較する。閾値以上は`POSSIBLE_DUPLICATE`として本文なしの監査記録を残し、Missionを保存しない。
- Limit: Campaignの参加人数上限に加え、1参加者あたりの生成上限をサーバー側で検査する。上限到達時は生成を停止する。
- Isolation: 比較対象は本人が参加中で、Group同意、公開商品版、対象Bunshin Assignmentが有効な同一Campaignだけとする。別Campaign、別企業から横断検索しない。
- Admin privacy: 企業管理画面には生成、採用、コピー、投稿完了、GOOD評価、重複停止の件数と率だけを表示し、投稿案本文や参加者別行動を表示しない。
- Pilot: 1社・1商品・10〜22人・30〜60日を推奨条件として画面に表示する。実利用者を自動参加させず、結果を成功と自動判定しない。
- Scope: SNS自動投稿、報酬、ランキング、課金、自動人格学習は含めない。
- 詳細: `docs/GROUP_SAFETY_VALIDATION_REPORT.md`

## D-083: Campaign投稿は決定的な比率制御と送信直前の参加再検証を必須とする

- 日付: 2026-08-25
- 状態: Accepted
- Classification: Weekly Plan ItemとDaily Missionを`ORGANIC`、`PRODUCT_RELATED`、`ADVERTISEMENT`へ分類し、Campaignなしは`ORGANIC`だけ、Campaignありは商品関連分類だけを許可する。
- Planning: Campaignごとに週間の商品関連上限、広告上限、クールダウン日数を持ち、AIの指示だけに頼らずApplication層とDB境界で検証する。
- Context: 本人が明示参加し、Group在籍同意、公開済みProduct Pack Version、対象Bunshinへの有効Assignmentがすべて揃うCampaignだけを生成Contextへ渡す。公式事実、ルール、Campaign指定素材をVersion固定して利用する。
- Safety Gate: Campaign Missionは永続化前に広告分類、公式事実、必須表示、Evidenceを決定的に検査し、不合格なら保存しない。合格Missionだけに追記型Advertising Safety Reviewを残す。
- Revocation: Weekly Plan保存時、Daily Mission保存時、LINE通知取得時に参加条件を再検証する。参加撤回、Group退出、Assignment解除、Campaign終了後は新規生成と通知を停止する。
- Delivery: Webには分類を明示する。LINEへはCampaign名と分類の安全な要約だけを送り、Mission本文、商品パック全文、個人情報は含めずWeb確認へ誘導する。
- Scope: SNS自動投稿、グループ類似検査、自動人格学習、報酬、ランキング、課金はG5へ含めない。
- 詳細: `docs/GROUP_CAMPAIGN_PLANNING_REPORT.md`

## D-082: Campaignは企業所有、Participationは本人の明示判断として分離する

- 日付: 2026-08-25
- 状態: Accepted
- 決定: CampaignはOrganization Workspace、Group、公開済みProduct Pack Versionへ固定し、素材はそのVersionの公式素材だけを参照する
- 決定: Campaignは対象説明、テーマ、募集期間、参加上限を持ち、`DRAFT -> OPEN -> CLOSED | CANCELLED`だけを許可する
- 決定: 参加者本人だけがPersonal Workspace内の本人所有Bunshinを指定し、参加・保留・辞退・参加取消を選択できる。管理者の代理参加は許可しない
- 決定: 参加時にACTIVE Group Membership、参加同意、Bunshin所有権、Product Pack Assignment、募集期間を再検証する
- 決定: 参加上限はCampaign単位のDB advisory lock内で判定し、すべての状態変更をCampaign Activityへ保存する
- 境界: Campaignは一斉配信、自動投稿、報酬、ランキング、Weekly Plan比率を実行しない。これらはG4へ含めない

## D-081: 広告安全性を構造化入力による決定的Gateとして記録する

- 日付: 2026-08-25
- 状態: Accepted
- 決定: 本人の利用経験・結果・資格は本人WorkspaceとBunshin所有の`UserEvidence`へ保存し、Trend EvidenceやOrganization所有Product Packへ複製しない
- 決定: 投稿を`ORGANIC | PRODUCT_RELATED | ADVERTISEMENT`へ明示分類し、本人事実を使う場合はACTIVE Evidenceを必須にする
- 決定: 広告には`#PR`、Product Packの必須表記、禁止表現、条件付き表記、公式事実の完全一致をAIより前に決定的に検査する
- 決定: 判定不能・不一致・根拠不足は`BLOCKED`とし、文章本文は監査DBへ保存せずSHA-256 hash、使用resource ID、issue codeだけを保存する
- 決定: Daily Missionへの自動Gate接続は、G5で投稿分類と商品投稿計画が生成入力へ加わる時点で実装する。G3-Aで分類を推測しない
- 境界: 本部は商品関連の判定結果を閲覧できるが、個人Evidence本文、投稿本文、通常投稿は閲覧しない

## D-062: グループ発信を独立した安全境界として段階実装する

- 日付: 2026-08-25
- 状態: Accepted
- 決定: Workspace MembershipとGroup Membershipを分離し、Product Packより前にGroup、招待、同意、退出、Isolationを完成させる
- 決定: 企業公式情報と本人の人格・Memory・Evidenceを分離する
- 決定: Campaign参加、投稿採用、最終投稿は本人の任意判断とし、初期版では自動投稿しない
- 決定: 本人EvidenceとTrend Evidenceを別resourceとして扱う
- 決定: 広告・PR判定は生成前の決定的処理とし、判定不能時は投稿可能にしない
- 決定: 人格学習は1社先行テスト後に進める

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

## D-078: ユーザー停止と問い合わせ対応を管理画面へ集約する

- 日付: 2026-08-25
- 状態: Accepted
- User status: 利用停止・再開はSUPER_ADMINだけに許可し、理由と変更前後の状態を追記型監査へ保存する。
- Protection: 退会済みユーザー、同じ状態、有効なPlatform Adminはユーザー管理画面から変更しない。管理者権限は専用画面で先に管理する。
- Notification: 利用停止時はLINE通知を無効化する。再開時は本人の同意なく通知を再開しない。
- Authentication: 停止中ユーザーの既存Supabase sessionを有効ユーザーとして解決せず、同じ外部Identityから新規Userを重複作成しない。
- Support: 問い合わせは対象ユーザー、件名、優先度、状態、担当管理者、追記型メモを分離保存する。
- Authorization: 問い合わせ作成・更新はSUPER_ADMIN、OPERATOR、SUPPORTに許可し、READ_ONLYは閲覧だけとする。
- Privacy: 対応メモへパスワード、API Key、Token、投稿本文などの秘密情報を保存しない。メモの編集・削除機能は作らず、訂正も追記する。

## D-079: 運用通知は現在状態から再計算し原因解消で自動解除する

- 日付: 2026-08-25
- 状態: Accepted
- Scope: AI接続・予算・失敗、LINE設定・配信、定期処理、退会処理、問い合わせを管理画面の通知センターへ集約する。
- Source: 通知専用tableを初期実装では作らず、正本となる設定・Usage・Job・Delivery・Support・Deletionの現在状態から表示時に再計算する。
- Severity: サービス停止・予算到達・自動復旧不能をCRITICAL、停止や80％予算・緊急問い合わせをWARNING、自動再試行や通常問い合わせをINFOとする。
- Resolution: 既読操作で隠さず、原因が解消されたときだけ次回集計から消す。
- Authorization: 有効なPlatform Adminだけが閲覧でき、通知から既存の権限保護された対応画面へ移動する。
- Privacy: API Key、Token、投稿本文、ユーザーの秘密情報を通知へ含めない。

## D-080: 人格・個人Memoryと公式商品パックを分離し生成Contextでのみ統合する

- 日付: 2026-08-25
- 状態: Proposed
- Ownership: 人格、Memory、個人Knowledgeは本人Workspace／Bunshinに残し、Product PackはOrganization Workspaceが所有する。
- Consent: Product Packの利用にはUserの明示参加と対象Bunshinへの明示割当を必須とし、本部側から参加者のMemory、Knowledge、投稿全文を参照しない。
- Version: AssignmentはPackを参照し、生成時に最新PUBLISHED Versionを解決する。実際に使用したVersionはGeneration Snapshotへ固定する。
- Precedence: 商品名、価格、仕様、禁止表現などの公式事実はProduct Pack Versionを優先し、個人体験は本人Knowledge／Memoryとして分離する。
- Context: Provider非依存のGeneration Context Builderでscope、Grant、Participation、Assignmentを再検証し、秘密値、raw response、思考過程を保存しない。
- Learning: 行動データから人格やMemoryを直接変更せず、Learning Proposalと本人承認を経由して新VersionまたはMemoryを作る。
- Gate: 所有権、Version解決、個人体験境界、Snapshot保持期間、初期対象業種・法域の人間レビュー前にコード、Prisma Schema、Migrationへ進まない。
- 詳細: `docs/PERSONALITY_LEARNING_PRODUCT_PACK_REBASELINE.md`、`docs/adr/GENERATION_CONTEXT_PRODUCT_PACK_BOUNDARY_ADR.md`

## D-081: 専用URLはAI生成後にサーバーで差し込み、利用時点を固定保存する

- 日付: 2026-08-26
- 状態: Accepted
- Selection: URLはGroup Membership単位で、Campaign＋参加者からGroup共通までの固定優先順位によりサーバーが選ぶ。AIには選択・変更させない。
- Post process: 品質検査後、商品版・SNS・投稿形式に対応するPlacement Templateを使い、TEXT本文または投稿captionへ決定的に1回だけ差し込む。
- Missing link: 商品投稿は専用URLがなければ停止する。公開済み`ProductPackVersion.allowLinklessPosts=true`の場合だけURLなしを許可する。
- Atomic: Mission、Mission Content、Generation Contextと`ContentLinkUsage`を同じDB transactionで保存する。保存直前に所有権・有効期間・選択順位・URL・Placement版を再検証する。
- Snapshot: 使用URL、Link名、有効期限、商品版、Campaign、参加者、Placement版を固定し、設定変更後も過去履歴を書き換えない。
- Isolation: 他Workspace、他Group、他参加者、未参加Campaign、未割当商品版のURLは選択・保存しない。

## D-082: 専用URLはコピー直前に再検証しLINEへ完全URLを送らない

- 日付: 2026-08-26
- 状態: Accepted
- User view: 本人画面には、使用した商品・企画・専用URL・生成時点の期限を平易な日本語で表示する。
- Copy gate: コピー直前にサーバー側で現在の所属、同意、URL状態、有効期間、適用優先順位、Snapshot一致を再検証する。
- Stale content: URLが停止・期限切れ・差し替え・優先順位変更された場合は、古い投稿案のコピーを拒否し、再生成を案内する。
- Organic: URLを使用しない通常投稿も同じ認可APIを通すが、外部URL検証なしでコピーを許可する。
- LINE: LINE通知には完全な専用URL、紹介Token、投稿本文を含めず、「専用URLを設定済み」という安全な要約と署名付き確認画面への導線だけを含める。

## D-083: 専用URLの日常運用を管理画面へ集約する

- 日付: 2026-08-26
- 状態: Accepted
- Operations: 外部サービス、許可ドメイン、共通URL、開始・停止、期限状態、設定漏れ、使用履歴、変更履歴を同じ管理画面で確認する。
- Coverage: Groupの有効参加者ごとに、外部ID設定と現在有効な参加者専用URL件数を集計し、未設定を明示する。
- History: 使用履歴にはMission本文、Memory、Knowledge、Feedbackを含めず、参加者表示名、商品、企画、URL Snapshot、日時だけを表示する。
- Export: URL一覧と使用履歴は、認可を再検証したサーバーからUTF-8 CSVとして出力する。完全URLは権限を持つ管理者の明示操作時だけ出力する。
- Import: CSV部分取込は行別検証・冪等性・部分成功を伴うためL6-Bへ分離し、単純なブラウザー一括POSTでは代替しない。

## D-084: 専用URLCSVは行単位で検証し下書きへ部分取込する

- 日付: 2026-08-26
- 状態: Accepted
- Limit: 1ファイル5MB・データ1,000行を上限とし、未知の見出し、壊れた引用符、不正なUTF-8はファイル全体を拒否する。
- Partial success: 参加者、商品、企画、期間、許可ドメイン、重複を行ごとに検証し、正常行だけを保存する。失敗行は行番号と安全な理由を返す。
- Safety: 取込結果は必ず`DRAFT`とし、管理者が確認後に個別に有効化する。CSV原文をDB、ログ、監査履歴へ保存しない。
- Identity: 参加者はGroup Membership IDまたは完全一致したメールで解決し、同意済みの有効参加者だけを外部Identityへ紐付ける。
- Catalog: 商品・企画は同じWorkspace／GroupのIDまたは完全一致名で解決し、曖昧な行や商品と企画を同時指定した行を拒否する。
- Idempotency: 外部Link ID、または参加者・商品・企画・URLの組み合わせが既存または同一CSV内で重複する場合は再登録しない。

## D-085: 外部成果URLの実利用開始を専用Production Gateで保護する

- 日付: 2026-08-26
- 状態: Accepted
- Gate: 最新mainの本番環境で、テスト参加者・商品・専用URLを使ったスマートフォンE2EとIsolation確認を必須にする。
- Evidence: 対象commit別に`EXTERNAL_TRACKING_SMOKE`を追記型記録し、この確認を含む全項目が揃うまで`FINAL_APPROVAL`を保存しない。
- Revalidation: URL停止後の古い投稿案拒否、新URLでの再生成、過去Snapshot不変を同じ実査で確認する。
- Privacy: 証跡には完全URL、紹介Token、メール、投稿本文、顧客・報酬情報を保存しない。
- Scope: Gateは外部URLを使う商品投稿の開始条件であり、クリック・成果・報酬計測をBUNSHINへ追加する許可ではない。

## D-086: Server Componentの認証確認ではCookie書込制限を画面障害にしない

- 日付: 2026-08-26
- 状態: Accepted
- Incident: Supabase session更新時の`setAll`がServer ComponentのCookie書込制限に触れ、ログイン済み画面が500になった。
- Boundary: Cookieを更新可能なRoute Handlerでは従来どおり保存し、読み取り専用Server Componentでは書込制限だけを無視して当該requestの認証確認を継続する。
- Failure: Supabaseの`getUser`失敗や未認証を成功扱いにはせず、既存どおり未認証として処理する。
- Test: 書込可能Contextでの保存と、書込禁止Contextで例外を画面まで伝播させないことを自動テストする。

## D-087: SNS画像生成は特定Group限定のProductionパイロットとして検証する

- 日付: 2026-08-26
- 状態: Proposed
- Scope: Daily Missionの`IMAGE`投稿からInstagram 4:5の文字入り完成画像を生成するが、FREE一般ユーザーへ公開しない。
- Gate: ProductionでPlatform Adminが明示許可したGroup、同意済みACTIVE Membership、本人Bunshin、許可中Campaign / Product Packだけを対象とする。
- Architecture: 人物・背景はProvider Port / Adapterで生成し、日本語文字・図形は管理されたSatori / resvg / Sharpテンプレートで決定的に合成する。AI生成HTMLと任意外部URL取得を禁止する。
- Ownership: 本人参考素材、人格、Memory、Knowledgeは本人所有のままとし、Group公式素材と混在させない。Group管理者へ通常投稿、Prompt、個人画像、完成画像を集計権限だけで開示しない。
- Cost: User / Workspace / Group単位の上限、実原価、再試行、採否を分離記録し、緊急停止を必須とする。1採用20円は固定仕様ではなく実測指標とする。
- Validation: 10テーマで接続・費用・安全性を先に確認し、その後50テーマ比較とスマートフォンE2Eを行う。越境、秘密漏えい、二重課金、重大な広告安全違反で即時停止する。
- Environment: Stagingは新設せず、本番限定公開と対象commit別の追記型Production Gateで保護する。
- General release: Phase 10の一般向け画像・動画Providerは前倒しせず、GroupパイロットのGo基準達成後も別途人間判断する。
- Detail: `docs/GROUP_SNS_IMAGE_GENERATION_REBASELINE.md`

## D-088: グループ役割と拡張可能な機能利用権限を分離する

- 日付: 2026-08-26
- 状態: Accepted
- Separation: システム管理者・グループ管理者などの管理役割と、SNS・ブログなどを利用できる機能権限を別resourceとして管理する。既存Bunshin Capabilityは人格単位の第3 Gateとして維持する。
- Catalog: 機能は固定Enumや機能ごとのDB列ではなく、`SOCIAL.IMAGE_GENERATION`や`BLOG.ARTICLE_GENERATION`のような安定した階層Keyで登録する。Provider名や画面名をKeyにしない。
- Delegation: Platform AdminがGroupへ利用可能な機能と上限を設定し、Group Managerはその範囲内だけを自Groupの有効な参加者へ割り当てる。上位権限を超える再委譲を拒否する。
- Default: 未登録・停止・期限外は拒否する。親機能を停止した場合は、その配下の全機能を停止する。階層は将来の多段追加に対応する。
- Limits: Group上限と参加者上限の小さい方を有効上限とし、日次・月次の利用量判定は各機能の実行Use Case側で共通Gateを通して行う。
- Isolation: Workspace、Group、Membershipをサーバー側で照合し、他Groupや無効参加者への割当・参照を拒否する。変更理由と変更前後をAudit Logへ保存する。
- Extension: BLOGや将来機能はFeature Definitionの追加で拡張し、認可ロジックや既存テーブルの列追加を不要にする。API、Job、LINE導線も同じ判定結果を使用する。

## D-089: グループ機能の実行Gateと利用量を共通化する

- 日付: 2026-08-26
- 状態: Accepted
- Enforcement: Group Campaignを使うDaily Mission生成では、参加者・Group・Workspaceを照合し、必要な親機能と子機能の設定、期間、日次・月次上限を生成開始時にサーバー側で検証する。
- Accounting: 利用量はMembership・機能Key・操作Keyの組み合わせで一意に記録する。同じ操作の再試行は二重計上せず、異なる同時操作が上限を越えないよう直列化可能なDB transactionで判定と記録を行う。
- Semantics: AIや外部Providerの失敗による無制限な再試行と原価超過を防ぐため、利用権を受理した実行試行を利用回数とする。成果物の成功・採用・投稿は既存のActivityや生成記録で別に扱う。
- Time: 日次・月次の基準日は実行Use Caseが確定した利用者向け日付を保存し、後からサーバー地域設定で集計結果が変わらないようにする。
- Visibility: Platform AdminとGroup Managerの画面には今日・今月の利用回数を表示し、Platform Admin画面では停止、開始前、期限切れ、上限到達を明示する。
- Extension: BLOG、LINE、画像生成などの実処理はProviderや高コスト処理の直前で同じconsume Gateを呼び、機能固有の認可・上限実装を重複させない。

## D-090: 外部サービス名を「ワタシワークス」とする

- 日付: 2026-08-27
- 状態: Accepted
- Brand: ユーザーへ表示するサービス名、ロゴ、ブラウザアイコン、管理通知の送信名を「ワタシワークス」へ統一する。
- Domain language: `Bunshin`はユーザーが作成するAI分身を表すDomain用語として維持する。サービス名とAI分身の名称を混同しない。
- Compatibility: Repository名、DB table・column、API path、型名、環境変数、監査Event名などの技術識別子は変更しない。既存データと外部連携の互換性を守る。
- Assets: 提供された横長ロゴを画面Headerへ、正方形アイコンをWeb metadataへ使用する。個人の分身画像や生成画像には流用しない。

## D-091: 活動継続機能は既存Mission Activityを正本とし行動段階を分離する

- 日付: 2026-08-27
- 状態: Accepted
- Brand: 添付仕様の「ワタシ企画室」はユーザー向け表示で「ワタシワークス」へ読み替える。技術識別子はD-090に従い変更しない。
- Reuse: `DailyMission`、`MissionContent`、`MissionDecision`、`MissionActivity`、`PostRecord`、`MissionFeedback`、`LineNotificationPreference`と既存LINE配信基盤を正本とする。同義の`daily_contents`、汎用`activity_events`、`post_reports`、別の通知設定テーブルを作らない。
- Semantics: 通知から正常表示したVIEWED、本人が押した確認、採用判断、Clipboard成功、PostRecord作成、投稿後Feedback、今日は休むを別の行動として記録する。
- Progress: 週間・累積進捗はappend-only Raw ActivityとPostRecordから再構築できるRead Modelとし、集計値だけを唯一の正本にしない。
- Identity: 日次判定で`workspaceId`、`userId`、`bunshinId`、`dailyMissionId`を再検証し、Group Campaignでは`groupId`と`membershipId`も照合する。`userId + localDate`だけの一意制約にしない。
- Time: UTC保存とし、判定に使ったlocal date、timezone、週開始日を固定する。初期値は`Asia/Tokyo`と月曜日開始の候補とする。
- Motivation: 「今日は休む」で減点せず、過去実績、ステップ、バッジを失わせない。順位、他者比較、換金可能ポイントをMVPに入れない。
- KPI: 週に3回の確認は利用継続指標とし、最重要KPIは「7日間に3回以上実際に投稿したユーザー率」とする。
- Extension: 発信ステップとバッジはSOCIAL専用列に固定せず、BLOG、Group Campaign、画像生成等の安定した機能Keyを将来関連付けられる境界にする。
- Privacy: Activity metadataへ投稿本文、画像指示文、Memory、Knowledge、LINE user ID、Tokenを保存しない。Group Managerには許可された集計だけを返す。
- Gate: `docs/ACTIVITY_CONTINUITY_REBASELINE.md`の人間レビュー完了前にActivity Enum、Progress、Badge、休眠Job、UI、Prisma Schema、Migrationを実装しない。

## D-092: 発信ステップは派生値、達成バッジだけを版付きSnapshotとして保存する

- 日付: 2026-08-27
- 状態: Accepted
- Step: 発信ステップは累積活動日から都度計算し、保存値にはしない。休止しても過去実績とステップを下げない。
- Badge: 条件を満たしたバッジは`Workspace + User + Bunshin + Feature Key + Badge Key + Rule Version`で一度だけ保存する。表示名と説明は付与時Snapshotを保持し、ルール変更で過去表示を書き換えない。
- Rules: 初版はコード管理のRule Version 1とし、J4の管理設定を先回りしない。Feature Keyは将来のBLOG等へ拡張可能な文字列境界とする。

## 2026-08-27 — Activity Continuity運用集計の除外と監査

- 本番KPIから社内確認・自動テスト利用者を除外できるようにする。ただしUserへ上書き可能な真偽値を置かず、環境ごとの`EXCLUDED` / `INCLUDED`操作を追記型履歴として保存する。
- 除外・復帰はSUPER_ADMINのみが行い、5文字以上の理由を必須とする。Productionの除外はDevelopment / Stagingへ波及させない。
- 除外中の利用者は全体KPI、継続率、期間内投稿、AI利用、LINE接続数、Group別活動から除く。管理対象から消えないようユーザー一覧・詳細には表示する。
- Group別集計は参加中のMember数、期間内に活動した人数、確認回数、投稿回数だけを表示し、投稿本文・Memory・個人のMission内容は管理者へ開示しない。
- Rule Version 1の固定値を運用画面から変更する機能は、既存実績の再解釈を防ぐ版管理・有効化設計とともにJ4-B2の別PRで実装する。
- Dormancy: 休眠はMission Activityから派生した最終活動日と基準日との差で判定する。初版は7日で、独立した休眠状態テーブルや減点を作らない。
- Delivery: Webの復帰表示までをJ3-Aとする。LINE復帰通知は同意、Quiet Hours、Quota、全体停止、重複送信防止を既存配信基盤へ接続するJ3-Bとして分離する。

## D-093: LINE復帰通知は既存Daily Mission配信の低優先種別として扱う

- 日付: 2026-08-27
- 状態: Accepted
- Reuse: 新しい通知テーブルや別Workerを作らず、既存`LineMessageDelivery`の`REMINDER`種別、Mission Deep Link、配信Job、試行履歴を再利用する。
- Eligibility: 7日以上活動がなく、本人が通知とリマインダーへ同意し、直近7日に復帰通知がない場合だけ`REMINDER`へ切り替える。通常のDaily Mission生成・Web利用は止めない。
- Recheck: Job予約時の判定だけを信用せず、LINE Provider呼出し直前に現在の同意、通知有効化、一時停止、曜日、Quiet Hours、Workspace・User・Bunshin状態を再検証する。不明・欠損時は送信しない。
- Priority: `REMINDER`は低優先通知とし、月間使用率が停止基準へ達した場合はDaily Missionより先に停止する。全体停止と上限到達は既存配信Policyに従う。
- Privacy: 復帰メッセージに活動履歴、Memory、Knowledge、投稿本文を含めず、短期署名付きMission Deep Linkだけを送る。

## D-094: 活動継続の最重要KPIは登録後7日間のPostRecordで算出する

- KPI: 登録後7日間の観測を完了した利用者を分母とし、その期間内に`PostRecord`を3件以上記録した利用者を達成者とする。
- Boundary: `MissionActivity`の確認、採用、コピー、休みは行動支援指標として保持するが、実投稿KPIの分子へ混ぜない。
- Time: 各利用者の登録日時から連続7日間を判定し、管理画面で選んだ集計期間の終了時点まで観測が完了した利用者だけを対象とする。
- Export: 投稿本文、URL、Knowledge、Memoryを含めず、集計値だけを既存の管理CSVへ追加する。

## D-095: 活動継続ルールは環境別の不変版として有効化する

- 日付: 2026-08-27
- 状態: Accepted
- Version: 週間目標、休眠日数、Step境界、Badge条件は`DEVELOPMENT` / `STAGING` / `PRODUCTION`ごとに追記型の版として保存する。使用中の版は環境ごと1件にDB制約で限定する。
- Activation: SUPER_ADMINだけが作成理由付きの下書きを作成し、別の使用開始理由を記録して有効化できる。過去の版は書き換えず`SUPERSEDED`とする。
- Runtime: Webの進捗・復帰表示とLINE配信Jobは同じ使用中ルールを解決する。DBに有効版がない初回Migration直後は組み込み第1版へ安全にフォールバックする。
- History: 取得済みバッジは付与時の`ruleVersion`、表示名、説明のSnapshotを保持し、新版で過去の実績を再解釈しない。

## D-096: 動画機能はグループ限定のProvider非依存コアから実装する

- 日付: 2026-08-27
- 状態: Accepted
- Scope: 初期動画機能は一般利用者へ公開せず、System Adminが許可したGroupとGroup Managerが割り当てたMemberだけが使用できる。Phase V-1の利用者検証は外部チームが担当する。
- Composition: 標準動画は静止画、字幕、音声、BGM、文字の動きを基本とし、AI動画そのものを標準へ含めない。AI動画は別機能・別原価として扱う。
- Provider: Bunshin Coreから外部レンダリング会社を直接呼ばず、Render Provider Portと交換可能なAdapterを後続PRで実装する。初期段階で自前FFmpeg Workerは運用しない。

- Identity: Video ProjectはWorkspace、Group、Group Membership、Owner User、Bunshinを保持し、作成・取得・更新のすべてで同一境界を再検証する。
- Disclosure: 台本、音声、画像、動画、素材選択のどこにAIを使ったかをProject・Scene単位で記録し、利用者へ表示した説明をSnapshotで保持する。
- Accounting: 将来の利用回数は外部Renderが成功した場合だけ計上する。Draft、失敗、再試行、取消を完成本数へ含めない。課金・決済は今回実装しない。

## D-097: 動画企画AIへ渡す情報を許可済みContextへ限定する

- 日付: 2026-08-27
- 状態: Accepted
- Ownership: Providerを呼ぶ前に`Workspace + Group + Owner User + Bunshin + Video Project`を照合し、範囲外のProjectは存在を明かさず拒否する。
- Context: AIへ渡す情報は`VideoPlanningContextRepository`が返した本人の目的・対象者・話し方、参加承諾済みCampaign、割当済み公開商品、必須表記・禁止表現、有効な承認済み素材だけとする。個人Memory、未許可Knowledge、別参加者の情報は渡さない。
- Provider: Application層は`VideoPlanGeneratorPort`だけに依存し、OpenAI固有のResponses APIとJSON SchemaはWeb側Adapterへ置く。APIキーは既存の環境別管理設定から実行時に解決し、生成Contextや永続データへ混ぜない。
- Validation: Providerの構造化出力を信用せず、保存前にVideo Coreが場面数、連番、合計時間、素材種別、AI利用種別を決定的に検証する。標準動画ではAI動画を拒否する。
- Atomicity: Provider失敗または検証失敗ではSceneを保存しない。Revision競合も既存の楽観的更新で拒否する。
- Deferred: 実行APIへ接続するPRでPrompt Version、Model、Token、Latency、費用を本文や秘密情報なしでAI利用記録へ保存する。Render利用回数とは分離する。

## D-098: 動画素材は権利確認済みの非公開Storage Keyで管理する

- 日付: 2026-08-27
- 状態: Accepted
- Ownership: 利用者素材は`Workspace + Group + Group Membership + Owner User`で分離し、任意で本人所有Video Projectへ限定する。参加同意、Group動画機能、Member割当が無効なら登録しない。
- Storage: DBへ公開URLや署名URLを保存せず、推測不能な`storageKey`だけを保存する。短時間Upload URLの発行と実体検査は交換可能なStorage Portへ分離する。
- Verification: ファイル名・拡張子・申告MIMEを信用しない。完了時にProvider AdapterがMIME、マジックバイト相当の署名、容量、寸法、再生時間を調査し、Core制限を通過した場合だけ`READY`へ変更する。
- Rights: 本人の利用権確認をUpload開始条件とし、確認日時と任意の利用条件を保存する。確認のない素材、未完了、検査失敗、停止・期限切れ素材を動画企画へ渡さない。
- Reuse: 本部承認素材は既存`ProductPackAsset`と`CampaignAsset`を正本とし、Video Assetへ複製しない。企画時は本人素材を最優先し、次にCampaign承認素材を利用する。
- Failure: 署名Upload発行失敗と実体検査失敗は`REJECTED`と安全な理由コードを記録する。APIキー、署名URL、ファイル内容をログや監査metadataへ保存しない。
- Deferred: Supabase等のStorage Adapter、Upload API/UI、マルウェア検査、ライフサイクル削除は後続PRで実装する。

## D-099: 動画素材はPrivate Storageへ直接アップロードし、完了後にサーバー検査する

- 日付: 2026-08-27
- 状態: Accepted
- Upload: 大容量動画をアプリサーバー経由で転送せず、2時間以内の署名付きURLで利用者端末からSupabase Private Storageへ直接送信する。
- Secret: Service Role Keyはサーバー内だけで利用し、ブラウザへ返さない。DB、API応答、ログにも保存しない。
- Inspection: 完了要求時に実バイトのシグネチャ、容量、画像寸法、動画時間を検査し、合格した素材だけを`READY`にする。
- Isolation: `VIDEO_GENERATION`のGroup PolicyとMember Assignmentが両方有効な本人だけが、本人の素材を登録・一覧表示できる。
- Exposure: DBにはStorage Keyだけを保持するが、一覧APIと本人画面へStorage Keyや署名付き閲覧URLを返さない。
- UX: 権利確認、容量・時間上限、送信・検査・保存結果を専門用語を避けた日本語で表示する。
- Deferred: マルウェア検査、孤児オブジェクト削除、素材の削除UIは後続PRで実装する。

## D-100: 動画企画のAI実行は本人確認後のRenderと分離する

- 日付: 2026-08-27
- 状態: Accepted
- Entry: 動画作成入口は`VIDEO_GENERATION`がGroupとMemberの両方で有効な参加者だけに表示し、APIでも同じ権限、参加同意、所有境界を再検証する。
- Context: AI企画は本人所有Bunshin、本人素材、参加承諾済みCampaignと割当済み商品だけを使う。別Group・別Userの情報を渡さない。
- Runtime: OpenAIは既存の環境別管理設定から解決し、成功・失敗のPrompt Version、Model、Token、LatencyをAI利用履歴へ保存する。本文と秘密値は保存しない。
- Concurrency: Revision不一致はProvider呼出し前に拒否し、古い画面からの重複生成でAI原価を発生させない。
- UX: 本人は生成された場面、秒数、話す言葉、画面文字、素材種別を確認する。標準動画ではAI動画本体を生成しないことを明示する。
- Boundary: 企画・台本生成とRenderを分離する。外部Render、完成本数計上、課金、自動投稿は後続Phaseとする。

## D-101: Render受付は本人が承認したRevisionごとに一度だけ行う

- 日付: 2026-08-27
- 状態: Accepted
- Approval: `WAITING_APPROVAL`で場面が存在し、本人が確認したRevisionと一致する台本だけを`APPROVED`へ進める。Group、Member、参加同意、所有境界は承認時にも再検証する。
- Idempotency: Render受付は`videoProjectId + projectRevision`をDBで一意にし、同じ承認版の二重受付と二重原価を防ぐ。
- Provider: Application層は`VideoRenderProviderPort`だけに依存する。外部Job IDとProvider名は保持できるが、APIキーやProvider応答本文を保存しない。
- Output: 完成物は将来Private Storageへ取り込み、DBには非公開Storage Keyだけを保存する。Providerの一時URLを正本にしない。
- Accounting: `QUEUED`、`SUBMITTED`、`RENDERING`、失敗、取消は完成本数へ含めない。`SUCCEEDED`の確定処理は非同期Job実装時に追加する。
- Safety: Provider未選定のV-5Aでは承認までに留め、外部サービスへ自動送信しない。

## D-102: 初期の標準動画Render AdapterはCreatomateを採用する

- Decision: 初期ProviderはCreatomateとし、Application層の`VideoRenderProviderPort`をWeb側Adapterで実装する。承認済みSceneからRenderScriptを生成し、Provider上のテンプレートを事業データの正本にしない。
- Boundary: 本Adapterは標準動画だけを対象とし、AI動画Sceneを拒否する。Provider固有status、error、URLはAdapter内で検証・正規化し、CoreへProvider SDK型を持ち込まない。
- Privacy: Provider metadataには内部Render IDだけを送り、User、Workspace、Group、Bunshin、台本本文、APIキーを含めない。
- Output: Creatomate上の完成物は最大30日の一時成果物として扱う。後続JobでHTTPSと許可hostを検証してPrivate Storageへ移し、永続履歴にはStorage Keyだけを保存する。
- Operations: 実送信は環境別の暗号化設定、接続確認、Job、Webhook照合が完成するまで有効化しない。自前FFmpeg Worker、課金、SNS自動投稿は引き続き対象外とする。

## D-103: Render Providerの秘密情報は既存の環境別外部サービス設定で管理する

- Storage: Creatomate APIキーは管理画面から登録し、環境別HKDFで用途分離したAES-256-GCM暗号文だけをDBへ保存する。平文は画面、API応答、監査ログへ返さない。
- Lifecycle: 設定は追記型の版として保存し、接続確認済みの版だけを使用中へ切り替える。同じ環境・ProviderのACTIVEはDB制約で最大1件にする。
- Verification: 接続確認はテンプレート一覧APIへの読み取り専用要求とし、RenderやCredit消費を発生させない。
- Environment: 実行環境と設定環境の一致をサーバーで検証し、Production設定をPreviewやStagingから利用しない。
- Boundary: 管理設定の有効化だけでは動画を送信しない。非同期Jobと完成物保存が完成するまでRender実行経路は閉じたままにする。

## D-104: Renderは非同期Jobで実行し、完成物だけをPrivate Storageへ取り込む

- Queue: 本人が承認済みRevisionを明示操作した場合だけRenderとJobを冪等に受付する。API request中に外部Renderの完了を待たない。
- Polling: JobはProvider status APIを正として進捗を確認し、処理中は指数Backoffで再試行する。再試行上限到達時は内部RenderとProjectを失敗状態へ揃える。
- Download: Provider URLはHTTPSかつCreatomate CDNだけを許可し、Redirect、URL認証情報、fragmentを拒否する。MP4 signatureと100MB上限を検査してから非公開Storageへ保存する。
- Access: 完成URLをDBへ保存せずStorage Keyだけを保持する。本人sessionとWorkspace／Group／Project所有権を再確認した5分間の署名URLからだけ閲覧する。
- Boundary: Webhook照合、利用回数確定、課金、SNS自動投稿、AI動画生成は後続とする。

## D-105: Render Webhookは署名付きの起動合図として扱い、Provider APIで再照合する

- Signal: CreatomateのWebhook本文に含まれる状態やURLを直接保存・利用しない。Webhookは再照合処理を起動する合図だけに使う。
- Authentication: `ENCRYPTION_KEY`から環境・用途・Versionを分離したHKDF鍵でWorkspace、Render、有効期限を署名する。鍵Versionは現行と直前だけを許可する。
- Correlation: 署名内のRender ID、Provider metadata、DBへ保存済みの外部Render IDがすべて一致した場合だけ処理する。外部ID保存前の通知からProviderへ再送信しない。
- Verification: 最終状態と完成URLは環境別APIキーを使ってCreatomate status APIから取得し直す。完成物Host・形式・容量検査とPrivate Storage保存は既存経路を再利用する。
- Resilience: Webhook再送は冪等に処理し、Webhook欠落時のためPolling Jobも残す。Provider応答本文、APIキー、完成URLをログ・DB・監査情報へ残さない。
- Deferred: 管理者向けRender監視と手動再実行、成功本数の確定、LINE完成通知はV-5B3B/Cで実装する。

## D-106: Renderの手動再実行は失敗発生単位で一度だけ許可する

- 日付: 2026-08-27
- 状態: Accepted
- Visibility: 管理画面には現在環境のRenderだけを表示し、台本本文、外部完成URL、APIキー、Provider応答を表示しない。
- Authorization: 閲覧はシステム管理者、再実行は`SUPER_ADMIN`または`OPERATOR`に限定する。再実行時もWorkspace、Group、User、Membership、動画機能権限を再検証する。
- Retry Policy: Rate Limit、Timeout、通信・Provider一時障害等の安全な分類だけを対象とし、理由入力を必須とする。設定不正や認証失敗は再実行せず、先に設定を直す。
- Idempotency: `videoRenderId + failedAtSnapshot`をDBで一意にし、同じ失敗に対する二重要求を拒否する。再度失敗して失敗時刻が変わった場合だけ、新しい運用判断として再実行できる。
- Provider Safety: 外部Job IDが存在するRenderは状態確認から再開し、新しい外部Renderを送信しない。外部Job IDがない場合だけ送信待ちへ戻す。
- Audit: 要求者、環境、理由、Render、Job、日時を追記型履歴へ保存する。秘密値やProvider応答は保存しない。
- Deferred: 完成本数の確定とLINE完成通知はV-5B3Cで実装する。

## D-107: 動画利用回数はPrivate Storage保存後に一度だけ確定する

- 日付: 2026-08-27
- 状態: Accepted
- Accounting: Renderが`SUCCEEDED`で非公開Storage Keyを持つ場合だけ、既存Group機能利用履歴へ完成1本を記録する。処理待ち、外部送信済み、作成中、失敗、取消は数えない。
- Idempotency: `VIDEO_GENERATION + video-render-completed:{renderId}`を参加者単位で一意にし、Polling、Webhook、Job再試行による二重計上を防止する。
- Notification: 動画完成通知はDaily Mission通知と責務を分け、VideoRenderに状態、試行回数、安全なエラー分類、送信日時を保持する。通知本文やLINE user IDは保存しない。
- Consent: 本人のLINE接続と通知許可、現在環境の有効設定を再確認する。通知停止や未接続でも完成動画と利用回数は維持し、通知だけを中止する。
- Retry: 一時的なLINE障害ではRenderを再生成せず通知だけを再試行し、送信済み通知を再送しない。
- Boundary: 課金・決済、一般公開、SNS自動投稿は実装しない。

## D-108: SNS別AI開示設定は環境別の版管理Policyとする

- 日付: 2026-08-27
- 状態: 採用
- 判断: AI開示文、ハッシュタグ候補、投稿時の案内、出力メタデータ候補を、SNS・実行環境ごとの追記型Policyとして保存する。
- 理由: SNS規約変更のたびにコード変更と再配備を必要にせず、どの動画にどの版を案内したかをSnapshotで再現可能にするため。
- 制約: 環境とSNSごとのACTIVEは最大1件。別環境・別SNSへフォールバックしない。自由な秘密値、認証情報、利用者情報を出力メタデータへ保存しない。
- 境界: 管理画面、動画へのSnapshot接続、利用者向け案内はV-5C2で扱う。MP4への実埋め込みは外部Providerの対応確認後にV-5C3で扱い、対応前に「埋め込み済み」とは表示しない。

## 2026-08-28: 動画AI利用表示ルールの運用接続

- 最高管理者が配備環境・SNS別に確認待ちの版を保存し、理由を入力して使用開始する。別環境・別SNSの設定へはフォールバックしない。
- 動画作成時に使用中の版を解決し、Policy ID、版番号、表示文、ハッシュタグ、確認案内、出力Metadata候補を動画へSnapshot保存する。後から管理設定が変わっても過去動画の案内は変えない。
- 使用中の設定がないSNSでは動画作成を停止し、誤った表示ルールのまま生成しない。
- 利用者画面には専門用語や内部Metadataを出さず、「投稿するときの大切な確認」として説明文、推奨表示、確認案内だけを日本語で表示する。

## 2026-08-28: 動画機能の本番準備チェック

- 動画運用画面で、外部動画生成サービスの使用中・接続確認・全体停止状態と、3つのSNSのAI利用表示ルールを一括確認する。
- 不足項目は件数と対応先を表示し、正常項目も「準備完了」と明示する。APIキーや投稿本文は表示しない。
- Creatomateの`metadata`はRender追跡用であり、完成MP4内部への埋め込みとは扱わない。出力ファイルへの実埋め込みはProvider対応または安全な後処理方式を確認するまで保留する。

## 2026-08-28: 完成MP4へのMetadata埋め込みを現行動画Phaseから除外する

- 判断: V-5C3の完成MP4へのMetadata埋め込みは、現行のGroup Video Generationへ実装しない。Phase VはV-5C2Bまでをもってコード実装完了とする。
- 理由: SNSへのUpload後にMetadataが保持される保証がなく、AI利用表示の主要手段として信頼できない。後処理Worker、互換性検証、再保存、障害監視を追加する費用に対し、現在のGroup限定検証で得られる効果が小さい。
- 代替: SNS別のAI開示Policy、動画作成時のSnapshot、本人確認画面の表示文・ハッシュタグ・投稿時案内を正本として維持する。内部では生成履歴、Provider、Policy版、完成物のPrivate Storage Key、利用回数を既存DBへ保存する。
- Safety: Metadataがないことを理由にAI利用表示を省略しない。利用者が確認できる画面と投稿時の案内を優先し、秘密情報、個人情報、Prompt本文を完成ファイルへ入れない。
- Revisit: 法令、SNS仕様、取引先要件、C2PA等の標準対応により必要性が生じた場合だけ、既存Render Provider Portと分離した後処理として別Phaseで再設計する。
- Operations: Phase V-1の利用者検証は外部チームが担当する。現在の実装範囲ではCreatomate接続、SNS別AI表示Policy、Webhook、Private Storage、完成通知、管理監視の準備状況を管理画面から確認する。

## 2026-08-28: グループ限定SNS画像生成CoreはProduction限定かつfail-closedとする

- Scope: 一般ユーザー向け画像生成を前倒しせず、`SOCIAL.IMAGE_GENERATION`をGroupと参加者の両方に明示許可したProductionパイロットだけを対象にする。
- Authorization: Request作成前と将来のJob実行直前に、Workspace、Group、Membership、同意、Bunshin、Daily Mission、Campaign、商品、安全Gate、利用上限を専用Portで再検証する。許可理由が一つでも欠ける場合は生成しない。
- State: Requestは`DRAFT -> QUEUED -> GENERATING_ASSET -> COMPOSING -> READY_FOR_REVIEW`の一方向とし、失敗・中止から暗黙に再開しない。再生成は新しいRequestとして追記する。
- Idempotency: 内部idempotency keyとrevisionを必須にし、同一Missionの二重処理と古い画面からの状態更新をDB実装で拒否できる契約にする。
- Provider: Application層はProvider非依存Portだけを公開し、OpenAI固有modelをDomain enumへ入れない。1080×1350pxの出力契約を固定し、APIキー、raw response、Promptを永続Recordへ含めない。
- Privacy: Group管理者向け集計から画像、投稿本文、個人Memory、Knowledge、自由記述Feedbackを除外する。所有Requestの取得はWorkspace、Group、Actorの全境界一致をRepository契約に要求する。
- Delivery: 本変更はDomain・Port・Policyのみとし、Prisma SchemaとMigrationは次のI2-B専用PRでレビューする。Provider実呼び出し、Storage、UI、LINEは含めない。

## 2026-08-28: グループ画像生成の永続化は複合外部キーと部分一意制約で保護する

- Pilot: Groupごとに版を追記し、`ACTIVE`は部分一意indexで最大1件とする。参加者は同意日時を持つEnrollmentへ明示登録し、停止・失効・緊急停止中はRepositoryもfail-closedにする。
- Isolation: Request作成・取得・状態更新はWorkspace、Group、Membership、Owner、Bunshin、Mission、Enrollmentを同時に照合する。Campaign、商品版、生成Contextも指定時は同じ所有範囲を再検証する。
- Concurrency: `workspaceId + groupId + ownerUserId + idempotencyKey`を一意にし、別Groupの同じkeyを混同しない。同一Missionの処理中Requestは部分一意indexで1件に限定する。状態更新はstatusとrevisionを含む条件付き更新にする。
- Media: 元素材、完成画像、サムネイルは公開URLではなくStorage Keyだけを保持する。同一Missionで`ADOPTED`は部分一意indexにより最大1件とする。
- Privacy: API Key、Provider raw response、Prompt全文、署名URL、Base64画像を本テーブルへ保存しない。画像内容と個人MemoryをGroup管理集計へ公開しない。
- Rollback: 本番適用前にbackupを取得する。障害時は先にGroup機能権限とPilot緊急停止で新規作成を止め、code rollbackする。テーブル削除が必要な場合だけデータ退避後に別のforward-fix migrationを作成し、適用済みmigrationは編集しない。

## 2026-08-28: SNS画像は5種類の管理テンプレートだけで構成する

- Layout: `1080 × 1350px`のCanvas、72px以上のセーフエリア、画像・見出し・本文・CTA領域をテンプレートVersion 1として固定する。
- Templates: `PERSON_HEADLINE`、`PROBLEM_CHECKLIST`、`THREE_POINTS`、`EMPATHY_QUOTE`、`CTA`の5種類だけを初期対象にする。
- Validation: テンプレートごとに行数、1行の最大文字数、通常・最小フォントサイズを固定する。改行、制御文字、双方向テキスト上書き文字、規定を超える文章は拒否し、極端な文字縮小で通さない。
- Boundary: AIや利用者から任意HTML、CSS、SVG、座標を受け取らない。Application層が作るComposition Planだけを後続レンダラーへ渡す。
- Font: 日本語標準フォント候補をOFL-1.1のNoto Sans JPとする。描画PRで必要weightとライセンス本文を同梱し、OSフォントや実行時の外部配信へ依存しない。
- Delivery: 本変更はSchema、検証、仕様、テストまでとする。Satori / resvg / Sharp描画、外部AI、Storage、API/UI、LINE導線は後続PRへ分離する。

## 2026-08-28: SNS画像描画は固定フォントとBuffer入力だけで決定的に行う

- Boundary: 描画Adapterは検証済み`SocialImageLayout`と画像Bufferだけを受け取る。任意HTML、CSS、SVG、外部URLを受け取らず、ネットワーク取得も行わない。
- Pipeline: Satoriで管理React treeをSVG化し、resvgで1080×1350pxのPNGへ変換し、Sharpで再出力と324×405pxのサムネイル生成を行う。
- Font: Noto Sans CJK JPの静的Regular / Bold OTFをOFL-1.1本文とともに固定同梱する。OSフォントと実行時配信へ依存せず、resvgのsystem font読込を停止する。
- Asset Safety: JPEG、PNG、WebPだけを許可し、15MB、1辺8192pxを上限とする。画像不要テンプレートへの素材混入と、画像必須テンプレートの素材欠落を拒否する。
- Determinism: 同じLayout、素材、フォント、依存Versionでは同一byte列を生成する。完成PNGのSHA-256を内容Hashとし、元画像のMetadataは完成物へ引き継がない。
- Delivery: 本PRは描画Adapterとテストまでとする。外部画像Provider、Job、利用量記録、非公開Storage、API/UI、LINE導線は含めない。

## 2026-08-28: SNS画像は所有範囲から導出したPrivate Storage Keyだけで保存する

- Bucket: 元素材、完成画像、サムネイルは`social-image-media`非公開bucketへ保存し、公開URLを発行・永続化しない。
- Object Key: Workspace、Group、Owner、Request、Mediaのサーバー生成UUIDから階層を構成する。利用者入力のpathやfilenameを受け取らず、越境とpath traversalを拒否する。
- Validation: 元素材はPNG／JPEG／WebPかつ20MB以下、完成物とサムネイルはPNGかつ15MB以下とし、magic byteとSharpによる実体検査を行う。完成物は1080×1350px以外を拒否する。
- Access: Application層で現在のRequest所有権とGroup利用権限を再確認した後だけ、対象Keyから5分間の署名URLを発行する。署名URLとbinaryはDB、通常log、監査logへ保存しない。
- Failure: 連続保存の途中で失敗した場合は、その試行で保存済みのobjectを直ちに削除する。明示削除も同じ所有権境界を通し、保持期限に基づく非同期削除JobはI4以降へ分離する。
- Delivery: I3-CはStorage Port、Supabase Adapter、所有権Use Case、MIME／寸法／分離テストまでとする。Provider、Job、Usage、API/UI、LINEは含めない。

## 2026-08-28: SNS画像の元素材生成はOpenAI Images APIへ同期Adapterとして接続する

- Credential: 管理画面で暗号化保存・接続確認・有効化した既存OpenAI設定からAPIキーだけを実行時解決する。画像modelとqualityはGroup画像Pilot版を正本とし、文章生成model設定へ混在させない。
- API: Job WorkerからImages APIを1回呼び出し、PNGのBase64応答を最大30MBで復号する。Provider URL、raw response、APIキー、Base64、Prompt全文を永続化・通常log・監査logへ出さない。
- Dimensions: 最終Canvasは1080×1350pxだが、Provider元素材は対応する縦長1024×1536pxで生成し、既存の管理Rendererでcrop・合成・固定寸法化する。
- Safety: `moderation=auto`を明示し、認証・利用制限・安全拒否・不正要求・Provider障害・不正応答を安全な分類へ変換する。安全拒否と不正要求は自動再試行せず、429と5xx／通信障害だけを再試行候補にする。
- Response: PNG magic byte、Base64長、復号後容量を検査する。Providerの申告MIMEや拡張子を信用しない。
- Delivery: I4-AはProvider Port、OpenAI Adapter、契約テストまでとする。Job、Usage、Pilot上限、緊急停止、API/UI、LINEはI4-B以降へ分離する。

## 2026-08-28: SNS画像生成は共通Jobと二重の実行直前Gateで保護する

- Async: Provider呼出しは`SOCIAL_IMAGE_GENERATE` Jobだけが行い、通常のHTTP応答中には実行しない。Job参照には内部Request IDだけを置き、Prompt、画像、APIキーを含めない。
- Recheck: Jobが課金処理へ進む直前に、Group・同意済みMembership・Group機能権限・参加者機能権限・Bunshin SOCIAL Capability・Campaign・Pilot期間・緊急停止を再確認する。開始後に権限が失効した場合はfail-closedとする。
- Limits: 共通`GroupFeatureEntitlementService.consumeAccess`を冪等なRequest IDで消費し、Pilotの日次・月次・参加者別月間上限も成功済みRequestから再計算する。OpenAI管理設定の日次・月次予算判定もProvider解決時に適用する。
- Usage: Provider呼出しの試行ごとに`AiUsageEvent`を記録し、文章生成と区別できる`SOCIAL_IMAGE_GENERATION`を使用する。Provider生レスポンス、Prompt、画像、APIキーはUsageやJobへ保存しない。
- Failure: 一時的な利用制限とProvider障害だけを再試行し、認証・安全性拒否・設定・権限・上限・緊急停止は自動再試行しない。最終失敗時だけRequestを`FAILED`へ移す。
- Completion: 元素材、文字合成済み画像、サムネイルをPrivate Storageへ保存し、DBのMedia作成と`READY_FOR_REVIEW`化が失敗した場合は保存objectを削除する。
- Boundary: Requestを作成してJobへ積む利用者API、進行表示、採否、再生成、download、LINE導線はI5で実装する。

## 2026-08-28: SNS画像生成APIは本人操作と内部Request IDだけを公開する

- Start: 生成開始は同一Origin、認証済み本人、Production、Groupと参加者の明示許可、同意、Bunshin SOCIAL Capability、Mission形式、Campaign参加、Pilot期間、緊急停止、成功上限をサーバー側で再確認する。
- Idempotency: 利用者の操作KeyでRequest作成を冪等化する。Requestが`DRAFT`なら`QUEUED`へ進め、Job登録に失敗しても同じ操作を再送すれば既存`QUEUED` Requestへ同じJobを冪等登録できる。
- Status: 進捗APIは本人所有のRequestについて、安全な状態、管理済みLayout、版、一般化した失敗code、完成Mediaの有無だけを返す。Provider Prompt、APIキー、Storage key、署名URL、原価を返さない。
- Download: 完成画像取得はWorkspace・Group・Owner・Request・Mediaを再確認した後、Private Storageの短期署名URLへ一時転送する。永続公開URLを作らない。
- Boundary: 採否、再生成、スマートフォン画面、LINE導線はI5-Bへ分離する。

## 2026-08-28 — グループ画像の本人確認UIと採否をI5-B1として実装

- Decision: 画像生成はグループ参加者本人がWeb画面の「画像を作る」を押した場合だけ開始する。
- UX: 画像・スライド形式の投稿案を選び、生成中は自動更新し、完成後に「この画像を使う」「今回は使わない」「別の画像を作る」「画像を保存する」を表示する。
- Persistence: 既存の `SocialImageGeneratedMedia.status` を利用し、同じMissionで採用中の画像は最大1件に保つ。Missionの採否とは混同しない。
- Isolation: Workspace、Group、参加者、User、Request、Mediaの所有範囲をサーバー側で再検証する。画面上のIDだけを信用しない。
- LINE boundary: LINE通知は後続I5-B2で確認画面へのリンクだけを提供し、通知の受信やリンク表示だけでは画像生成を開始しない。

## 2026-08-28 — LINEから画像確認画面への導線をI5-B2として実装

- Decision: IMAGE / SLIDE形式のMissionは、一回限りの署名付きstateを消費し、本人・Mission・グループ機能・Pilot参加を再検証した場合だけグループ画像確認画面へ移動する。
- No side effect: LINE通知の送信、受信、リンク表示、確認画面への移動では画像生成Requestを作らない。本人がWeb画面の「画像を作る」を押した場合だけ生成を開始する。
- Fallback: 対象グループまたはPilot利用資格が確認できない場合は、従来どおり本人の「今日やること」へ移動する。
- Privacy: 遷移後URLへ署名付きstateを引き継がず、Mission IDだけを初期選択用に使用する。画像画面でも所有権を改めて検証する。

## 2026-08-28: 販売プラン対応を独立したPhase 7-Kとして再基準化する

- 状態: K0文書完了、人間レビュー待ち
- Scope: 初期販売モデルは個人、パートナー、Group Bundleとする。Group専用LINE、Reseller、Private OEMはP0の実運用後に個別判断する。
- Separation: 販売プラン名だけで分岐せず、Tenant、Group、Contract Version、Seat、Entitlement Source、Credit Pool、Incentive Ledger、Product、Price、Order、Paymentを分離する。`lineMode`、`billingMode`、`paymentOwner`、`priceOwner`、`apiCostOwner`も独立して保持する。
- Accounting: 座席、Credit、インセンティブ、決済はTransaction、冪等Key、一意制約、追記型Ledgerで保護し、残高や確定状態を直接上書きしない。
- LINE: P0はワタシワークス共通LINEを使用する。専用LINEが不正な場合に共通LINEへ黙ってfallbackしない。専用LINEはTenant・環境単位で分離する後続Phaseとする。
- Isolation: Workspace、Tenant、Group、Membership、Userの全境界をサーバー側で検証し、Group退会時はGroup由来の権利だけを失効させる。個人購入資産と個人データをGroup管理者へ開示しない。
- Scope Change: 現行ロードマップではFREE検証前の課金、決済、高度な紹介報酬を対象外としているため、本対応は既存Phaseの残作業ではなく新しいスコープである。K0承認前にSchema、Migration、決済Providerを実装しない。
- Pending: FREE範囲、Partner価格・座席、インセンティブ条件、契約成立時点、Bundle価格・Credit、技術的失敗、Group／Reseller境界、専用LINE価格、Reseller卸条件、複数Group所属規則をD-01〜D-10として確定する。
- Source: `docs/SALES_PLAN_REBASELINE.md`

## 2026-08-28: テストグループだけ専用公式LINEを先行利用する

- 状態: 採用、Core Persistence実装中
- Scope: 一般提供やOEMを開始せず、システム管理者が明示許可したテストグループだけを対象にする。
- Routing: Group・Environmentごとに`SHARED | DEDICATED | DISABLED`を明示する。`DEDICATED`はpilot許可を必須とする。
- Fail Closed: `DEDICATED`設定の不足、停止、接続未確認、環境不一致、Membership失効時は送信しない。ワタシワークス共通LINEへ黙ってfallbackしない。
- Configuration: Group専用Channelは追記型version、環境・GroupごとのACTIVE最大1件、暗号化Secret、接続確認、全体停止、Quota、key version、Auditを持つ。URLは保存せず配備URLから生成する。
- Identity: LINE user IDをChannel間で同一と仮定しない。WebhookとLoginは対象Configurationを安全に識別した後も署名、User、Workspace、Group、Membership、Environmentを再検証する。
- Authorization: pilot許可、方式変更、使用開始、全体停止はSUPER_ADMIN。OPERATORは下書き登録と接続確認まで。Group Managerは状態確認のみとする。
- Source: `docs/GROUP_DEDICATED_LINE_PILOT.md`

## 2026-08-28: Group専用LINEは設定VersionとIdentityをGroup単位で固定する

- Delivery: `DEDICATED`配信はGroup、Environment、ACTIVE Configuration、接続確認、全体停止、Membership、同意を実行直前に再検証する。作成時の`groupId`とConfiguration Versionを配信へSnapshotし、途中で別Channelへ切り替えない。
- No Fallback: 専用設定の不足、停止、失効、接続エラー時は送信を停止する。共通LINEへ黙ってFallbackしない。
- Webhook: Groupごとのサーバー生成Routing Keyで設定を解決し、対象ConfigurationのMessaging Secretで署名検証する。Environment不一致、非ACTIVE、未確認設定は利用しない。
- Identity: Provider user IDはGroup専用Configuration単位のConnectionへ保存する。共通LINE、別Group、別ConfigurationのIDを同一と仮定しない。
- Privacy: Secret、Token、署名値、Provider生レスポンス、LINE user IDを通常logやAuditへ保存しない。管理画面ではSecretの登録有無と末尾Maskだけを表示する。
- Authorization: Routing変更、設定Version登録、有効化はSUPER_ADMIN、接続確認はSUPER_ADMIN／OPERATOR、Group管理者は状態確認だけとする。
- Scope: 一般提供、OEM、課金、Group管理者によるSecret登録は含めず、明示許可されたテストGroupだけに限定する。
- Source: `docs/GROUP_DEDICATED_LINE_ADMIN_REPORT.md`

## 2026-08-29: ワタシポイントは既存行動から派生する別台帳として設計する

- Status: Phase P-0文書作成済み、人間レビュー待ち。
- Source of Truth: 行動の正本は既存`MissionActivity`、`MissionDecision`、`PostRecord`とし、ポイント用に投稿本文や行動を複製しない。
- Separation: WPは本人の継続行動を促す換金不能・譲渡不能の特典、販売プランのCreditは画像・動画等の原価と利用権を管理する単位とし、残高、台帳、APIを共用しない。
- Ledger: 付与、利用、取消、返却、失効、回収は追記型Transactionで記録し、残高を直接上書きしない。冪等Key、一意制約、消費元Linkにより再送と同時処理を保護する。
- Attribution: Transactionへ付与元、費用負担者、Workspace、Group、Campaign、Rule Versionを固定し、別企業限定特典への誤使用を防ぐ。
- Recovery: 訂正はREVERSAL、技術的失敗はREFUND、使用済み付与の回収はRECOVERYとする。負残高を作らず、回収不能時は交換だけを停止する。
- Availability: ポイントProcessor、台帳、交換が停止しても企画閲覧、コピー、投稿完了を継続できる疎結合構成とする。
- Privacy: Group管理者へ個人の通常投稿、人格、Knowledge、Memoryを公開せず、別Workspace、別Group、別Userを全Use Caseで拒否する。
- Scope: 現金、購入、換金、譲渡、外部ポイント、紹介報酬、物品、抽選、ランキング、動画生成交換をMVPへ含めない。
- Stop: 企業別費用負担、Workspace／Group契約境界、失効・退会規約、企業特典責任、実原価、限定検証対象の承認前にSchema、Migration、API、Job、画面を実装しない。
- Source: `docs/POINT_FEATURE_IMPLEMENTATION_PLAN.md`

## 2026-08-29: ワタシポイントCoreは追記型Transactionと条件付き残高更新で保護する

- Account: `workspaceId + userId`で口座を一意にし、ACTIVE Workspace Membership本人だけが操作できる。
- Idempotency: Transactionは`accountId + idempotencyKey`、処理Eventは`workspaceId + eventType + sourceEventId`で一意にする。同じKeyへ異なる操作内容を送った場合は拒否する。
- Concurrency: 消費時は`availablePoints >= amount`かつ`recoveryDue = 0`を条件に残高を更新し、Serializable TransactionとDB CHECKで負残高を防ぐ。
- Attribution: Group／Campaign指定時は対象Workspaceとの一致を確認し、消費元を期限の近い付与から`PointConsumptionLink`へ固定する。
- Refund: 元の消費TransactionをWorkspace・本人範囲で再検証し、過剰返却と二重返却を拒否する。
- Boundary: P-1では既存Activity Processor、API/UI、交換、失効Job、Group Rule管理を実装しない。
- Source: `docs/POINT_CORE_PERSISTENCE_REPORT.md`

## 2026-08-29: ポイント行動連携は既存VIEWEDとPostRecordを非同期処理する

- Source: 企画確認は`MissionActivity.VIEWED`、投稿完了と週3回達成は`PostRecord`を正本とし、ポイント専用の行動記録を作らない。
- Initial Rules: 企画初回確認1WP／日、投稿完了5WP／日、週3回達成10WP／週だけを固定Version 1で開始する。ログイン付与は追加しない。
- Idempotency: 元イベントは`workspaceId + eventType + sourceEventId`、付与は`ruleId + day/week`で重複を防ぐ。
- Time: 日・週境界は明示Timezone（初期`Asia/Tokyo`）で算出し、付与期限は行動から180日後が属する月末とする。
- Isolation: ACTIVE User／Workspace Membershipを再確認し、Campaign由来のGroup帰属を同じWorkspace内で解決する。
- Retry: 完了イベントは再処理せず、失敗イベントは安全な分類だけを記録して次Batchで再試行可能にする。本文や秘密情報を失敗記録へ残さない。
- Scope: API/UI、交換、失効Job、Rule管理画面は含めない。
- Source: `docs/POINT_ACTIVITY_PROCESSOR_REPORT.md`

## 2026-08-29: 利用者向けポイント画面は本人スコープのRead Modelとして提供する

- Scope: 認証済みUser本人とACTIVEなWorkspace Membershipを必須とし、URLやリクエスト本文で別Userを指定するAPIを作らない。
- Contents: 残高、本人の直近20件の履歴、30日以内の未消費付与の失効予定、ACTIVEな獲得Rule、本人の週間投稿数だけを返す。
- Privacy: Group管理者や他User向けの横断取得をP-3へ含めず、Group／Campaignの内部情報を利用者向け履歴へ表示しない。
- Resilience: ポイント取得失敗時は専用画面だけを縮退表示し、BUNSHIN、企画確認、コピー、投稿完了を停止しない。
- UX: アカウント画面から開く日本語のモバイル画面とし、台帳用語や英語のRule Keyを表示しない。

## 2026-08-29: ポイント交換は短期予約後に外部処理の受付結果で確定する

- Catalog: 交換対象と必要WPは版管理された共通Catalog Itemを正とし、画像生成50 WP、追加企画生成30 WPの初期版を登録する。
- Atomicity: 予約、残高減算、消費Transaction、消費元Linkを同じSerializable Transactionで保存し、ポイントだけが減る部分成功を残さない。
- Lifecycle: `RESERVED`からProvider受付成功時は`CONFIRMED`、受付前の失敗は`RELEASED`、受付後の最終的な技術失敗は`REFUNDED`へ進める。
- Return: 解放と返却は元の消費を参照する追記型`REFUND` Transactionで一度だけ戻し、残高や過去Transactionを上書きしない。
- Isolation: Catalog以外の交換記録はverified sessionのWorkspace・User本人だけが操作でき、Group管理者向け横断取得を作らない。
- Split: P-4AはCore Persistence、Repository、Use Caseまでとし、画像生成・追加企画生成への実接続と期限切れ予約JobはP-4Bへ分離する。

## 2026-08-29: SNS画像生成はポイント確定を実行条件にする

- Order: 既存のGroup・Workspace・本人認可後に画像生成Requestを作り、50 WPを予約する。Workerが先に動く競合を防ぐため、交換確定後にJobを登録し、登録失敗時は即時返却する。
- Gate: WorkerはProvider呼び出し前に、同じWorkspace・User・画像Requestへ紐づく交換が`CONFIRMED`であることを再確認する。未確定、解放済み、別Userの交換では生成しない。
- Recovery: 交換確定前の失敗は`RELEASED`、Job登録失敗またはJobの最終失敗は`REFUNDED`として一度だけポイントを戻す。
- Expiry: `RESERVED`のまま15分を超えた交換は、5分間隔の内部処理で上限100件ずつ解放する。
- UX: 画像作成画面に必要ポイントと現在残高を表示し、残高不足またはポイント取得失敗時は作成ボタンを無効化する。既存の企画閲覧等は停止しない。
- Split: 追加企画生成は生成境界を個別に確認してP-4Cで接続する。

## 2026-08-29: バッジはUser単位の達成台帳としてPointと分離する

- Purpose: バッジは開始、継続、挑戦、企業認定の証明と次の行動案内に使い、他Userとの順位やAIによる投稿品質評価には使わない。
- Owner: Awardの所有者はUserとし、Bunshinは任意の根拠参照にする。仕様上のtenantは既存Workspaceへ、企業内単位はGroupへ対応させ、新しいtenant境界を作らない。
- Migration: 既存`AchievementBadge`は簡易互換データとして保持し、新しいDefinition／Version／Progress／Award Coreへ一度だけ移行する。新旧処理を同時に特典へ接続しない。
- Catalog: 初期共通Badgeは10種類に限定し、説明可能な既存行動だけを根拠にする。任意コード、任意API Event、AI品質採点は認めない。
- Reward: Badge AwardとPoint Transactionを別レコードにし、Reward Link／Outboxで非同期接続する。初期10種類は特典なしを推奨し、既存投稿Pointとの二重付与を避ける。
- Visibility: 初期値はPRIVATEとし、初期MVPの実公開は本人選択のGROUPまでとする。PUBLICプロフィールは公開基盤と同意設計の後に追加する。
- Resilience: Badge、通知、特典の失敗で企画確認、コピー、投稿完了を停止しない。二重獲得より遅延獲得を選ぶ。
- Boundary: B-0は文書のみとする。推奨初期値は承認済みとし、B-0 PRのマージ後にB-1へ進む。

## 2026-08-29: 追加企画交換P-4Cは生成Coreの承認まで保留する

- Finding: 最新`main`に利用者向け別案生成処理がなく、通常Daily Missionの同日一意性、派生履歴、回数、Provider受付境界が未設計である。
- Decision: Catalogの`ALTERNATIVE_PLAN_GENERATION`を利用者へ公開せず、Pointだけを先行消費しない。
- Resume: 別案生成Core、元Missionとの追記型関係、日次上限、原価、失敗返却、URL再解決境界を承認後に再開する。

## 2026-08-29: Badge Coreは旧AchievementBadgeを変更せず別台帳で追加する

- Persistence: Definition、Version、Progress、Award、Processing Event、Admin Auditを独立Modelにし、既存`AchievementBadge`はB-2の一度限り移行まで保持する。
- Scope: SYSTEM定義はWorkspace非依存、GROUP定義はWorkspaceとGroupの組を必須にする。Award所有者はUser、Bunshinは任意の根拠参照とする。
- Authorization: SYSTEM操作はACTIVE SUPER_ADMIN、GROUP操作はACTIVE Workspace MembershipとGroup MANAGERを両方必要とする。
- Isolation: GroupとBunshinはWorkspaceを含む複合外部キーで固定し、RepositoryでもMembership、Definition所有Scope、Userを再検証する。
- Idempotency: AwardはWorkspace／User／KeyとBadge Version、Processing EventはWorkspace／Event Type／Source Eventで重複を防ぐ。
- Evidence: 元本文や個人情報を複製せず、Source Type、Source ID、SHA-256 Evidence HashだけをAwardへ保持する。
- Boundary: B-1はPersistence／Repository／Use Case／Testまでとし、Seed、判定Processor、API、UI、Point／Entitlement、通知は含めない。
- Source: `docs/BADGE_CORE_PERSISTENCE_REPORT.md`

## 2026-08-29: 共通バッジは既存の客観行動から非同期に判定する

- Catalog: 承認済みの初期10種類だけをSYSTEM所有のVersion 1として登録し、Point特典なし・本人非公開で開始する。
- Evidence: Bunshin作成、SNS戦略承認、Mission確認／採用、投稿、Feedback、画像完了の既存正本だけを使い、AIによる品質採点は行わない。
- Time: 連続日は利用者Timezone、未設定時はAsia/Tokyo、週は月曜日開始で判定する。
- Migration: 旧バッジは意味が一致するFIRST_CONFIRMATIONとFIRST_POSTのみ移行し、FIRST_PREPARATIONとTHREE_ACTIVE_DAYSは推測変換しない。
- Source: `docs/BADGE_COMMON_PROCESSOR_REPORT.md`

## 2026-08-29: バッジの公開範囲は獲得記録と分離して本人だけが変更する

- Default: 獲得バッジは必ずPRIVATEから開始し、自動公開しない。
- Ownership: 公開設定はAward所有User本人だけが変更でき、Group管理者による強制公開APIは作らない。
- Group: GROUP共有は同一Workspaceで本人がACTIVE所属するACTIVE Groupだけに限定し、脱退・停止後の実効表示はPRIVATEへ戻す。
- Persistence: `BadgeAwardVisibility`を`BadgeAward`から分離し、公開設定の変更で獲得根拠と履歴を上書きしない。
- Exclusion: PUBLICプロフィール、ランキング、他User比較、AI品質評価はB-3に含めない。
- Source: `docs/BADGE_USER_EXPERIENCE_REPORT.md`

## 2026-08-29: グループ独自バッジは本部承認と二者確認を必須にする

- Publish: Group管理者は下書きと申請までとし、公開はACTIVE SUPER_ADMINの承認時だけ行う。
- Candidate: 付与対象者と候補登録者は候補を承認できず、別のACTIVE Group管理者による確認を必須にする。
- Scope: 申請、候補、AwardはWorkspace／Group／Version／User境界をRepositoryとDB制約の両方で固定する。
- Reward: B-4Aで申請できるGroup BadgeはMANUAL_APPROVALまたはIMPORT、reward type NONEに限定する。

## 2026-08-29: バッジ報酬は用途限定EntitlementをOutbox経由で発行する

- Separation: Badge Awardを先に確定し、Reward LinkとOutboxを介して報酬を非同期発行する。報酬失敗で獲得済みBadgeを取り消さない。
- Idempotency: 1つのBadge AwardにつきReward LinkとOutboxを各1件に限定し、Workspace／User／Awardの複合外部キーで越境混入を拒否する。
- Entitlement: 「画像生成1回」のような用途固定特典はWPへ換算せず、Feature Key、付与回数、残数、有効期限、1回原価上限、未使用時失効方針をSnapshotとして保持する。
- Scope: 初期10共通BadgeとB-4 Group Badgeは引き続き特典なしとする。B-5Aは永続化と冪等発行Coreまでとし、Worker、消費接続、再試行・補償、企業手動履行、管理画面はB-5Bへ分離する。

## 2026-08-29: バッジ報酬配送は専用WorkerでLeaseと有限再試行を行う

- Claim: Outboxは期限付きLeaseで1件ずつ取得し、Worker停止後は期限切れLeaseを別Workerが回収できるようにする。
- Retry: 失敗は安全な分類コードだけを保存し、30秒から最大1時間の指数Backoffで再試行する。Provider応答、秘密値、投稿内容は保存しない。
- Exhaustion: 既定5回でOutboxをDEAD、Reward LinkをFAILEDにするが、Badge AwardはACTIVEのまま維持する。
- Operations: Cron Secretで保護した内部Endpointから固定件数だけ処理し、応答とログには集計値だけを出す。
- Next: 画像生成は現状Point予約が必須のため、B-5B2でPointまたは用途限定Entitlementを選ぶ統一消費境界と失敗時補償を追加してから接続する。

## 2026-08-29 — Badge Reward B-5B2 unified image payment boundary

- Decision: SNS画像生成では、期限と原価上限を満たす`SOCIAL.IMAGE_GENERATION`用途限定特典をPointより先に消費し、対象特典がない場合だけPointを使用する。
- Safety: Workspace、User、用途、Resourceを永続化し、Resource単位の一意制約とDB advisory lockで同じ画像依頼への二重消費を防ぐ。Pointと特典が同時に見つかったJobは生成を停止する。
- Compensation: Queue投入前またはJob最終失敗時は、実際に使用した支払元だけへ返却する。特典の使用履歴は削除せず`REFUNDED`として理由と日時を保持する。
- Cost: 管理画面で設定したOpenAIの1回原価が特典の`maxUnitCostUsdMicros`以下の場合だけ特典を使用する。
- Scope: 購入・課金、企業向け手動履行、再処理・監査の管理画面はB-5B3以降とし、本変更には含めない。

## 2026-08-29 — Badge Reward B-5B3 operational completion

- Access: 原価を伴う特典の手動付与とDead処理の再実行は、費用負担者と販売プランの委任方針が確定するまで`SUPER_ADMIN`だけに許可する。
- Isolation: Mutationは画面上の表示値を信用せず、`workspaceId + rewardLinkId`をDBで再照合する。別Workspaceの特典を操作できない。
- Retry: 自動再試行を使い切った`FAILED / DEAD`だけを再実行可能とし、管理者操作時に試行予算を明示的に再設定する。
- Manual fulfillment: Badge Awardが有効で、まだEntitlementが存在しない場合だけSnapshotから手動付与する。既存Entitlementは上書き・重複発行しない。
- Audit: 再実行・手動付与には理由を必須とし、操作者、対象Workspace／Group／Badge Award、変更前後、日時を`BadgeAdminAuditLog`へ保存する。
- Operations UI: システム管理画面で付与状態、停止理由、試行回数、残数・期限、使用／返却履歴、管理者操作履歴を確認できる。
- Privacy: 審査では個人の投稿本文、Personality、Knowledge、Memoryを取得しない。
- Source: `docs/GROUP_BADGE_APPROVAL_CORE_REPORT.md`

# 2026-08-29: バッジ獲得通知はアプリ内を正としてAward単位で一度だけ作る

- アプリ内通知をバッジ獲得通知の正本とし、LINE送信成否とは分離する。
- `BadgeAwardNotification`を`BadgeAward`と1対1にし、DB一意制約と`createMany(skipDuplicates)`で同じAwardの重複通知を防ぐ。
- 通知一覧と既読更新はWorkspace Membershipと本人のUser IDを毎回検証し、別Workspace・別Userの通知を返さない。
- 既存Awardにも本人がバッジ画面を開いた時点で不足通知を補完し、移行前の獲得を失わない。
- 取消・失効したAwardは通知一覧へ表示しない。通知削除は用意せず、本人の既読日時を保存する。
- LINE通知はB-6BでテストGroupのFeature Flag、通知同意、Quiet Hours、Quota、全体停止を再利用して接続する。

# 2026-08-29: バッジLINE通知はテストGroup限定の独立Deliveryとして準備する

- Daily Mission必須の`LineMessageDelivery`へバッジを混在させず、`BadgeLineNotificationDelivery`を独立させる。
- 対象はGroup Badge Awardに限定し、Group LINE Routing Policyの`pilotEnabled`をFeature Flagとして使用する。
- Group在籍・参加同意、LINE接続・友だち状態・通知同意、利用者通知設定、停止期間をすべて満たす場合だけ配信候補を作る。
- 同じAward通知は環境ごとに最大1件とし、DB一意制約と冪等Keyで重複配信を防ぐ。
- B-6B1は候補準備と状態Coreまでとし、Provider送信、Quiet Hours再評価、Quota、再試行、DLQ、緊急停止はB-6B2で既存LINE Gateへ接続する。

# 2026-08-29: バッジLINE送信は専用Deliveryのまま共通LINE Adapterへ接続する

- バッジ配送は30秒Leaseで排他取得し、送信直前にもGroup試験運用、在籍、同意、友だち状態、通知設定を再確認する。
- 有効なGroup専用LINE設定または共通LINE設定の選択、全体停止、Quota確認、受信者解決は既存LINE基盤を再利用する。
- Provider Adapterへバッジ専用の日本語メッセージ送信を追加し、秘密値を本文・履歴へ保存しない。
- 一時障害はFAILED、3回目の一時障害はDEAD、同意喪失・受信不能・上限到達はCANCELLEDとして保存する。
- Job登録、再試行時刻、管理画面監視、DLQ再処理、緊急停止検証はB-6B2Bへ分離する。

# 2026-08-29: バッジLINE配送を共通Job Workerへ接続する

- 定期Schedulerは通知候補を補完した後、PENDING配送を環境＋配送IDの冪等キーでJob登録する。
- `BADGE_LINE_DELIVER`はMission Jobと区別し、BunshinやSOCIAL Capabilityを必須にしない。
- 共通Job WorkerのLease、指数バックオフ、最大3回、DEAD状態を再利用する。
- LINE運用監視の再試行・DEAD Job集計にはMission通知とバッジ通知の両方を含める。
- 管理者による個別DLQ再処理、整合性照合、緊急停止訓練と外部検証はB-6B2Cで行う。
- B-6B2C-Aでは、バッジLINE通知のうち一時障害で`DEAD`になった配信だけを、SUPER_ADMIN／OPERATORが理由付きで再実行できる。環境、配信ID、失敗時の試行回数、実行者、理由、作成Jobを専用監査テーブルへ保存し、同一試行の二重再実行はDB一意制約で拒否する。
- 再実行Jobも`BADGE_LINE_DELIVER`として共通Workerへ戻し、送信直前の権限・同意・設定・停止・Quota確認を省略しない。

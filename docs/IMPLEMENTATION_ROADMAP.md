# BUNSHIN Platform 実装ロードマップ

非公開Serviceの商品パック・Campaign管理APIは`docs/PRIVATE_SERVICE_CONTENT_OPERATIONS_IMPLEMENTATION_REPORT.md`を参照。管理画面と同じ認証済み`CONTENT`権限でServiceを解決し、公開状態に依存しない。既存Workspace/Group所有・内容編集・同意境界を維持する。本番反映・実端末確認は別作業。

非公開サービスの参加者画面Metadataは`docs/PRIVATE_SERVICE_MEMBER_METADATA_IMPLEMENTATION_REPORT.md`を参照。9画面の表示名を本人Member Serviceから取得し、公開登録入口のPublic判定は維持する。匿名/所属外への名前漏えいと未知障害の握りつぶしを避ける。本番反映・実端末確認は別作業。

Service法務文書の再同意は`docs/SERVICE_LEGAL_RECONSENT_IMPLEMENTATION_REPORT.md`を参照。既存参加者の最新版同意を初回参加から分離し、非公開Serviceを含む本人導線と、公開3文書がある場合の参加同意を揃える。本番データ監査・実端末確認・リリースは別作業。

Service法務文書の最新有効版統一は`docs/SERVICE_LEGAL_LATEST_VERSION_IMPLEMENTATION_REPORT.md`を参照。公開表示/参加Transaction/既存参加者利用/通知Preferenceの4経路で、同じWorkspace/ServiceのPUBLISHED・有効日時以前の文書をtypeごと最大versionへ揃える。旧版だけへの同意で新版を満たさず、古い画面からの申請は拒否する。旧同意データの自動付替え・本番データ/設定/DB schema/Providerは変更しない。隔離DBと全体CI、本番の旧版同意件数/再同意導線は別々に確認する。

非公開サービスのヘルプ・マニュアル・法務文書の閲覧分離は`docs/PRIVATE_SERVICE_VISITOR_PAGES_IMPLEMENTATION_REPORT.md`を参照。公開Serviceは匿名/未参加のログイン済みUserの案内を維持し、非公開Serviceは既存参加者だけに案内と公開済み法務文書を表示する。本人Member拒否だけPublic判定へ戻し、DB障害を隠さない。マニュアルのcacheをUser別に分け、文書は自Workspace/Group・公開済み/有効版へ限定する。公開登録/同意、設定/DB、本番データ/Providerを変更しない。他のMetadata表示と本番反映は別作業。

非公開サービスのProgram目標権限分離は`docs/PRIVATE_SERVICE_PROGRAM_GOALS_IMPLEMENTATION_REPORT.md`を参照。支援方針/目標候補は管理Resolverだけ、本人の希望/目標はMember Resolverだけを使用し、公開判定や権限fallbackを前提にしない。本人Enrollment/受講ロック後の研修期間条件、方針選択許可/版/監査と過去目標保持を維持する。入力400と管理不存在404を区別し、未知障害を握りつぶさない。公開入口/画面、DB、設定、本番データ、Providerは変更せず、残る画面監査と本番反映は別作業。

非公開サービスの動画配信参加者操作は`docs/PRIVATE_SERVICE_VIDEO_ACTIONS_IMPLEMENTATION_REPORT.md`を参照。閲覧/採用/辞退/自己申告投稿とダウンロードを認証後のMember Service解決へ合わせる。期限切れ/取消済みの投稿副作用を先に拒否し、本人Project/Render/Storage Key・未削除/期限・採用条件を照合する。署名URL準備成功後だけ履歴を保存し、拒否/不存在/未知障害を区別する。実LINE/Storage、設定、DB、本番データは変更しない。残る画面/Program目標の公開判定監査と本番反映は別作業。

非公開サービスの本人商品紹介API対応は`docs/PRIVATE_SERVICE_PRODUCT_CONTENT_IMPLEMENTATION_REPORT.md`を参照。保存/非表示、コピー/自己申告投稿、紹介文生成は認証後のMember Service解決へ合わせ、本人の商品/分身/ACTIVE URL/公式商品再照合を維持する。生成Quotaにも自Service IDを渡し既存Service上限を迂回しない。URL非送信、PR/公式ルール/媒体上限と使用量記録は維持する。匿名公開入口、設定、DB、本番データ、実Providerは変更しない。動画通知と画面の追加監査、本番反映は別作業。

非公開サービスの初回回答・紹介コード・本人専用URL API対応は`docs/PRIVATE_SERVICE_ONBOARDING_REFERRALS_IMPLEMENTATION_REPORT.md`を参照。認証後のMember Service解決を使い、Service固有の質問/事業プロフィール・紹介設定・本人所属・許可ドメインとDRAFT保存を維持する。Schema不一致は400、未知Resolver障害は500として区別する。匿名の紹介先登録・公開入口、設定、本番データは変更しない。商品紹介・動画通知と画面の追加監査、本番反映は別作業。

非公開サービスの投稿操作・成果・日々の記録API対応は`docs/PRIVATE_SERVICE_POSTING_OUTCOMES_IMPLEMENTATION_REPORT.md`を参照。共通Mission Scope、業務成果、SNS数字保存/画像読取、メモ/写真を認証後のMember Service解決へ合わせる。業務成果設定は同じContextから解決し、Service固有の機能制限・本人所有・参加同意・SOCIAL能力を維持する。実Provider呼出、本番設定/データ、匿名登録は変更しない。商品紹介・紹介リンク・初回設定・動画通知等の別機能判定は後続監査、本番反映は別作業。

非公開サービスのSNS設定・発信方針・投稿テーマ・週間計画API対応は`docs/PRIVATE_SERVICE_SOCIAL_PLANNING_IMPLEMENTATION_REPORT.md`を参照。認証後のMember Service解決へ合わせ、本人所有・SOCIAL能力・入力/Origin検証と生成時の自Service知識/用語/Quota等を維持する。投稿採否/完了/成果・振り返りは次の独立PR。本番反映・実端末確認は別作業。

非公開サービスの投稿パートナー操作対応は`docs/PRIVATE_SERVICE_BUNSHIN_OPERATIONS_IMPLEMENTATION_REPORT.md`を参照。認証後のMember Service解決で一覧・作成・取得・編集・停止と初回回答からの候補提案を接続する。サービス所属の編集/停止は本人所有に限定し、個人用Bunshin管理権限は維持する。SNS設定・投稿テーマ・週間計画・投稿操作の公開限定判定は後続の独立PRとする。本番反映・実端末確認は別途必要。

専用LINE再連携の試行分離と非公開サービス既存参加者対応は`docs/SERVICE_LINE_RECONNECTION_ISOLATION_IMPLEMENTATION_REPORT.md`を参照。試行別Cookie・自試行限定の後処理・既存Member Service認可を使い、複数Service/同一Serviceの再試行が干渉しないようにする。旧Cookieは一致する開始済み試行だけ短期互換で検証し、設定・本番データ・共通認証の有効化・実LINE送信は変更しない。本番実端末確認は別途必要。

AI研修の過去の未確定終了日時の管理者個別確定は`docs/ai-training/AI_TRAINING_END_DATE_CONFIRMATION_IMPLEMENTATION_REPORT.md`を参照。自Serviceの管理者が証跡・日本時間の日時・理由を指定し、Preview Revisionと受講排他で未確定日時のみを保存し監査する。アーカイブ/退会後の記録にも対応する。既存確定日上書き・自動推定・一括補完・データ削除・本番期限処理の停止解除は行わない。

AI研修の無料・手動登録受講の期限終了バッチは`docs/ai-training/AI_TRAINING_AUTOMATIC_EXPIRY_IMPLEMENTATION_REPORT.md`を参照。購入に紐づかない受講をService限定・期間/所有/Module/CAS再確認で終了し、評価待ちを停止する。最小システム監査を保持し、確定終了日記録は既存Triggerを使う。内部実行口はdevelopment/stagingのみで、本番停止・Cron未登録・保持期限消去停止を維持する。

複数Service同時ログインの復帰分離は`docs/AUTH_RETURN_ATTEMPTS_IMPLEMENTATION_REPORT.md`を参照。試行別proof・PKCE flowId・単回DB記録・本人に束ねた同意を実装する。初期値は無効で、本番有効化にはSupabase Redirect URL/メールテンプレートと実端末の確認が必要。マージだけで本番稼働済みとは扱わない。

サービス認証・LINE再連携の混在防止は`docs/SERVICE_AUTH_FLOW_ISOLATION_REPORT.md`を参照。認証/同意後にサービスへ復帰し、共通業種登録は挟まない。サービス固有の参加・事業プロフィール・研修・占いの判定は維持する。管理入口/操作・画像閲覧の類似ケースも修正し、既存ページ一覧の回帰テストで許可リストの漏れを確認する。本番実端末/リッチメニュー確認と複数同時認証の復帰情報は未確認・後続作業。

機能不足の再監査は`docs/FUNCTIONAL_GAPS_AUDIT_20260929.md`を参照。第一作業単位のOEM決済CSV期間指定・上限超過時の欠落防止は`docs/OEM_PAYMENT_EXPORT_PERIOD_IMPLEMENTATION_REPORT.md`を参照。日本時間の受付日で絞り、10,000件を超えた場合は部分CSVを返さない。入金/返金日の会計期間集計、上限撤廃、本番設定変更は含めない。

AI研修の管理画面の受講期間表示は`docs/ai-training/AI_TRAINING_ADMIN_PERIOD_STATUS_IMPLEMENTATION_REPORT.md`を参照。期限後ACTIVEは状態未更新の期限終了として表示し、開始前/開始日時不明とともに受講中・継続率・声かけ集計から除く。利用状況と登録状態を分け、LifecycleのCASや確定終了日・保持期限起算日を表示から書き換えない。

AI研修の受講期間ガードは`docs/ai-training/AI_TRAINING_PERIOD_GUARDS_IMPLEMENTATION_REPORT.md`を参照。ACTIVEでも開始前/期限後は新しい学習操作・課題生成・評価を拒否し、ロック後/Provider直前/評価保存前に再確認する。Toolkit/本人Exportは維持し、自動終了状態更新や保持期限起算日の補完、課金・削除・本番設定変更は含めない。

AI研修の読み取り専用保持期限管理画面は`docs/ai-training/AI_TRAINING_RETENTION_ADMIN_PREVIEW_IMPLEMENTATION_REPORT.md`を参照。自Serviceの件数と終了日・所有境界の判定保留だけを集計し、DBでも管理者を再検証する。削除操作・終了日補完・定期実行・本番有効化は追加しない。

AI研修の管理集計の評価自由文除外は`docs/ai-training/AI_TRAINING_ADMIN_EVALUATION_PRIVACY_IMPLEMENTATION_REPORT.md`を参照。評価JSON全体・weaknessesの取得表示を止め、DB認可と許可値だけの射影を使う。個人回答閲覧権限は追加しない。

AI研修の受講者向け終了案内は`docs/ai-training/AI_TRAINING_ENDED_PARTICIPANT_IMPLEMENTATION_REPORT.md`を参照。終了/取消/期限終了を本人限定・読み取り専用で表示し、Runtimeを呼ばない。取消時のToolkit/Export権限は拡張せず、再開は既存管理者操作を使用する。

AI研修の管理者による終了・取消・再開は`docs/ai-training/AI_TRAINING_ENROLLMENT_LIFECYCLE_IMPLEMENTATION_REPORT.md`を参照。確認状態/更新時刻・受講ロック・再送監査で変更し、終了時の評価待ち処理を停止する。再開で契約期間延長や削除データ復元を行わず、本番保持期限処理の停止は維持する。

更新基準: 2026-09-28、`main` commit `f96b830d`。各Phase内の箇条書きは実装履歴を残しているため、冒頭の状態と最新の機能別報告書を現在状態の判断に使用する。コード完了は本番Migration、外部Provider接続、実端末検証、事業承認の完了を意味しない。

## マルチサービス化

AI研修の期限処理は`docs/ai-training/AI_TRAINING_RETENTION_EXECUTION_IMPLEMENTATION_REPORT.md`を参照。終了状態への将来の変更を記録し、確認Revision付きの回答90日・仕事情報終了90日・進捗終了1年の処理を実装する。Toolkitは保持。本番実行APIは停止し、定期実行・本番有効化は別途承認・変更が必要。

AI研修の保持期限Preflightは`docs/ai-training/AI_TRAINING_RETENTION_PREFLIGHT_IMPLEMENTATION_REPORT.md`を参照。承認済み90日/暦年1年の期限判定とScope限定の読み取り専用件数確認を追加する。実削除・定期実行・本番有効化は未実装。終了日不明の受講は判定保留とする。

AI研修の本人削除は`docs/ai-training/AI_TRAINING_PERSONAL_DATA_DELETION_IMPLEMENTATION_REPORT.md`を参照。回答1件/全学習データのPreviewと明示確認、既存書込/評価との競合防止を接続する。自動保持期限は次の独立PRであり、本番反映や既存データの自動消去を開始した証拠とは扱わない。

AI研修の本人Exportは`docs/ai-training/AI_TRAINING_PERSONAL_DATA_EXPORT_IMPLEMENTATION_REPORT.md`を参照。本人・Service・Enrollment単位のJSONダウンロードを接続する。承認済みの本人削除・90日/1年の自動期限削除は後続PRで実装し、現在稼働済みとは扱わない。

追加質問の見送り・再表示制御は`docs/HASSY_ONBOARDING_REFINEMENT_DEFERRAL_IMPLEMENTATION_REPORT.md`を参照。7日間の質問単位見送り、24時間の提示休止、アカウントからの手動回答編集を追加し、本番反映は別途確認する。

状態: MS-1〜MS-2D-S3-Bに加え、用途別サービス作成、初回設定、参加者向け活動・紹介導線までコード実装済み。個別機能の本番利用は各Production Gateの最新証跡を確認する。

MS-2Aでは既存個人Bunshinを維持し、サービス所属BunshinのnullableなGroup紐付け、参加者認可、サービス限定一覧境界を追加する。API/UI接続はMS-2Bで実施する。

MS-2BではサービスSlugからサーバー側でWorkspace・Groupを解決し、サービス参加者専用のBunshin作成・一覧API/UIを接続する。利用者向けには「投稿パートナー」と表示し、4問だけで作成できるようにする。

MS-2Cではサービス専用の詳細・基本設定編集・停止を接続する。通常一覧と詳細は所有者本人だけに限定し、同じサービスの他参加者やサービス管理者へ個人の投稿人格を自動公開しない。

MS-2D-Aではサービス専用のSNS設定を接続する。サービスSlugからサーバー側で対象サービスを解決し、投稿パートナー所有者だけが登録・編集できる。

MS-2D-Bでは週間計画の前提となるサービス専用の投稿テーマを接続した。

MS-2D-Cではサービス専用のSNS戦略生成・一覧・承認を接続した。投稿パートナー、SNS設定、戦略を同じサービスと所有者の境界で検証し、サービス用Knowledge Grantが接続されるまでは個人知識を生成入力へ渡さない。

MS-2D-Dではサービス専用の週間投稿計画のAI生成・一覧・確定・終了を接続した。サービス用Knowledge GrantとCampaignの生成境界が接続されるまでは生成入力へ渡さない。

MS-2D-Eでは確定済み週間計画を基に、サービス専用の毎日の投稿案の生成・一覧・内容確認を接続した。未接続の個人Knowledge、Memory、Personality Version、Trend、Product Pack、Campaignはサービス版の生成入力から除外する。次は採用・不採用、コピー、投稿完了、Feedbackをサービス境界で接続する。

MS-2D-Fではサービス専用の投稿案へ、採用・不採用、不採用理由、コピー履歴、手動投稿完了、本人らしさFeedbackを接続した。すべての操作でサービス、所有者、分身、投稿案の境界をサーバー側で再検証する。次はサービス専用LINEから今日の投稿案へ戻る導線と継続状況表示を検討する。

MS-2D-Gではサービス専用ホームへ、投稿パートナーごとの今週の活動状況、週間目標、今日の投稿案への導線を追加した。進捗取得にもサービスIDと所有者を必須境界として伝播する。サービス専用LINEからの署名付き導線は、通知方式の事業判断後に別単位で接続する。

MS-2D-Hでは、同じサービスの管理者が承認した共通公式Knowledgeを、サービス専用のSNS戦略、週間投稿計画、毎日の投稿案へ接続した。サービスIDと参加者をRepositoryで再検証し、商品専用資料はCampaign接続まで除外する。個人Knowledge、他サービスKnowledge、未承認資料は生成へ渡さない。

MS-2D-Iでは、同じサービスの参加者が承諾した有効なCampaignと公開済みProduct Packを、週間投稿計画と毎日の投稿案へ接続した。Campaign検索をサービスIDで制限し、必須表記・禁止表現・公式商品Knowledge・専用URL選択・使用履歴を既存の安全処理経由で適用する。他サービスの商品・Campaign・専用URLは生成へ渡さない。

MS-2D-Jでは、サービスホームの画像・動画導線を`/s/{serviceSlug}`配下へ移した。画像、動画一覧、動画素材、動画詳細はSlugからサーバー側でサービスIDを解決した後、既存の参加者・機能割当・所有者認可を再利用する。利用者は内部のGroup IDをURLで扱わず、動画機能内の移動もサービス専用URLに維持する。

MS-2D-Kでは、サービス運営管理者向けの参加者、公式資料・FAQ、法務文書、バッジ管理の入口を`/s/{serviceSlug}/manage`配下へ移した。Slugからサーバー側でサービスIDを解決し、既存の管理者認可を再利用する。登録・変更後の戻り先をサービス専用URLへ統一する作業はMS-2D-Lで行う。

MS-2D-Lでは、参加者設定・参加承認・法務文書・バッジの登録、変更、審査後もサービス専用管理URLへ戻るようにした。フォームから任意URLは受け取らず、対象GroupとService Slugの一致をServer Action側で再検証する。一致しない場合は既存Group管理URLへ安全に戻す。

MS-2D-Mでは、サービス管理者が作る一回限りの招待リンクを`/s/{serviceSlug}/join/{token}`へ移した。発行時と承諾・辞退時にService Slug、Group、Workspace、招待Tokenの一致をサーバー側で再検証し、ログイン後もサービス専用画面へ戻す。既存Group招待URLは互換性のため維持する。

MS-2D-Nでは、サービス管理者向けの公式商品情報と参加募集を`/s/{serviceSlug}/manage`配下へ接続した。サービスSlugからWorkspace・Serviceをサーバー側で固定し、Group Manager認可とRepositoryのGroup条件を併用する。画面やリクエストから別サービスIDを指定しても利用しない。専用URL管理は操作・監査境界が広いため次の独立単位で接続する。

MS-2D-Oでは、サービス管理者向けの参加者専用URL管理を`/s/{serviceSlug}/manage`配下へ接続した。外部サービス、許可ドメイン、参加者外部ID、URL、CSV部分取込、開始・停止、CSV出力、使用履歴、監査履歴を自サービスへ固定する。Slug解決、Group Manager認可、HTTPのService ID照合、Repositoryの再照合を重ね、別サービスのIDへ差し替えても参照・変更できない。

MS-2D-Pでは、サービス管理者向けのブランド・登録設定を`/s/{serviceSlug}/manage/settings`へ接続した。名称、説明、運営者、問い合わせ先、ロゴ、アイコン、色、文字、規約URL、参加方法を自サービスだけで更新できる。非公開の準備中サービスも所属管理者だけが設定できる一方、専用URL、公開状態、利用期間、Powered by表示はプラットフォーム管理項目としてHTTPとRepositoryの両方で変更を拒否する。

MS-2D-Qでは、サービス管理者向けの専用LINE設定を`/s/{serviceSlug}/manage/line`へ接続した。LINE方式、暗号化Channel設定、接続確認、有効化を自サービスへ固定する。Service Slug、ACTIVEなManager Membership、Workspace、Service、Environmentを再検証し、秘密値は保存後に末尾マスクだけを表示する。既存のVersion、ACTIVE一意制約、Webhook Routing、Audit Logを維持する。

MS-2D-Rでは、プラットフォーム管理者向けのサービス公開・利用管理を`/admin/services`へ接続した。公開・非公開、利用開始・終了日時、Powered by表示、サービス一時停止・再開を管理画面から変更できる。対象Service IDからWorkspaceとGroupをサーバー側で解決し、SUPER_ADMINを再検証し、変更前後・理由・実行者を既存監査ログへ保存する。サービス管理者はこれらのプラットフォーム管理項目を変更できない。

MS-2D-S1では、既存の`MANAGER / PARTICIPANT`を壊さず、サービス内の業務責任を`SERVICE_OWNER / SERVICE_ADMIN / CONTENT_EDITOR / PARTICIPANT`として分離するCoreを追加した。既存サービスの作成者を責任者、その他の管理者をサービス管理者へ移行し、最後の責任者を削除できない制約、理由必須の変更監査、プラットフォーム管理者と責任者だけが変更できるRepository境界を実装した。S2で管理API・画面、S3で各管理機能への権限適用を行う。

MS-2D-S2では、サービス内担当者の一覧・役割変更APIと参加者管理画面を接続した。サービス所有者またはSUPER_ADMINだけが役割を変更でき、Service Slug、Workspace、Service、Membershipをサーバー側とRepositoryで再照合する。一般向け表示は「サービス所有者・運営管理者・コンテンツ担当者・一般参加者」とし、従来のグループ役割変更欄はサービス画面から隠して二重管理を防止する。S3で各管理機能へ役割別の認可を適用する。

MS-2D-S3-Aでは、サービス管理画面の共通入口認可を旧`MANAGER`から`SERVICE_OWNER / SERVICE_ADMIN`へ切り替えた。設定、LINE、参加者、公式資料、法務、バッジ、商品、参加募集、専用URLの全入口で同じService Slug・Active Membership・Service Role境界を利用し、一般参加者とコンテンツ担当者には管理メニューを表示しない。コンテンツ担当者への限定編集開放はRepository認可と同時に行うS3-Bへ分離する。

MS-2D-S3-Bでは、`CONTENT_EDITOR`へ公式資料・FAQ、公式商品情報、参加募集の3機能だけを開放した。画面、Service Slug解決、Repositoryのすべてで同じService RoleとActive Membershipを検証し、サービス設定、LINE、参加者、法務、バッジ、専用URLは引き続き`SERVICE_OWNER / SERVICE_ADMIN`だけに制限する。

MS-3-Aでは、プラットフォーム管理者のサービス作成画面へ「副業・アフィリエイト向け」「企業・代理店向け」「自由設定」の初期設定テンプレートを追加する。サービス名は固定せず、登録方式、LINE、招待コード、紹介元記録の推奨値だけを準備し、選択したテンプレートはオンボーディング設定へ記録する。

MS-3-Bでは、サービス運営管理者が初回案内の見出し・説明と最大7問の初回質問を管理画面から保存できるようにする。設定はService Registration PolicyのJSONへサービス単位で保存し、作成テンプレートの識別情報を維持する。参加者の回答保存と初回導線への表示はMS-3-Cで接続する。

MS-3-Cでは、ACTIVE参加者の初回導線へサービス別質問を表示し、回答時点の質問スナップショットと回答を参加者所属単位で保存する。回答の参照・保存条件にはworkspace、service、membership、userを含め、別サービス・別参加者の回答を混在させない。設定済み質問がないサービスは従来どおりホームへ進む。

MS-3-Dでは、保存済み初回回答をサーバー側で本人のACTIVEなサービス所属から取得し、投稿パートナー3案の生成へ接続する。回答をブラウザから再送させず、別サービス・別参加者の回答差し替えを防止する。AI設定が未準備または一時障害の場合も決定的な3案へ切り替え、質問未設定サービスには既存の4項目手入力を維持する。

MS-3-Eでは、サービス運営管理者の参加者画面へ初回設定の完了・未完了・質問未設定を表示する。運用確認に不要な回答本文は取得・表示せず、完了日時だけを公開する。参加者選択欄にも未完了状態を表示し、案内が必要な人を見つけやすくする。

MS-3-Fでは、サービス運営管理者向けに開始準備チェック画面を追加する。基本情報、参加方法、初回質問、法務文書、連絡方法、利用機能、公式資料、一般参加者を一画面で判定し、未設定項目の管理画面へ直接案内する。LINEは現在の実行環境で接続確認済みかつ配信停止でない専用設定だけを準備済みと判定し、秘密値は表示しない。

MS-3-Gでは、サービス作成テンプレートへ用途別の初回案内と質問の推奨初期値を追加する。「副業・アフィリエイト向け」と「企業・代理店向け」は、むずかしい言葉を使わない最大7問の質問を作成時に保存し、サービス管理者があとから編集できる。「自由設定」は案内と質問を空のまま作成し、運営者の意図しない質問を表示しない。

MS-3-Hでは、プラットフォーム管理者がサービスを作る前に、選択したテンプレートの参加方法、ログイン方法、初回質問数と質問内容を確認できるようにする。初回質問は必要なときだけ展開し、作成後にサービス管理画面で変更できることを明示する。「自由設定」では質問が自動設定されないことを表示する。

MS-3-Iでは、千ノ国メディアと副業向けサービスで共通利用する参加者向け「活動・紹介」画面を追加した。紹介制度が有効なサービスでは本人のACTIVEな所属へ固定した紹介コードを冪等発行し、コピー、端末共有、LINE共有、サーバー生成QR、匿名化した紹介進捗を提供する。同じ画面へサービス別画像クレジット、Workspace共通ポイント、対象サービスのバッジ概要を分離表示し、他サービス・他参加者の紹介情報やバッジを表示しない。

MS-3-Jでは、サービス運営管理者の参加者画面へ参加者別のLINE配信可否と対象外理由を追加する。現在環境の配信設定、参加状態、サービス同意、アカウント状態、接続状態、通知同意、友だち状態を既存配信条件に合わせて判定し、対象人数と確認が必要な人数を集計する。Provider User IDや秘密値は取得・表示せず、復旧操作は既存のLINE設定画面と本人への接続案内へ分離する。

ワタシワークスを目的・対象者ごとの独立サービスを稼働できる共通基盤へ拡張する。既存`Group.id`を内部の`service_id`相当として維持し、GroupとServiceの二重ID管理は行わない。詳細、段階移行、データ分離、受け入れ条件は`MULTI_SERVICE_PLATFORM_REBASELINE.md`を正本とする。

- MS-1: Service Foundation
- MS-2: Service Data Isolation
- MS-3: 副業・アフィリエイト向け第一号サービス
- MS-4: 企業向けテンプレート
- MS-5: 課金・OEM

MS-1とMS-2を完了する前に、第一号サービスを一般公開しない。

## 占い

占いの中断生成復旧はD-129に従い、最終更新から10分以上の`GENERATING`を保存済み標準結果へ戻す認証済みCronをコード実装した。カード再抽選・AI再実行・LINE再送はしない。検証結果は対象PRのCI、本番反映・Cron実行は別確認とする。詳細は`FORTUNE_GENERATION_RECOVERY_IMPLEMENTATION_REPORT.md`を参照。

占いAIの非同期Job/最大3回再試行をD-145に従ってコード実装した。標準結果を先に返し、本人/Service/Bunshin・lease・更新Revisionを検証してAI結果を確定する。試行別Quota/使用量を記録し、有効なJobがあるReadingを中断復旧から除く。`FORTUNE_ASYNC_GENERATION_ENABLED`は既定無効で本番設定は変更していない。検証結果は対象PRのCI、本番稼働は別確認。詳細は`FORTUNE_ASYNC_GENERATION_IMPLEMENTATION_REPORT.md`。

## AI研修

状態: 個別化コアループ、実務利用結果、Barrier理由、1分版、Practice / Work表示、非同期回答評価、失敗回復、Service管理画面の評価運用指標までコード実装済み。詳細は`docs/ai-training/AI_TRAINING_CURRENT_STATE_AUDIT.md`と最新の同ディレクトリ内実装報告を正本とする。

- 仕事内容と時間がかかる仕事を使う定型Personalizationは、Mission key、learning objective、criteriaを変更しない。
- 実務利用結果は回答本文を複製せず、versionedな`ProgramActionEvent`として次回Policyへ反映する。
- Barrierは選択式理由から決定的に分岐し、1分版は別MissionではなくAssignment Variantとして保存する。
- 回答評価は共通Job基盤で非同期実行し、最大3回の再試行、最終失敗、本人再投入、AI Usage監査を記録する。
- 管理画面はService単位の集計だけを表示し、回答本文、評価本文、参加者別Provider失敗情報を取得しない。

次のコード候補はProviderによるScenario個別化、Privacy lifecycle、運用通知、Template提案である。Provider品質・警報閾値・Template提案はPilot実測後に判断し、Privacy lifecycleは保持期間、本人削除・Export、契約終了、管理者・Support閲覧範囲を決定してから実装する。

## 基本方針

BUNSHINはSNS投稿を完全自動化するサービスではなく、ユーザー専用のSNS戦略を設計し、毎日具体的な行動を提示するAI企画担当として作る。

FREEではBUNSHINが戦略・企画・文章・構成・外部AI向けPrompt・学習用Raw Eventを担当し、画像・動画制作とSNS投稿はユーザーが行う。SOCIALとBLOGはMulti-Bunshin Platform上のCapabilityとして分離し、既存`stockbusiness/bunshin-blog`はPhase 0の再利用方針に従って維持する。

## Phase 0: 現状棚卸し・設計確定

状態: 完了。

- `CURRENT_SYSTEM_AUDIT.md`
- `REUSE_MAP.md`
- `TARGET_ARCHITECTURE.md`

## Phase 1: Platform Foundation

状態: 完了。

- pnpm / Turborepo / Next.js基盤
- TypeScript、lint、format、test、build、CI
- 環境変数、logging、error、DB/Prisma基盤

## Phase 2: Multi-Bunshin Core

状態: コード実装完了。FREE MVP全体のProduction利用開始判定は`FREE_MVP_PRODUCTION_GATE.md`で行う。

- User / Workspace / Membership
- Bunshin / Objective / Audience / Personality
- Owner Knowledge / Grant
- Bunshin Memory
- Capability Contract / Assignment
- verified session、認可、tenant/Bunshin分離

## Phase 3: SOCIAL Foundation

状態: 完了。

### 3.1 Social Profile — 完了

- 手動Social Profile Core Persistence
- authenticated API / minimal UI

### 3.2 Content Pillar — 完了

- Content Pillar Core Persistence
- authenticated API / minimal UI

### 3.3 Weekly Plan — 完了

- Weekly Plan / Item Core Persistence
- authenticated API / minimal UI

### 3.4 Daily Mission Core — 完了

- DailyMission / MissionContent aggregate
- format別strict validation
- lifecycle、日付一意性、tenant/Bunshin境界
- API/UIはPhase 5、AI生成はPhase 4で実装済み

### 3.5 Social Account Strategy — 完了

- SocialAccountStrategy version / approval
- FREEでは1 BunshinにつきPrimary SNS 1件
- Strategy Wizard入力とCore Persistence
- Content Pillarとの責務境界

### 3.6 Mission Decision / Activity — 完了

- Core Persistence — 完了
- authenticated API / UX — 完了
- Mission lifecycleと採用判断を分離
- ACCEPTED / REJECTEDと不採用理由
- VIEWED / COPY等のappend-only Raw Activity
- 冪等な行動計測

### 3.7 Post Record / Feedback — 完了

- Core Persistence — 完了
- authenticated API / UX — 完了
- 手動投稿完了とPostRecord
- GOOD / NEUTRAL / BADのMissionFeedback
- PreferenceとOutcomeの分離
- SNS API投稿・自動metrics取得なし

Phase 3.5〜3.7はCore Persistenceとauthenticated API/UIを別PRにする。AI生成、Provider、LINE、Jobを混在させない。

## Phase 4: SOCIAL Free MVP Intelligence

状態: 完了。

- Account Strategy Generator — 完了
- Grant済みOwner KnowledgeとBunshin context
- Weekly Planner — 完了
- Daily Mission Planner Brief — 完了
- Daily Mission生成orchestration — 完了
- Content Generator / Quality Checker — 完了
- `TEXT | SLIDE | IMAGE | LIVE_ACTION | AI_VIDEO_PROMPT` — 完了
- model、Prompt Version、使用量、処理時間、成否の構造化ログ — 完了
- Provider Port / OpenAI Adapter — 完了
- verified-session生成APIと「今日のMission」UI — 完了
- 品質合格後だけMission / Content / Decisionをatomic保存 — 完了
- Stage 1 / Stage 2品質検査と最大1回repair — 完了
- DB idempotency claim、同時生成抑止、失敗状態 — 完了
- Provider timeout・rate limit・不正JSON分類 — 完了

2026-09-28の本番AI失敗調査に基づくGrok応答契約・処理時間、本文生成の推論量、品質Schema、恒久的Job失敗の再試行抑止は実装済み（PR #989）。検証・本番反映・実運用での改善確認は区別し、`docs/AI_FAILURE_RESILIENCE_2026-09-28.md`に証跡と未解決の既存Pillar参照切れを記録する。

画像・動画binaryを生成せず、外部サービスへ渡せる指示・Promptまでを提供する。Job、LINE、SNS自動投稿、Memory自動学習、BLOGはPhase 4完了条件へ含めない。

## Phase 5: Free MVP User Experience

状態: 完了。Production利用開始は`FREE_MVP_PRODUCTION_GATE.md`完了待ち。

- Account Strategy Wizard / approval — 完了
- Daily Mission API/UI — 完了
- 採用 / 不採用 / 不採用理由 — 完了
- format別copy UX — 完了
- 投稿完了 — 完了
- 簡易Feedback — 完了
- mobile-firstの「今日やること」体験 — 完了
- 別案生成 — FREEの利用状況を確認してから回数・課金境界と合わせて再判断

## Phase 6: LINE Daily Experience

状態: 6-A、6-C Core、6-D、6-E、6-F、6-G1、6-G2a、6-G2bのコード実装済み。Production利用開始は外部設定とGo/No-Go実行待ち。詳細は`PHASE6_LINE_IMPLEMENTATION_PLAN.md`を正本とする。

- 6-0: 実装計画、認証Session ADR、schema・秘密値・migration境界の確定
- 6-A: Secure Configuration。環境分離、暗号化設定、自動生成URL、管理画面、接続テスト、Audit、rotation（完了）
- 6-B0（完了）: Supabase Custom OIDC採用、Provider/Application Callback分離、環境別外部設定Gate
- 6-B: LINE LoginとLINE起点sessionは完了。既存Userへの追加Identityの明示連携・解除は、複数認証手段を利用者へ提供する段階まで保留
- 6-C: Webhook / Connection Core。署名、follow/unfollow、友だち状態、環境別冪等性、未送信取消、recipient resolver（完了。postback業務処理とProduction接続は後続）
- 6-D: Notification Preferences。通知同意、時刻、timezone、頻度、停止（完了）
- 6-E: Job / Mission Automation。Job Core、lease、retry、Producer、認証Scheduler / Worker、Weekly / Daily handler、Vercel Cron設定まで完了
- 6-F1（完了）: 配信・試行履歴Core、環境別用途分離鍵、短期・single-use Mission Deep Link state
- 6-F2a（完了）: Messaging Provider Port / LINE Adapter、配信lease、Provider障害分類、quota優先制御Core
- 6-F2b1（完了）: Mission生成成功後の配信Job、Connection resolver、短期Deep Link発行、Push、retry分類の接続
- 6-F2b2a（完了）: verified sessionでのsingle-use Mission Callback、所有権再検証、VIEWED記録
- 6-F2b2b（完了）: LINE通知から未ログインで開いた場合、LINE認証と必要な規約同意の後に、短期Cookieで保持した元のMissionへ安全に復帰する。戻り先は`/today?state=...`だけを許可し、Mission所有権は復帰後に再検証する
- 6-G1（完了）: 環境別の通知可能数、配信状態、失敗分類、Retry / Dead Jobを管理画面・APIで可視化
- 6-G2a（完了）: 再試行可能なFAILED配信の理由付き限定再送、環境別監査、同一失敗回の二重操作防止
- 6-G2b1（完了）: 環境別LINE Funnel、Open率、通知→投稿完了率、解除・ブロック相当率の管理API/UI
- 6-G2b2（コード完了）: 外部管理者通知、非送信Readiness、Production LINE Go/No-Go workflow。Vercel/GitHub Secret登録と本番実行は未完了

LINEはMissionへの通知と入口に限定し、投稿本文・KnowledgeをPushしない。`LINE_MARKETING`、販促ステップ配信、AI自動返信、LINE上でのSNS自動投稿はPhase 6へ含めない。

LINE設定とLINE公式アカウントはProduction / Stagingで分離する。すべての外部処理でruntime environmentとconfiguration environmentを照合し、Callback / Webhook / LIFF / Deep Link URLは環境別アプリURLから原則自動生成する。

## Phase 7: 100-user Validation Readiness

- RegistrationからD7までのfunnel（集計Core / OWNER・ADMIN API完了）
- 投稿回数、継続率、GOOD率（集計Core / OWNER・ADMIN API完了）
- AI使用量（Raw Event保存・管理画面集計完了）
- AI見積原価（保存・集計欄完了。公式価格版の確認後に単価適用）
- 最低限の管理画面（期間指定、最重要KPI、行動指標、funnel完了）
- 利用規約・プライバシーのPlatform Admin版管理／公開（完了）
- 公開中の規約・プライバシーへのユーザー同意、版更新時の再同意（完了）
- 本人による退会要求・取消、14日猶予、管理者確認（完了）
- 猶予期間後の匿名化・削除実行（PR A〜Dコード完了。Productionはdisabled、Service Role Key登録・dry-run・Go承認待ち）
- Production Gate監査、backup/restore・incident手順、health smoke workflow（完了）
- Auth公開設定・最新migration・Health Smoke完了。本番Dashboard残確認、restore rehearsal、Magic Link / FREE MVP smoke、退会dry-run、Go承認は未完了
- Production Gate証跡管理（コード完了）: 対象commit別の確認・取消履歴、SUPER_ADMIN限定更新、最終承認の前提確認、管理画面の開始判定。Migration適用と実際の証跡登録は本番運用時に行う
- トレンド調査Production Gate（コード完了）: Provider自動確認、本番調査smoke証跡、最終承認の前提接続。APIキー登録、接続確認、本番smoke記録は運用時に行う

ここで100人規模のFREE検証を行う。

### Phase 7-O: Operations Admin Console

日常運用でファイル編集、Vercel環境変数の更新、サーバー操作を必要としない管理画面を整備する。詳細は`OPERATIONS_ADMIN_CONSOLE_PLAN.md`を正本とする。

- 運用設定の状態一覧と管理画面入口
- ユーザー一覧・検索・ユーザー詳細（完了）
- 全体Funnel・運用指標・離脱候補の表示（完了）
- OpenAI APIキー・モデル・停止設定の暗号化管理と全生成経路への接続（完了）
- 既存LINE設定管理の入口統合
- LINEリッチメニューCore（定義、領域、環境別version、監査、公開・停止Port）（完了）
- LINEリッチメニュー管理画面（テンプレート、画像登録、確認、公開・切替・停止）（完了）
- 環境分離、版管理、接続確認、監査履歴
- 設定状態の一括確認、警告、操作・復旧ガイド（完了）
- 100人検証開始前の自動確認と、人間確認を混同しないProduction Gate一覧（完了）
- 話題調査Providerの自動確認、実行smoke証跡、操作・復旧ガイド（完了）

DB接続、Session、暗号化親鍵、Cron認証等の起動に必要な秘密値は管理画面へ移さない。

### Phase 7-U: Mobile-first UI Readiness

100-user Validation開始前に、`docs/UI_DESIGN_FOUNDATION.md`を基準として主要利用導線を刷新する。

- UI-0: Design Foundation、Decision、PR分割（完了）
- UI-1: Token / Primitive / Login / Confirm / Consent（完了）
- UI-2: Authenticated App Shell / Bottom Navigation / Profile（完了）
- UI-3: Bunshin Onboarding（完了）
- UI-4: Home / Today / Mission Decision・Copy・Post・Feedback（完了）
- UI-5: SOCIAL Settingsの情報設計（完了）
- UI-6: Admin Shell / Responsive / Accessibility / Final QA（完了。実端末のProduction smokeは人間確認待ち）

UI変更では既存Coreの意味、Isolation、外部Provider境界を変更しない。FREE検証開始条件へ、スマートフォンでLoginから初回投稿完了まで到達できることを追加する。

### Phase 7-C: Adaptive Content Assistance

状態: 第1段階完了。作成支援レベル、SNS別自動選択、Missionの段階表示、形式別コピー、安全なLINE要約、支援レベル別KPIを実装済み。第2段階の段階生成は利用実績と原価確認後に再判断する。

SNS、投稿方法、BUNSHINが作る範囲を分離し、利用者が必要とする支援量で今日のMissionを実行できるようにする。

- `IDEA_ONLY | GUIDED | READY_TO_USE`の作成支援レベル — Core完了
- SocialProfileの初期値とDailyMissionのsnapshot — Core完了
- SocialProfileの初期設定API/UI（日本語3択） — 完了
- SNS別投稿セットと自動選択Domain Policy（SNS・希望形式・顔／声・時間・直近形式の決定ルール完了）
- 企画、作り方、完成版の段階表示 — 完了
- 画像・動画を作るための指示文を含む形式別コピー（完了。画像制作指示と投稿文は別Activityで計測）
- 投稿本文や指示文をPushしないLINE安全要約 — 完了
- 支援レベル別Funnel、投稿完了率、AI使用量・見積原価（支援レベル別の採用・コピー・投稿・GOOD率完了）

第1段階は既存のMissionContent必須1対1aggregateとatomic生成を維持し、表示と行動計測を段階化する。AIの段階生成は利用実績と原価を確認した後の独立判断とし、画像・動画本体生成、SNS自動投稿、管理画面からの本番Prompt自由編集を含めない。

### Phase 7-D: Evidence-based Trend Research

状態: 運用コード完了。本番ProviderのAPIキー登録・接続確認・有効化と実運用評価待ち。

- 「バズ保証」ではなく、最新情報を調べた利用者向け動画企画を提供する
- 初期FREE検証は週1回、最大3候補を基本とする
- `TrendResearchPort`と交換可能なProvider Adapter
- Provider比較spike（Grok／Exa／Firecrawl共通契約・安全変換・失敗分類）: 完了。本番利用は管理画面で明示的に有効化する
- Evidence、取得日時、有効期限、適合理由を持つ候補
- Research Run / Evidence / Candidate Core Persistence — 完了
- Workspace / User / Bunshin isolationとquery最小化
- 週次冪等Job、quota、原価、期限切れ、通常Mission fallback — 完了
- Candidate Ranking / Daily Mission任意入力 — Core接続完了
- 採用Trend Candidate / Evidence snapshot — Core Persistence完了
- Mission画面の出典表示とLINE安全要約 — 完了
- トレンド調査・候補・Mission採用・投稿・鮮度・失敗・設定原価の管理指標 — 完了
- SNS無断スクレイピング、成果保証、画像・動画本体生成は含めない

### Phase 7-E: Controlled Learning / AI Agent Compatibility

状態: E0〜E3完了。管理されたSkill Registry、外部Agent Runtime、MCPは検証後まで保留する。`AI_AGENT_COMPATIBILITY_REBASELINE.md`を正本候補とする。

- E0: AI／Agent互換境界、data policy、tool policy、budget、kill switch、Golden Dataset方針 — 文書完了
- Golden Dataset Core: version固定fixture、評価器、禁止結果テスト — 完了（外部接続なし）
- Golden Regression Runner: 全件集計、欠落・重複・未知ケース検出 — 完了（fixture-only）
- E1: 環境別・版管理Provider Registry — 完了
- E2: 既存行動から作るPreference Read ModelとLearning Proposal — 完了
- E3: 人間承認、前後KPI、rollbackを持つ変更提案 — 完了
- E4: 管理されたSkill Registry（十分な行動データ確認後）
- E5: 任意のAgent Runtime Adapter（明確な品質・費用優位確認後）
- E6: allowlist MCP Gateway（外部Agent利用が必要になった後）

AI／AgentへDB、秘密情報、LINE、SNS、本番設定、任意shellを直接操作させない。既存Activity、PostRecord、Feedback、BunshinMemoryを正本とし、重複tableを先に作らない。

### Phase 7-P: 人格学習・公式商品パック

状態: P0〜P4完了。P5は十分な同意済みデータが蓄積した後に判断する。`PERSONALITY_LEARNING_PRODUCT_PACK_REBASELINE.md`を正本とする。

- P0: 現行監査、所有権、参加同意、商品版固定、生成Context境界 — 文書レビュー
- P1: Generation Context Builder、人格Version、Memory選択、生成Snapshot
- P2: Organization所有のProduct Pack、公開Version、Rule、Asset、招待、参加、Bunshin割当
- P3: Learning Proposal、本人承認、取消、人格Version／Memoryへの安全な反映
- P4: 決定的商品ルール検査、AI意味検査、重複回避、運用画面
- P5: 十分な同意済みデータが蓄積した後の類似度・匿名集計

人格と個人Memory／Knowledgeは本人Workspaceに残し、公式商品情報はOrganization Workspace所有のProduct Packとして分離する。両者はGeneration Context Builderでのみ統合し、生成時に解決した公開Versionと参照resourceをSnapshotへ固定する。本人同意、Bunshin割当、Workspace境界が揃わない場合は生成へ利用しない。

### Phase 7-G: グループ発信

詳細は`docs/GROUP_BROADCAST_REBASELINE.md`を正本とする。

- G1: Group / Membership / Invitation / Consent / Isolation — 完了
- G2: Product Pack / Version / Rule / Asset / Assignment / 管理API・UI / Generation Context接続 — 完了
- G3-A: 本人Evidence / Advertising Classification / PR固定表記 / 固定事実照合 / 監査 — 完了
- G3-B: Daily Mission生成フローへの自動Gate接続 — 完了
- G4: 任意参加Campaign / Participation / 期間・上限・公式素材 / 管理・本人API/UI / 監査 — 完了
- G5: 投稿比率、Weekly Plan、生成、LINE/Web導線 — 完了
- G6: 類似検査、利用制限、KPI、1社先行テスト — 基盤完了（実運用検証待ち）
- G7: 承認型人格学習、本人確認、取消・復元、学習前後KPI — 完了

Phase 7-PのProduct Packと人格学習は本Phaseへ統合する。G1〜G6を飛ばしてG7へ進まない。

### Phase 7-H: グループ機能権限

SNS、ブログ、LINE、商品パックなど今後増える機能を、管理役割とは別にGroupと参加者へ割り当てる共通基盤とする。

- H1: 拡張可能な機能カタログ、Group利用方針、参加者割当、上限、期間、監査、Isolation — 完了
- H2: システム管理者によるGroup機能設定UI — 完了
- H3: Group Managerによる参加者機能設定UI — 完了
- H3-A: システム管理者・Group Managerの招待発行、本人同意、参加導線 — 完了
- H4: Group Campaign投稿生成の共通Gate接続、日次・月次利用量の原子的記録、管理画面表示 — 完了
- H4-A: SOCIAL画像生成のProvider実行直前へ同じ共通Gateを接続 — Phase 7-IのProvider実装時
- H5: BLOG追加時のカタログ登録とBLOG固有Gate接続

Platform AdminがGroupへ許可した範囲だけをGroup Managerが参加者へ再委譲できる。管理役割、Group機能権限、Bunshin Capabilityの3層を混在させず、未設定は拒否する。

### Phase 7-I: グループ限定SNS画像生成パイロット

詳細は`docs/GROUP_SNS_IMAGE_GENERATION_REBASELINE.md`を正本とする。

- I0: 既存実装監査、限定公開、所有権、予算、Storage、Go / No-Go — 文書完了
- I1: 10テーマ方式比較と検証手順の確認 — 手順・評価票完了（テーマ、予算、評価者の確定と実査待ち）
- I2-A: Domain、状態遷移、Provider Port、Isolation Policy — 完了
- I2-B: Prisma Schema、Migration、Repository、DB一意制約、rollback手順 — 完了
- I3-A: 管理レイアウトSchema、文字・画像領域、5テンプレート、フォントライセンス方針 — 完了
- I3-B: Satori / resvg / Sharpによる決定的描画 — 完了
- I3-C: 元素材・完成画像・サムネイルの非公開Storage — 完了
- I4-A: OpenAI Image Adapter、応答検査、安全な失敗分類 — 完了
- I4-B: 非同期Job、Usage、上限、緊急停止 — 完了
- I5-A: 利用者向け生成開始・進捗確認・Private download API — 完了
- I5-B1: mobile-first UI、画像の採用・不採用・再生成・保存 — 完了
- I5-B2: LINE通知から画像確認画面への安全な導線（LINEから生成は開始しない）— 完了
- I6-A: Group / Platform管理、自動Readiness、グループ・設定版別の追記型確認記録 — 完了
- I6-B: 生成受付とProvider実行直前のProduction Gate、確認取消時の即時停止 — 完了
- I6-C: 10テーマ／50テーマ比較、実端末E2E、Security実査、最終承認 — 人間による実査待ち

FREE一般ユーザーへは開放せず、Productionで明示許可したGroupと同意済みACTIVE Membershipだけを対象とする。Phase 10の一般向け画像・動画Providerを前倒ししない。越境、秘密漏えい、二重課金、重大な広告安全違反が1件でもあれば全体停止する。

### Phase 7-J: 活動継続機能

状態: J0〜J4-B2の活動確認、休止、Progress、復帰表示・LINE通知、管理集計、Rule Version管理までコード実装済み。本番通知と運用評価はProduction Gateの最新証跡待ち。詳細は`docs/ACTIVITY_CONTINUITY_REBASELINE.md`と最新の実装報告書を参照する。

- J0: 現行監査、正本、行動定義、KPI、実装境界の再基準化 — 文書完了
- J1: `MissionActivity`の確認・休み行動、週間・累積Progress Read Model、冪等性、Isolation — 完了
- J2: 今日の確認、今日は休む、活動カレンダー、今週あと何回のmobile-first UX — 完了
- J3-A: 発信ステップ、版管理された達成バッジ、7日休眠判定、Web復帰表示（実装済み）
- J3-B: 既存の同意・Quiet Hours・Quota・全体停止を再利用するLINE復帰通知（実装済み）
- J4-A: 最重要KPI「初めの7日間で3回投稿」の管理レポート・CSV — 実装済み
- J4-B1: ユーザー・Group別進捗、環境別テスト利用者除外、追記型監査、集計監視、CSV — 実装済み
- J4-B2: 週間目標・休眠日数・Step・BadgeのRule Version管理画面 — 実装済み

`DailyMission`、`MissionContent`、`MissionDecision`、`MissionActivity`、`PostRecord`、`MissionFeedback`、`LineNotificationPreference`と既存LINE配信基盤を正本とする。`daily_contents`、汎用`activity_events`、`post_reports`、別系統の通知設定は作らない。週に3回の確認は優しい継続目標とし、最重要KPIは7日間に3回以上実際に投稿したユーザー率とする。

### Phase 7-L: 外部成果計測URL連携

状態: L7のIsolation自動テスト、スマートフォンE2E手順、Production Gate接続まで完了。本番実査と確認記録は運用時に行う。

- L0: 現行監査、責任分離、所有権、URL優先順位、DB／API／UI／CSV境界 — 文書完了
- L1: External System、Allowed Domain、Member Identity、Tracking Link Core、選択Policy — 完了
- L2: 管理API、URL安全検証、停止・期限切れ、監査 — 完了
- L3: Product Pack Version方針、SNS別Placement Template — 完了
- L4: Mission生成への決定的差し込み、atomic Usage Snapshot — 完了
- L5: 本人確認画面、コピー前再検証、LINE安全要約 — 完了
- L6-A: Group管理画面、設定漏れ、利用履歴、CSV出力 — 完了
- L6-B: CSV部分取込、行別検証、部分成功 — 完了
- L7: Isolation／E2E／スマートフォン／Production Gate — コード・手順完了、本番実査待ち

クリック、申込み、購入、成約、報酬、顧客、独自Cookie、短縮URL、redirect、自動投稿、外部API同期は本Phaseへ含めない。成果帰属はGroup Membership単位とし、Bunshin／人格単位にしない。

## Phase 8: Share / Referral / Segmentation Preparation

FREE継続率を確認してから着手する。

- 個人情報・Knowledge・Memoryを含まないStrategy共有カード
- 最小Referral attribution
- 現金報酬なし
- Raw Activityに基づく将来Segmentation境界
- BunshinMemoryとMarketing Segmentを別resourceとして維持
- 7日成長レポート共有は将来候補

## Phase 9: PRO / Multiple Bunshin UX

- 無料1体、上位プラン複数体
- 複数SNS / 複数Mission
- 別案回数、Plan制限、決済
- 高度Memory

FREE継続率を確認する前に作り込まない。

## Phase V: Group Video Generation

状態: コード実装完了。完成MP4へのメタデータ埋め込みは現行Phaseの完了条件から外し、利用者検証は外部チームが行う。

グループ限定の検証機能として実装する。Phase V-1の利用者検証は外部チームが担当し、本リポジトリでは実装と自動テストを担当する。

- V-0: 動画仕様の責任境界、標準動画とAI動画の分離 — 完了
- V-1: Video Project / Scene Core、Group権限、Isolation、AI利用種別 — 完了
- V-2: 動画企画・台本生成Port／Use Case、許可済みContext、OpenAI構造化出力 — 完了
- V-3: 素材管理Core、利用者素材、承認済み素材の再利用、Private Storage、署名Upload API／本人画面 — 完了
- V-4: 動画Project作成、企画・台本生成API、AI利用記録、本人確認画面 — 完了
- V-5A: 台本承認、Render受付Core、Provider Port、重複受付防止 — 完了
- V-5B1: 外部Render Provider比較、Creatomate Adapter、RenderScript変換 — 完了
- V-5B2A: Creatomate環境別設定、暗号化保存、接続確認、管理画面 — 完了
- V-5B2B: 非同期Job、進捗確認、完成物のPrivate Storage取得、本人確認導線 — 完了
- V-5B3A: 署名付きWebhook、Provider ID照合、status API再確認 — 完了
- V-5B3B: 管理者向け運用監視、安全な手動再実行 — 完了
- V-5B3C: 完成時のみ利用回数を確定、完成通知 — 完了
- V-5C1: SNS別AI開示Policy Core、環境分離、版管理、ACTIVE一意制約 — 完了
- V-5C2: AI開示Policy管理画面、動画作成時Snapshot、本人確認案内 — 完了
- V-5C2B: 動画機能の本番準備チェック、設定不足の管理者導線 — 完了
- V-5C3: 完成MP4へのMetadata埋め込み — 現行Phaseでは実装しない。必要性と互換性を再評価する場合だけ将来Phaseで扱う

標準動画は静止画・字幕・音声・BGM・文字の動きで構成し、AI動画生成を含めない。外部レンダリングから開始し、完成したRenderだけを将来の利用回数対象とする。課金・決済は本Phaseへ含めない。

## Phase AV: AIキャラクター動画 登録獲得実証

状態: AV-1〜AV-4C2とAV-4D1をコード実装済み、AV-4D2はProvider非依存Coreの設計済み。外部Video Provider Adapter、完成動画の利用者フロー、Funnel計測、限定Pilotは未完了。AI女性キャラクターダンス動画は汎用実践Program基盤上の第一号Programとして扱う。詳細は`docs/AI_CHARACTER_VIDEO_ACQUISITION_PILOT.md`を正本候補とする。

- AV-0: 汎用Program、作り方／完成品、利用者別ゴール、販売責任、登録経路、KPI、停止条件 — 文書作成済み
- AV-1: Program Template / Version / Service Program / Offering / Enrollment Core — 完了
- AV-2: 公式Program作成、サービス採用、無料・招待限定参加API/UI — 実装済み・レビュー待ち
- AV-3A: Service Support Policy / Member Preference / Goal Definition / Member Goal Schema・Core — 完了
- AV-3B: 支援方針・利用者希望・目標管理API/UI — 実装済み・レビュー待ち
- AV-4A: 汎用AI Character Profile、基準画像、Prompt、利用許諾、Version Schema・Core — 完了
- AV-4B: AI Character、利用許諾、Prompt Version管理API/UI — 完了
- AV-4C1: 基準画像Private Storage Upload、認証済み表示、監査ログ — 実装済み・レビュー待ち
- AV-4C2: 動画機能へ基準画像Snapshot接続 — 完了
- AV-4D1: AI Character Snapshotを動画企画へ安全に接続 — 完了
- AV-4D2: Provider非依存の個別AI動画生成Core — 設計済み
- AV-4D3: fal / Kling参照画像対応Video Provider Adapter — 接続先・原価上限の運営確認後
- AV-5: 利用者別の完成動画確認・採用・ダウンロード・投稿完了API/UI
- AV-7: 媒体・動画・利用者別の登録経路とFunnel Event
- AV-8: 美女・共感・実演Variant、手動SNS実績、最低母数、7日・30日比較
- AV-9: 確認を必須とする週次改善提案
- AV-10: Feature Flagによる自社サービス・5〜10人限定検証

初期実証では同じ完成動画を無制限に配布しない。利用者ごとのProject、分身、ゴール、対象SNS、許可済み情報を使う個別生成を基本とし、AI動画Providerは接続先・原価上限・画像送信同意を運営確認後に有効化する。Programの無料提供と手動参加を先行し、Checkout、請求、返金、売上分配、代理店報酬は販売プランPhaseへ分離する。SNS投稿は本人が行い、顧客情報管理を含めない。

## Phase 7-K: 販売プラン・契約・利用権基盤

状態: K0後に契約、利用権、Credit、商品・価格・注文、決済、購入ライフサイクル、請求、督促・自動回収、返金・異議申立て、およびOEM運用支援までコードが拡張されている。一般販売の開始は、最新のProduction Gate、法務・税務・価格・返金方針、Provider設定、実運用証跡の確認待ち。詳細は`docs/SALES_PLAN_REBASELINE.md`と最新の販売・OEM実装報告書を参照する。

- K0: 現行監査、販売モデル、Tenant／Group境界、契約、座席、利用権、Credit、インセンティブ、決済、LINE、停止条件 — 文書完了
- K0-LP1: テストグループ専用公式LINEのRouting Policy、版管理Configuration、環境分離、ACTIVE一意制約、Audit、管理画面、配信時Gate、専用Webhook／Connection — 実装完了、CI・Migrationレビュー待ち
- K1: Tenant Contract / Contract Version / Seat / Entitlement Source Core
- K2: Credit Pool / Reserve・Consume・Release・Refund Ledger
- K3: Partner Attribution / Incentive Ledger。現金支払いは含めない
- K4: Product / Price Version / Order Snapshot Core
- K5: Payment Provider Port / Checkout / 署名Webhook / 返金・取消
- K6: 共通LINEへの契約・Membership・利用権の実行直前Gate接続
- K7: システム管理者、Group管理者、利用者向け管理・確認画面
- K8: 法務、税務、価格、返金、Provider、Isolation、復旧のProduction Gate
- K9以降: 一般提供するGroup専用LINE、Reseller、Private OEMを個別判断。テストグループ限定の専用LINEはK0-LP1以降で先行検証する

初期対象は個人、パートナー、Group Bundleとし、販売プラン名だけで機能分岐しない。`lineMode`、`billingMode`、`paymentOwner`、`priceOwner`、`apiCostOwner`、`entitlementSource`を分離する。既に追加されたSchema、Migration、決済接続についてもこの責任分離を維持し、一般提供前に最新のProduction Gateを通す。

## Phase P: ワタシポイント

状態: P-1〜P-7の無料限定運用に必要なコードを実装済み。本番Migration後の30人・4週間運用待ち。詳細は`docs/POINT_FEATURE_IMPLEMENTATION_PLAN.md`を正本候補とする。

- P-0: Activity対応、Credit分離、Group／Workspace境界、台帳、消費順、回収、停止条件 — 文書作成済み
- P-1: Point Account / Rule Version / Transaction / Consumption Link / Processing Event Core — 完了
- P-2: 既存Mission Activity／PostRecordからの冪等な行動連携 — 完了
- P-3: 利用者向け残高、履歴、失効予定、獲得方法、週間進捗 — 完了
- P-4A: 共通交換カタログ、予約／確定／解放／返却Core — 完了
- P-4B: SNS画像生成への交換Core接続、失敗時返却、期限切れ予約解放 — 完了
- P-4C: 追加企画生成への交換Core接続 — 完了
- P-5: Group利用可否、承認済み追加付与、企業独自特典 — 完了
- P-6: 管理、監査、CSV、予算、照合、失効、回収・取消、緊急停止 — 完了
- P-7: Feature Flag、30人上限、4週間期間、結果集計・保存による限定検証 — コード完了、本番運用待ち

WPは継続行動を促す換金不能・譲渡不能のアプリ内特典とし、販売プランの原価・利用権を管理するCreditとは別台帳にする。既存の企画閲覧、コピー、投稿完了をポイント処理へ同期依存させない。P-0の人間レビュー前にSchema、Migration、API、Job、画面へ進まない。

## Phase B: バッジ

状態: B-1〜B-6B2C-BのBadge、Reward、通知、再試行、照合・緊急停止コードまで実装済み。B-6B2C-Cの外部チームによる30人・4週間限定検証は未実施。詳細は`docs/BADGE_FEATURE_REBASELINE.md`を正本とする。

- B-0: 既存簡易Badge監査、User／Workspace／Group境界、Point分離、初期Catalog、移行方針 — 文書作成・推奨案承認済み
- B-1: Badge Definition／Version／Progress／Award／Processing Event Core — 完了
- B-2: 既存行動を根拠とする初期10共通Badge Processor — 完了
- B-3: 利用者向け獲得済み／挑戦中／おすすめ／詳細／公開設定 — 実装完了、レビュー待ち
- B-4A: Group独自Badgeの申請／SUPER_ADMIN承認／候補承認／自己付与防止／監査Core — 完了
- B-4B: Group管理画面／SUPER_ADMIN審査画面／CSV候補取込 — 実装完了、レビュー待ち
- B-5A: Badge Reward Link／Outbox／用途限定Entitlement Core（冪等発行、原価上限、失効方針）— 実装済み
- B-5B1: 報酬Outbox Worker、Lease、指数Backoff再試行、Dead化、Cron認証境界 — 実装済み
- B-5B2: Point／用途限定Entitlementの統一消費境界、失敗時補償、画像生成接続 — 実装済み
- B-5B3: 企業手動履行、再処理・監査・運用画面 — 実装済み
- B-6A: 同一Award 1回のアプリ内獲得通知、本人限定一覧、既読化 — 実装済み
- B-6B1: テストGroup限定LINE通知の候補判定、同意Gate、重複防止、配信状態Core — 実装済み
- B-6B2A: バッジLINE通知の排他取得、送信時Gate再確認、Quota、Provider送信、失敗・DEAD状態 — 実装済み
- B-6B2B: Scheduler／Job Worker接続、指数バックオフ再試行、DEAD監視 — 実装済み
- B-6B2C-A: 管理画面からのバッジLINE DLQ再処理、理由・実行者・対象試行の監査記録 — 実装済み
- B-6B2C-B: バッジ通知の読み取り専用整合性照合と緊急停止Runbook — 実装済み（本番訓練は未実施）
- B-6B2C-C: 外部チームによる30人・4週間限定検証 — 未実施

Badgeは本人の達成証明、WPは利用可能報酬として別台帳にする。初期値はPoint特典なし、共通10種類、PRIVATE／GROUP公開までとし、PUBLICプロフィール、ランキング、AI品質評価、売買・譲渡を含めない。B-0 PRのマージ前にSchema、Migration、API、Job、画面へ進まない。

## Phase 10: Publishing Provider

100人検証後に再評価する。

- SNS OAuth
- PostMesh / Ayrshare / Late等のPublishing Adapter
- 承認型自動投稿
- metrics自動取得
- Video完成物の承認後Publishing連携

## Phase 11: BLOG Capability Migration

- WordPress接続
- キーワード・記事・画像・公開処理
- SNS反応から記事化 / 記事からSNS展開
- 既存ブログ資産の段階移植

## 将来Phase

- Marketing Campaign Engine
- Goal / KPI Engine
- Need Detection / Offer Matching
- LINE Marketing、LP、Lead Generation、Sales
- Customer Support、Recruit

## FREE MVPで実装しないもの

- SNS完全自動投稿、SNS OAuth
- PostMesh、Ayrshare等のPublishing Provider
- 自動画像・動画生成、Canva完全連携
- 高度SNS Analytics、コメント自動返信
- 課金、代理店制度、ランキング、現金紹介報酬
- BLOG移行、Marketing Campaign Engine

## FREE MVP KPI

```text
Registration
-> Bunshin Creation
-> SOCIAL Activation
-> Strategy Completion
-> Strategy Approval
-> First Mission View
-> Mission Acceptance
-> Copy
-> Posted
-> D7 Active
```

最重要KPIは「7日間でBUNSHINの指示に従って3回以上実際に投稿したユーザー率」とする。

補助KPI:

- Strategy承認率
- Mission採用 / 不採用率
- Copy率、採用からCopy率、CopyからPosted率
- Mission完了率
- D1 / D7 / D30
- 別案率、Feedback GOOD率
- 1 Active User当たりAI原価

成功条件はSNSの完全自動化ではなく、BUNSHINの指示によってユーザーが継続的に行動することである。

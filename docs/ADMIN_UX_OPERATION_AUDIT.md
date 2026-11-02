# 管理画面と運用フローの横断監査

監査日：2026-11-03 JST。基準：取得時点の最新`origin/main`、`7d397821b144361dcf5643dc92ce4ac95ebcb334`（PR #1445後）。本書と他3文書は監査・計画であり、Runtime、API、DB、設定、migration、deploymentを変更しない。

## 1. 結論と調査の限界

最初に減らすべき負担は、日常設定での理由入力、学習設計承認の技術証跡の手入力、設定全体の更新、異なる管理処理に共有される負荷制限である。認可や課金保護を外さずに改善できる。

一方、本部メニューはすでに4分類、OEM環境作成は1回の送信、通常サービス設定も1回の保存になっている。「どの操作も多段承認」「OEMは何も変更できない」という評価は実装と一致しない。新しい管理基盤を追加せず、この既存構造を整理する。

調査対象の画面ファイルは本部48、サービス管理40、団体/OEM側5の計93件。画面定義を棚卸しし、以下28項目について主要なUI→HTTP/Server Action→Application/Repository→停止条件を追跡した。全APIの全分岐を実行した網羅監査ではない。

状態の区別：

- **実装確認**：基準SHAの画面、route、呼び出し先を確認したもの。画面が存在してもFlag・権限で非表示の場合がある。
- **条件付き所見**：設定やロールの組み合わせで成立するコード上の問題。実運用の発生件数は未確認。
- **設計のみ**：本4文書の改善案、既存文書にしかない将来案。本番で使える機能とは扱わない。
- **本番・頻度・実測は未確認**：本番へのログイン、DB照会、アクセスログ収集、管理者の操作観察は今回行っていない。「低頻度」「使われていない」「クリック数の実測改善」は断定しない。

## 2. 参照仕様との関係

正本`BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`、`ARCHITECTURE_PRINCIPLES.md`、`IMPLEMENTATION_ROADMAP.md`、`DECISION_LOG.md`を参照する。1 User : N Bunshin、Workspace/Service/会員/本人の分離、Provider境界、冪等性は維持する。

過去の承認UI方針は`ai-training/ADR_LEARNING_DEFINITION_REVIEW_UI.md`と実装報告にある。入力SHAが人間申告であり公開SHAの自動検証ではないことも同ADRに明記されている。今回の指示は手入力を自動取得へ置き換える再設計の根拠になるが、旧APIの必須条件を画面だけで削除してよいという意味ではない。

Hassyと共通SNSの責務は`HASSY_SHARED_CAPABILITY_BOUNDARY_DESIGN.md`を尊重する。OEM一括作成は`OEM_ONBOARDING_IMPLEMENTATION_REPORT.md`と現行コードを照合した。過去報告の「次の候補」は未実装の証明として使わない。

## 3. A 管理画面と導線

| ID  | 実装ファイルと呼び出し経路                                                                                                                                                                            | 現在の目的・実際の条件                                                                                                    | 操作性の評価と削減候補                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | `apps/web/app/ui/app-shell.tsx`の`adminNavigationGroups`→各`/admin`画面                                                                                                                               | 4分類・23リンク。管理中の分類だけ開くdetails。APIごとの認可は別                                                           | 分類数は目標達成済み。監査・API接続を「詳細管理」へ寄せ、日常の会員・配信・設定を上位にする。48画面の存在と23メニューリンクは別の数                                          |
| F02 | `app/s/[serviceSlug]/manage/page.tsx`→`service-management-home-data.ts`→`service-management-home-repository.ts`→`service-management-home-view.tsx`                                                    | 運用集計、開始準備、要対応、26件のメニュー候補。Repositoryの主要Promise.allは28取得。1件の失敗で呼び出し全体がrejectする  | 開始済みサービスにも長い準備・SNS集計を表示。まず適用機能の取得だけに絞る。補助集計の失敗は「集計できません」とし、0件や正常に偽装しない。認可・主要状態の失敗は分離して維持 |
| F03 | 同data→`src/services/service-management-navigation.ts`                                                                                                                                                | businessDaily、fortune、promptOnlyImages等で候補を絞る。AI研修専用の分類入力はない。training判定はdata内の別用途には存在  | 非該当メニューが出る条件付き所見。研修サービスをSNSの不足項目で注意表示しない。新Flagを増やす前に既存Program/Feature/Service設定で投影する                                   |
| F04 | `/admin/oem-onboarding`の`provisionOem`→単一Prisma transaction。別入口は`src/http/service-create.ts`                                                                                                  | 団体・Group・サービス・Brand・権限・下書き契約・招待を自動作成。SUPER_ADMIN、入力、slug一意性等を確認                     | 一括作成はすでに実装済み。団体→Group→サービスの手作業を必須にする再設計は不要。ウィザードを重ねず、既存初期値の再利用と連絡先再入力の削減を検討                              |
| F05 | `manage/settings/service-settings-editor.tsx`→`PATCH /api/services/{slug}/settings`→`src/http/service-settings.ts`→`ServiceFoundationService.save`→`packages/database/src/service-foundation-save.ts` | 保存1回。理由必須。ロゴ・案内文だけでも登録・配信・質問を含む大きいpayloadを検証し、関連設定と監査を同一transactionで保存 | 二重承認はない。通常項目の理由を自動化し、無変更項目の再検証・書込を減らす。重要な公開・契約項目を通常変更と混ぜない                                                         |
| F06 | `manage/weekly-report/weekly-report-delivery-editor.tsx`→`src/http/service-weekly-report-delivery.ts`→同じFoundation.save                                                                             | 曜日・時刻・有効状態をPUT。理由は定型で初期入力済みだが必須。07:00–20:59。LINE未準備でも設定保存はできる                  | 理由の手修正は通常不要。保存はすでに1回。Foundation全体の監査snapshot・upsertを経由するため、UIの理由欄だけ消して完了とはしない                                              |
| F07 | `app/(app)/organizations/[workspaceId]/manage/organization-manage-view.tsx`→`organization-manage-actions.ts::saveProfile`                                                                             | 団体名等に5文字以上のreasonを必須検証するが、そのreasonはworkspace.updateにも後続監査にも渡していない                     | 明確な撤廃候補。現行の範囲で理由入力は業務効果がない。権限・入力検証は残す。新しい監査テーブルを足す理由にしない                                                             |

## 4. B 権限と承認

| ID  | 実装ファイルと呼び出し経路                                                                                                                                                                                                                                   | 実際のブロック条件                                                                                                                       | 評価と方針                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F08 | `manage/programs/learning-definition-review/{page,card,client}.tsx/ts`→`api/services/[serviceSlug]/ai-training/definition-approvals/route.ts`→`src/http/learning-definition-approval-admin.ts`→`packages/database/src/learning-definition-approval-admin.ts` | 40桁SHA、80文字以内の証跡キー、revision/digest、チェック7項目、最終確認を必須にする。HTTP/Repositoryも検証                               | SHA・証跡キーはサーバー取得/生成へ。本人が内容を承認する行為は維持。学習内容の承認からAI実行・参加登録・公開を自動開始しない                                          |
| F09 | 同Cardのrefresh→select→7check→final→submit→refresh                                                                                                                                                                                                           | 初期読取も手動。登録receipt受領後も現在状態のGETを要求。通信不明時は同一body/operationIdのみ再送                                         | 初回取得と保存後の整合性確認を自動化。7つの閲覧項目は残しても7つの必須チェックは最終確認へ集約可能。receiptの過去状態と現在状態は区別する                             |
| F10 | `manage/programs/personal-learning-preparation/page.tsx`と各Card→`src/http/personal-learning-pilot-operations.ts`→既存Pilot Repository。入口は`personal-learning-preparation-access.ts`、`personal-learning-program-preparation.ts`                          | 準備Flag・authority一致・実行Pilot2Flagの停止、START時は準備用3Flagも停止。READ/STOPは他操作と違う条件。コマンドは証跡キー必須           | 日常設定をPilot開始手順に巻き込まない。証跡キーは自動化。STARTの費用・対象確認、STOPの独立性、変更中の再照合は残す。環境文字列を運営者が調整する設計から段階移行      |
| F11 | `src/services/public-service.ts::resolveManagedServiceContext`→Foundation.save→`service-foundation-save.ts`                                                                                                                                                  | HTTP側はSERVICE_OWNER/ADMIN、保存側はSUPER_ADMINまたは旧Group role=MANAGERを要求                                                         | serviceRoleと旧roleが不一致なら画面に入れても保存できない可能性。実データで全管理者が該当するとは断定しない。サービス内の許可操作を統一認可で完結させる負例テストが先 |
| F12 | 支援提案/ロードマップpage→`src/http/managed-feature-policy.ts`→`packages/database/src/managed-feature-policy.ts`                                                                                                                                             | OEM側はHQ設定nullで保存不可。ロール、Feature ACTIVE、revision、Templateも確認。`use-managed-policy-editor.ts`にもHQ=null時の無効化がある | 本部許可の境界は維持。承認済み標準値の適用をサービス作成時に自動化し、毎サービスの本部手作業を削減する。未承認の許可を勝手に生成しない                                |
| F19 | `manage/post-approvals/page.tsx`のsavePolicy/review→CampaignPostingApprovalPolicy/Request/Audit                                                                                                                                                              | サービス管理者が確認要否を1回で保存可能。レビューは対象ServiceのPENDINGだけ。reviewNoteは空を許す                                        | 一律必須承認ではない。低リスク文面と商品・広告・規制領域を区別し、現行policyの提供範囲を再設計。既存の法的・表示リスクがある承認は維持                                |
| F26 | preparation、LINE、post-approvals等のpageで`resolveManagedServiceContext(...).catch(() => null)`                                                                                                                                                             | 認可失敗だけでなくDB障害等も不存在/ホームへ変換し得る。definition-review等は既知エラーだけを捕捉                                         | 制限ではなく診断の混線。既知のNOT_FOUND/FORBIDDENだけ案内へ変換し、他は既存エラー境界へ。役割エラーと障害を分ければ不必要な再承認・再入力を防げる                     |

## 5. D 運用制限と停止条件

| ID  | 実装・呼び出し経路                                                                                                                                                     | 実際の条件と目的                                                                                                                   | 見直し方針                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F13 | `manage/recommendations/policy-editor.tsx`、`packages/capability-social/src/recommendation-policy.ts`→runtimeの`social-recommendation-policy.ts`/Barrier関連Repository | 採用件数2–100、抑制30–365日。OEMはHQより緩和不可。不正設定は新規提案停止                                                           | 30日の固定下限は契約・予算とは別のUX判断。重複質問抑制を残し、短縮の妥当性を評価する。既存snapshotの抑制日数は遡及変更しない                                                                    |
| F14 | `src/services/hassy-roadmap-settings.ts`→`hassy-roadmap-policy-store.ts`→ManagedFeaturePolicy Repository                                                               | 生成/判断1–1000、活動日1–365、紹介0–1000。保存先はFeature config、HASSY Template必須。ロードマップ自体は権限・報酬付与ではない     | 進捗指標と利用権限を混ぜない。初期値・上限は商品方針として判断し、任意の紹介目標を基本機能のロックに使わない                                                                                    |
| F15 | `src/http/managed-feature-policy.ts`と他読取HTTP→`src/http/member-usage-read-limit.ts`                                                                                 | 同一singletonをactorUserIdだけで共有。10回/60秒、同時1件、map最大1000。GETだけでなくPUTもreserveする。read-onlyの分散quotaではない | 異なるService・設定の通常操作も互いに429になり得る。目的とServiceを区別した既存guardの適用へ整理。負荷制御自体を撤廃せず、Retry-Afterを表示し限定再試行                                         |
| F16 | settings UI/HTTP、public-serviceのeffective設定→`business-daily-service-settings.ts`                                                                                   | businessProfileEnabledだけでPUBLIC、招待/紹介OFF、配信ON・DAILY固定、完成文・TEXT_ONLY、BGM等OFFを強制                             | 事業プロフィールを使うことと「企業向け無料の運用方針」を結合している。契約制御とは分離候補。既存サービスの配信/課金/紹介を勝手に有効化しない                                                    |
| F17 | `manage/line/page.tsx`→既存`admin/groups/[groupId]/line/group-line-editor.tsx`→`src/http/group-line-configurations.ts`/`/api/admin/groups/.../line-rich-menu/default`  | モード保存→秘密値保存→接続テスト→Activate→標準menu公開。公開時はconfirmとreason prompt。DEDICATED選択時pilotEnabledはAPIが自動設定 | URL自動生成は既存。秘密値変更は重大操作として残し、画面の案内・接続結果・次の操作を集約。標準menu公開のconfirm＋理由promptは差分1画面へ。サービス画面からadmin経路を使う部分の認可も回帰確認    |
| F18 | `manage/line/service-line-broadcast-editor.tsx`→`src/http/service-line-broadcasts.ts`→Audience/Operations Service・Repository・Job                                     | 手動宛先preview、confirm、理由、expectedRecipientCount=1–500、confirmed=true。Job maxAttempts=3                                    | 対象誤り・有料送信・重複配信を防ぐ重要操作。最終確認1回と対象再照合を維持。500は現行処理上限であり契約人数と別。単純削除で大型一括送信を許可しない                                              |
| F23 | `/admin/production-gate`→`production-gate/evidence-editor.tsx`→`src/http/production-gate-evidence.ts`→`legal-governance.ts`/`production-gate-evidence.ts`              | 現在の公開SHAをサーバー取得、13項目（最終承認含む）。最終承認は他12件が有効な場合だけ。別SHAへ確認を引き継がない                   | SHAはここでは手入力ではない。今回追跡した通常settings保存の経路にこの証跡確認はない。全業務の停止Gateと断定しない。自動検査の取込と変更影響別の再確認を検討し、実機・同意・最終公開判断は分ける |
| F24 | `src/services/personal-learning-call-admission.ts`→`packages/database/src/personal-learning-call-admission.ts`/`personal-learning-call-budget.ts`→共通AI利用記録       | 許可Provider/model、予算・同時実行・未確定原価・予約、Pilot/Program/Enrollment同意等を照合。決済/生成失敗時の確定・再送条件を制御  | 実費発生と無制限再試行を防ぐため維持。ユーザー向けの不足案内や通常設定の利用可否と分離し、原価UNKNOWNを0円にしない                                                                              |
| F25 | `src/http/service-line-delivery-retries.ts`→RequestLineDeliveryRetry/Repository、LINE pageのretryable抽出                                                              | 送信済み・取消済みを除外、失敗分類、attemptごとの既存retry記録を照合。理由3文字以上。配信Jobの回数にも制限                         | 理由は既知の復旧理由を自動補完可能。受信者・本文・成功状態不明の場合を無条件再送しない。サービスごとの障害と共通Provider停止を区別                                                              |
| F27 | `/admin/oem-onboarding`の初期entitlement、`group-feature-entitlement.ts`、契約/団体管理                                                                                | 初期maxGroups=1、maxOperators=5、maxMembers=100、maxServices=1、AI月10000/画像1000/動画100。Feature側にも日/月・期限・状態がある   | テンプレート初期値と契約値・Provider予算は別。現行値が全顧客の正当な契約上限とは未確認。許可内の変更はOEM自身へ、契約超過は本部へ。制限の出所をUIへ投影                                         |

## 6. C 監査と保持

| ID  | 実装・用途                                                                                                       | 確認した停止・重複・保存条件                                                                                                                                                              | 判断                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| F20 | `packages/database/prisma/schema.prisma`、`admin-audit-log.ts`、`/admin/audits`                                  | 名称にAuditを含むモデルは26。汎用変更履歴画面が集約するのはADMIN_ACCESS/USER_OPERATION/AI_CONFIGURATION/LINE_CONFIGURATION/LINE_RICH_MENU/ACCOUNT_DELETIONの6分類。Program・Service等は別 | 26モデルの存在は26重記録の証拠ではない。資源別監査を一括統合しない。必要時に既存の表示投影を統合し、通常画面から詳細を退避                         |
| F21 | `service-foundation-save.ts`と`managed-feature-policy.ts`、`learning-definition-approval-admin.ts`               | 設定/承認と監査が同一transaction。監査create失敗時は業務更新もrollback。週次時刻変更でもFoundation前後の全snapshotとBrand/Registration upsertを扱う                                       | 重要操作のatomicityを維持。通常設定は無変更書込・不要snapshot項目を減らす候補。全監査をfire-and-forgetにしたり、失敗をcatchして成功扱いしない      |
| F22 | `support-case-retention.ts`、`improvement-feedback-retention.ts`、`training-retention-*`、`fortune-retention.ts` | SupportはRESOLVEDから90日、Feedback原本は90日・候補/操作はexpiresAt、Trainingは対象範囲別削除、占いは設定日数。汎用Audit全体を一律削除する処理は今回確認せず                              | 保持はすでに一部実装済み。全ログ無期限とも長すぎるとも断定不可。記録種別、紛争/請求保持、利用者同意、バックアップを先に一覧化し、既存purgeを再利用 |

### 監査モデルの分類

- 本部/本人/秘密設定：PlatformAdminAudit、UserOperationAudit、AiProviderConfigurationAudit、LineConfigurationAudit、AdminEmailConfigurationAudit、AccountDeletionOperationAudit。
- Service/団体/機能/配信：ServiceConfigurationAudit、OrganizationEntitlementAudit、GroupMembershipAuditLog、GroupFeatureAuditLog、GroupKnowledgeAuditLog、GroupLineConfigurationAudit、LineRichMenuAudit、ServiceLineBroadcastAuditLog。
- 契約/請求/ポイント/特典：CommercialPricingAudit、OrganizationPaymentConfigurationAudit、CommercialBillingAudit、CampaignPostingApprovalAudit、PointBalanceRepairAudit、BadgeAdminAuditLog、ExternalTrackingAuditLog、ServiceReferralQualificationAudit。
- 学習/コンテンツ/支援：ProgramAuditLog、PersonalLearningToolFeatureAudit、AiCharacterAuditLog、SocialActivityOemSupportCandidateAudit。

ProductionGateEvidence、利用台帳、Job、費用予約などはこの名称集計に含まない。状態の正本・費用記録・障害ログを同じ「監査ログ」とみなして削除しない。

## 7. E 初期設定と情報の重複

F04/F16/F17/F27に加え、次を確認した。

| ID  | 経路と条件                                                                                                                                                                                 | 評価                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F28 | `onboarding/service-onboarding-form.tsx`→`src/http/service-onboarding.ts`。事業profileと自由質問を別に保存。MINIMALかつ非編集では質問に未回答値を入れて後回し、FULL/編集では質問回答も検証 | 業種・事業名等と同じ質問を設定した場合に重複入力が生じ得る。現行のMINIMALによる先送りは実装済み。全サービスで重複しているとは断定しない。構造化profileを正本として重複質問を省く案を優先し、別サービスの回答を流用しない |

開始準備は`service-launch-readiness.ts`が案内を計算する。少なくともFoundation.saveを呼ぶ通常設定APIは、この一覧の全項目完了を保存条件にしていない。FAQ未登録等の「開始準備の未達」と、予算/認可などの実行拒否を別表示にする。

## 8. 操作数の静的基準

下表はコード上の操作段階の下限。画面上の物理クリック数ではない。入力欄のfocus、文字入力、scroll、selectの開閉、認証は別。実利用者の計測値として扱わない。

| 対象・開始点             | 現行の機能操作                                                                        | 計画後の目標                                                | 条件                                                              |
| ------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| 設定画面上の基本設定変更 | 保存1回＋理由入力1欄                                                                  | 保存1回、通常理由入力0                                      | 現行でも多段承認なし                                              |
| 週次配信設定画面         | 保存1回、理由欄は定型入力済み                                                         | 保存1回、理由欄非表示                                       | 時刻入力回数の削減とは数えない                                    |
| OEM団体情報画面          | 保存1回＋未使用理由入力                                                               | 保存1回、理由入力0                                          | 現行reason未使用                                                  |
| 学習設計承認画面から1件  | 読取1＋選択1＋チェック7＋最終確認1＋登録1＋現在確認1＝12操作、技術入力2欄             | 選択1＋承認1＝2操作、技術入力0、必要な読取は自動            | 対象不変・正常応答時。受理/現在状態を区別し、競合・未知結果時は別 |
| 管理ホーム→学習設計承認  | 実践プログラム→Personal Learning準備→レビューの3遷移                                  | 研修の要対応からレビューへ1遷移                             | 既存リンクとロールを維持                                          |
| 既存の専用LINE設定開始   | モード保存、秘密値保存、接続確認、Activate、menu公開の別操作。公開にはconfirm＋prompt | 秘密値の保存と接続確認を一画面で誘導、外部公開は最終確認1回 | 秘密値を自動生成したり接続確認を省く目標ではない                  |
| 一斉配信editor           | 対象preview→送信→confirm＝3操作＋理由入力                                             | 自動preview→差分確認→送信確定1回                            | 人数差分・費用・重複防止の再確認は維持                            |

## 9. 優先度と未解決事項

優先はF07の未使用入力撤廃、F05/F06の通常理由自動化、F08/F09の技術証跡自動化、F02/F03の取得・表示整理、F15の制限scope分離。仕様判断が必要なF10/F13/F16/F27は、利用開始・契約・予算への影響を切り分けてから実装する。

本番Flag値、契約値、実際のロール不一致件数、使用頻度、処理時間、保存量、監査障害率、実クリック数は未取得。現状監査だけで削除・値変更・公開の判断を確定しない。各PRで対象タスクのPC/スマホの操作記録、API負例、障害時の回復、監査整合性を確認する。

## 10. 今回の検証

画面/route/Repositoryの静的追跡、ファイル棚卸し、既存Webテスト10ファイル89件の成功を確認した。管理navigation/view-model/readiness、読取制限、Hassy目標、企業向け設定、管理ロール、学習承認API、設定schema、SNS支援policy APIを対象とする。合成テストであり本番有効化やクリック数の実測を証明しない。DB統合・Provider送信・実ブラウザ・本番操作は実施していない。

## 付録 管理画面ファイルの棚卸し

これはroute実装の在庫であり、全画面の本番有効化や業務頻度の証明ではない。次の一覧は同一SHAの`rg --files apps/web/app -g page.tsx`から抽出した。

### 本部 48画面

- `apps/web/app/(app)/admin/advertising-safety/page.tsx`
- `apps/web/app/(app)/admin/activity-rules/page.tsx`
- `apps/web/app/(app)/admin/videos/page.tsx`
- `apps/web/app/(app)/admin/access/page.tsx`
- `apps/web/app/(app)/admin/videos/disclosures/page.tsx`
- `apps/web/app/(app)/admin/users/[userId]/page.tsx`
- `apps/web/app/(app)/admin/users/page.tsx`
- `apps/web/app/(app)/admin/trends/page.tsx`
- `apps/web/app/(app)/admin/support/page.tsx`
- `apps/web/app/(app)/admin/images/samples/page.tsx`
- `apps/web/app/(app)/admin/images/page.tsx`
- `apps/web/app/(app)/admin/services/page.tsx`
- `apps/web/app/(app)/admin/rewards/page.tsx`
- `apps/web/app/(app)/admin/guide/page.tsx`
- `apps/web/app/(app)/admin/reports/page.tsx`
- `apps/web/app/(app)/admin/programs/page.tsx`
- `apps/web/app/(app)/admin/production-gate/page.tsx`
- `apps/web/app/(app)/admin/groups/[groupId]/line/page.tsx`
- `apps/web/app/(app)/admin/product-packs/page.tsx`
- `apps/web/app/(app)/admin/points/page.tsx`
- `apps/web/app/(app)/admin/page.tsx`
- `apps/web/app/(app)/admin/groups/[groupId]/features/[featureKey]/page.tsx`
- `apps/web/app/(app)/admin/groups/[groupId]/features/page.tsx`
- `apps/web/app/(app)/admin/groups/page.tsx`
- `apps/web/app/(app)/admin/fortune/page.tsx`
- `apps/web/app/(app)/admin/commercial-profitability/page.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/limits/page.tsx`
- `apps/web/app/(app)/admin/external-tracking/page.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx`
- `apps/web/app/(app)/admin/organizations/page.tsx`
- `apps/web/app/(app)/admin/email/page.tsx`
- `apps/web/app/(app)/admin/oem-onboarding/page.tsx`
- `apps/web/app/(app)/admin/deletions/page.tsx`
- `apps/web/app/(app)/admin/line/page.tsx`
- `apps/web/app/(app)/admin/connections/page.tsx`
- `apps/web/app/(app)/admin/legal/page.tsx`
- `apps/web/app/(app)/admin/commercial-billing/products/page.tsx`
- `apps/web/app/(app)/admin/commercial-billing/pricing/page.tsx`
- `apps/web/app/(app)/admin/commercial-billing/page.tsx`
- `apps/web/app/(app)/admin/campaigns/page.tsx`
- `apps/web/app/(app)/admin/badges/rewards/page.tsx`
- `apps/web/app/(app)/admin/badges/page.tsx`
- `apps/web/app/(app)/admin/audits/page.tsx`
- `apps/web/app/(app)/admin/alerts/page.tsx`
- `apps/web/app/(app)/admin/alerts/morning-digest/page.tsx`
- `apps/web/app/(app)/admin/ai/tool-features/page.tsx`
- `apps/web/app/(app)/admin/ai/page.tsx`
- `apps/web/app/(app)/admin/ai/benchmark/page.tsx`

### サービス管理 40画面

- `apps/web/app/s/[serviceSlug]/manage/weekly-report/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/video-operations/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/video-deliveries/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/external-tracking/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/members/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/email/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/training/skills/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/credits/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/line/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/training/retention/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/training/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/characters/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/training/expiry/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/legal/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/campaigns/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/templates/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/learning-conversations/[requestId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/learning-conversations/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/badges/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/90-day-report/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/knowledge/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/settings/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/program-goals/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/image-operations/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/improvement-feedback/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/fortune/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/roadmap/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/product-packs/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/improvement-overview/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/personalization/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/fortune/manual/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/points/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/post-approvals/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/referrals/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/referral-rewards/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/recommendations/page.tsx`

### 団体とOEM側 5画面

- `apps/web/app/(app)/organizations/[workspaceId]/usage/page.tsx`
- `apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx`
- `apps/web/app/(app)/organizations/[workspaceId]/manage/page.tsx`
- `apps/web/app/(app)/organizations/page.tsx`
- `apps/web/app/(app)/organizations/invitations/[token]/page.tsx`

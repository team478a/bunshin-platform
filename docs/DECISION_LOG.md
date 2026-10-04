# BUNSHIN Platform Decision Log

## Feedback maintenanceの非互換移行は停止証明を本番gateにする

- 2026-10-03、PR #1095 merge後main `6fd55288a47faee12f4379fc5a384d4b538265d5`。次のゴールはリリースRunbookのみ。本番停止/DB操作/deployを承認済みと扱わない。
- `jobs/run`はworker前にretention.schedule/履歴cleanupを実行する。scheduleだけの停止、lease5分待機、health readinessだけでは安全な移行を証明できない。
- production buildは新アプリ公開前にDBを移行する。既存機能で旧deployment/手動起動を含む停止を証明できない場合はNO-GOとし、停止guardの先行PRを別判断にする。secret変更や新Workerへ先回りしない。
- DB移行後は旧アプリpromoteを一般rollback手順として使わない。新契約対応版を維持し、不可逆削除/backup復元後の再削除を別承認する。`docs/improvement/IMPROVEMENT_MAINTENANCE_RELEASE_RUNBOOK.md`が対象移行の運用条件。

## Feedback purge Job限定のmaintenance主体と終端履歴保持

- 2026-10-03、PR #1094 merge後main `f1bb8f9b2d5c4d606fd7cae4f2ec9fbcf635917e`。ユーザーはpurge限定の本人参照なし、既存対象の限定移行、終端後180日保持、稼働中Job非削除、通常Jobへの非横展開を「はい」で承認した。
- 通常JobはrequestedBy必須を維持。purge専用のnull主体はJob種/payload/key/CapabilityなしをDB制約とApplication境界で限定し、公開enqueueは予約種を拒否する。System Userや他Workspaceの主体を借りない。
- 移行は既存Groupに所有scopeが一致し、正規v1 payload/日次key・逆参照なしのpurge Jobだけ。想定外のpurge行はmigrationを停止し、内容をログへ出さず別途確認する。通常Jobの本人参照/退会規則は変更しない。
- purgeの終端日時を固定する。旧DEADや終端日時不明は移行日時から保守的に180日保持。新規終端後の復帰/時刻書換を拒否する。内部Cronだけが環境限定・最大100行・逆参照なし・期限超過終端Jobを削除し、稼働中/通常Jobや同日keyを消さない。不可逆cleanupの本番適用は実施しない。
- schema変更と旧workerは同時稼働非互換。承認済みリリースではCron/workerを停止しmigration→新アプリ→再開する。rollbackは旧アプリだけを戻さず、新契約を維持してcleanup停止を先に行う。本人参照の復元は推測しない。

## 期限処理の孤立scope: 検出とJob履歴の現行契約を先に確定する

- 2026-10-03、PR #1093 merge後main `f135b2e73ce7292d19aeeef0edde6fbe87598c32`。既存退会計画はUserをsoft DELETEDとし、Generic Jobのpseudonymous参照を保持する。Feedback/auditの90/180日承認だけで全Job履歴の削除期限が承認されたとは扱わない。
- 今回は内部Cronに「期限超過かつWorkspaceMembershipなしのscopeがあるか」のbooleanだけを追加し、失敗時はnull（未確認）とする。個人/Service ID・件数・原本を返さず、RepeatableReadの同じsnapshotで検出と登録候補を読む。別WorkspaceのUser、勝手なSystem Account、権限変更で孤立を隠さない。
- 実Repositoryの退会取消/完了、Job requester FK、翌日の再登録と履歴保持を隔離DBでcharacterizationする。Job nullable化・既存履歴消去・日数・停止時の取消規則は今回変更しない。後続の最小案は専用maintenance Job主体と限定保持契約の設計で、通常User Jobを巻き込まない。運用承認前に不可逆削除へ進めない。

## Feedback期限処理: 既存Jobで削除と継続を原子的に確定する

- 2026-10-03、PR #1092 merge後 `38a04b86e5e468f85ab4249ede469542390fce8c`。承認済み90/90/180日を変更しない。
- Cron認証後の既存Job workerへ内部schedulerと専用executorを接続する。新Worker/キュー/公開操作口/schemaは作らない。通常enqueueのACTIVE所属制約は緩めず、期限処理専用のtrusted DB経路で停止済みService/Workspaceも扱う。
- Job行→Service行の順にlockし、保存済みpayload/scope/environment・leaseを照合してbounded purgeとSUCCEEDED/継続を同txで確定する。commit直前の時計でlease切れなら全rollback。正常なbatch継続は障害試行を消費せず、失敗は既存FailJobの有限backoffへ渡す。
- 日次key、同scope未完Job除外、期限の古いscope優先で登録を限定する。requestedByは既存Workspace所属の本人参照を利用するが、本人の能動操作/権限委譲とは扱わない。所属自体がない孤立scopeは登録できず運用条件として報告する。本番適用/周期/負荷/バックアップ削除保証は別途確認する。

## Improvement Candidate保存: 承認された保持方針と削除を同じ境界へ接続

- 日付: 2026-10-03。基準main `4d9bfaa1d2316a62b11cee71726e2f9228903648`。ユーザーは原本受付90日、候補週終了90日、限定監査操作180日、本人削除/退会完了時の原本削除・候補失効・監査本人参照除去、組織所有の手動確認維持を提示後「進めてください」と承認した。
- 固定版 `feedback-retention-v1` をサーバー内部で使用。原本は期限超過時に読取対象外、候補も保存/再送で期限延長しない。新表はCandidateと最小操作監査のみ。原本リンクやEvidence JSON/count/本人情報を複製しない。
- 同Service行のTransaction lockと原本変更DB triggerにより書込・原本削除を直列化し、直接削除/cascadeでも週全体hashを消去・STALE化する。管理者/User/Workspace/Service設定の行lockで失効と操作の順序を固定する。DB失敗は全rollbackし自動再実行しない。
- 既存退会完了Transaction内で本人原本削除と監査actor消去を実施。組織資産のmanual reviewを迂回しない。HTTP/UI書込・承認・自動修正・Provider・本番接続/デプロイは今回対象外。隔離Postgres CIの検証と本番適用を分ける。

## Improvement Candidate純粋契約: Repositoryの原子性をPortとして要求し、DB実証と分ける

- 日付: 2026-10-03。PR #1090 merge後の基準main `50523d5fbcc7530a7bb9ecb6e612e0d9faa0069b`。
- 初回は既存Candidateの人手確認/対象外操作契約のみ。作成・STALE再開・承認・保存DB・HTTP/UIは追加しない。domainの状態/CASとApplicationの限定Feedback検証を分離し、SNS/Providerを共通domainに埋め込まない。
- 原子的Portに現行認可・最新Evidence・候補・再送記録・CAS/audit一体commitを要求する。fakeはこの契約を検証するだけで、現行Prisma Adapterの別tx読取を原子的保存へ接続した証拠にはしない。
- trustedな承認済み方針がない場合は操作拒否。保持日数のdefaultを設けず、仮の90/180日を実設定にしない。同一操作再送も権限・期限・最新週全体/bucket根拠・表示条件を再確認し、後続更新後の古い再送は競合とする。
- 結果はopaque候補ID・CAS版・確認状態だけ。原本ID/hash/自由文は結果に出さない。確認済みは実装承認ではない。本番/schema/削除連携は別条件。

## Improvement人手確認候補: 保存より先に削除とRevision失効の契約を固定する

- 日付: 2026-10-03、状態: 設計提案（保持日数/削除方針は未承認）。基準main `f50f1ee5d58f02f0e9abfc309f8de31f405e963d`、PR #1089 merge後。
- `docs/improvement/IMPROVEMENT_TRIAGE_CANDIDATE_DESIGN.md`を参照。本人Feedbackの限定bucketを人手トリアージ候補として分離し、REVIEWEDを確定BUG/APPROVEDへ自動昇格させない。既存OEM支援CandidateやPlatform Admin監査を保存/認可の代替にしない。
- 原本cascadeはBunshin物理削除時だけで、既存退会purgeのsoft deleteはFeedback削除を保証しない。永続化前に保持・原本削除・候補失効・限定audit消去の連携をレビューする。原本ID/旧Evidence/hashを監査へ複製しない。
- 同Service owner/admin再認可、週全体/対象bucket Evidence版、Candidate CAS版、操作再送UUIDを分離する。読取後に別txで保存するだけでは競合を解決せず、削除/所属失効も含むTransaction/lock順序を後続で検証する。少数セル/不完全は作成操作からも迂回させない。
- 次はschema/HTTP/UIなしの純粋契約・fake否定テスト。原本/候補90日、限定audit180日の値は運用提案であって確定方針ではない。実装承認・自動修正・通知・新Worker/Providerは別判断。今回は文書だけ。

## Improvement Feedback確認画面: 少人数と原本参照をサーバー側で伏せる

- 日付: 2026-10-03、状態: 実装PRで検証。
- PR #1088のEvidenceを同ServiceのADMINISTRATION管理Resolver＋既存AdapterのDB再認可で読み取り専用表示する。Content Editor/参加者/本部の暗黙横断権限を許可しない。公開状態には依存せず、SOCIAL能力のあるBunshinまたは既存SOCIAL報告がある自Serviceだけに接続する。
- 表示窓は日本時間の完了済み月曜〜日曜、直近12週から選ぶ。任意期間・User/Bunshin/Package/上限の指定は拒否する。固定非重複窓は細分化を減らすが差分攻撃/再識別防止の完全な保証ではない。
- 表示の仮の少数セル基準は各bucketで5報告者以上。1つでも未達なら全bucketのラベル・件数と全体件数を一括で伏せ、部分合計からの逆算を避ける。読取不完全も詳細/件数を表示しない。5は匿名化保証ではなく運用前レビュー対象。Engineの3報告/2人の人手確認ルールは変更しない。
- UI向けmodelをサーバー側で明示projectionし、sourceRefs、scope ID、User/Bunshin、clusterRef、Evidence revision、選択digestを除く。CSS非表示やClient componentへraw Evidenceを渡す方式にしない。CSV/コピー/個票/承認/自動修正は追加しない。
- DB障害/原本不一致は取得不能として扱い、0件にしない。認可失効は404。原因/母集団/率/原価が未確認であることを表示する。Schema/原本書込/依存/本番/配信は変更しない。

## Improvement Feedback Evidence: 決定的な要確認候補を確定Issueから分離する

- 日付: 2026-10-03、状態: 実装PRで検証。
- PR #1087の管理者読取とCollect契約を再利用し、非永続の選択コード別EvidenceをApplicationへ追加する。DBの原本・認可・入力保存は変更しない。HTTP/管理UI/Job/Candidate永続化・承認・指示案生成は含めない。
- 同じ種類/場面/困り具合で束ねるが、受付IDの重複と別報告の意味的重複を混同しない。distinct報告者はUser単位とし、複数Bunshinを複数人にしない。V1の仮の確認対象基準は3報告以上かつ2人以上、完全な読取。満たさなければ原本参照・観測件数を保持したまま保留する。この値は統計的有意性/表示匿名化の保証ではなく、モニター運用前にレビューする。
- UNKNOWN/自己申告を維持し、機械障害・原因・再現率・外部Provider帰属は未確認。保留解除は人の確認対象にするだけでBUGやAPPROVEDへ遷移しない。外部障害除外・技術的相関・他Adapter統合は別の証拠が必要。
- scope/期間/subject選択/Adapter版/rule版/コードから決定的なクラスタ参照を作り、根拠の内容・人数・完全性が変わればEvidence revisionを変更する。入力順や同じ受付IDの再読取でrevisionを変えない。原文/写真/Memoryや直接User IDを返却Evidenceへ複製しない。内部参照とhashは匿名化保証ではない。
- 母集団・率・原価は未取得のまま。保存/削除/保持期限の設計レビュー前に永続Issueを追加しない。最初のbounded batchのみ、本番実行口は追加しない。

## Improvement Feedback観測: 自己申告を確定BUGや発生率へ昇格させない

- 日付: 2026-10-03、状態: 実装PRで検証。
- PR #1086の専用原本を既存CollectImprovementObservationsへ接続する。共通Applicationに選択コードのprojectionを置き、databaseに固定scope＋DB管理者再認可を持つ独立読取Adapterを追加する。SOCIAL入口の報告だけを対象とし、ハッシー名やOEM名で分類しない。
- 運営者は同Workspace/ServiceのACTIVE SERVICE_OWNER/SERVICE_ADMINだけ。参加者や編集者、本部/Workspace管理者へ暗黙の横断権限を与えない。本人書込の認可を緩めず、HTTP/UI/Jobを追加しない。
- 原本のWorkspace/Service/Package/actor/Bunshinを正本にし、現在のBunshinの所有範囲との不一致は安全側で読取失敗とする。別Serviceへ付け替えたり、移動/譲渡を日時やkeyから推定しない。退会済み報告者や無効能力を理由に過去の報告を黙って除外しない。
- SELF_REPORTED_TROUBLE、共通分類UNKNOWNで渡す。OPERATIONをBUG、CONTENTをAI_QUALITY、WAITINGをPERFORMANCEへ自動認定しない。報告件数とdistinct報告者を別計測し、実際の困りごとの母集団/発生率/解決率/原価はUNKNOWN/null。
- limit+1と半開期間で最初のbounded batchを取得し、打切りはPARTIAL。保存原本の読取完全性と現実の捕捉率を分離する。自由文・素材・Memory・送信キーを取得しない。Schema/書込/Provider/設定/本番は変更しない。

## Improvement Feedback: 本人の選択式原本を投稿評価・支援ケースから分離する

- 日付: 2026-10-03、状態: 実装PRで検証。
- 共通「困った」報告は自己申告信号であり、BUG認定・Mission評価・SNS障壁・運営者SupportCaseへ直接置換しない。専用原本には限定コード、本人Workspace/Service/Bunshin/Package、送信キー、受付時刻だけを保存する。自由文/写真/会話/Memoryを取得しない。
- 初回入口はSOCIAL能力が有効なサービスの本人ホーム。ハッシー名やOEM名を共通Applicationへハードコードせず、研修・占いへ暗黙拡張しない。Service管理権限は他人のBunshinへの書込み権限にしない。
- 保存Transaction内で所有・参加・能力を再検証。Workspace/actorのlockとuniqueで同時再送を直列化し、同じキー・同じ内容だけを元の受付結果へ戻す。内容/scope変更は競合、所属失効後は再送も拒否。新規24時間10件の上限と保存済み再送を分ける。
- 原本の限定コードを将来Adapterで読める境界まで。検知/管理画面/承認/自動指示実行、本番Migration、実通知は含めない。保持期限、退会後削除、他Package入口、実機/E2Eは後続の確認事項として残す。

## Photo First観測: 開始経路と工程利用を明示参照で残す

- 日付: 2026-10-03
- 状態: Accepted（調査・最小記録補完・回帰検証を同一ゴールとする）
- Generationのclaim時にSTANDARD / PHOTO_FIRSTをnullable列へ保存する。既存行・未指定の旧呼出しはnull（不明）のまま。成功Metadataやkeyの文字列から開始経路を補完しない。
- AiUsageEventには既存Generationへの任意の明示FKを追加する。RepositoryでWorkspace/Bunshin/actorとMission所有権を照合し、同一利用keyの参照付け替えを拒否する。Serviceは本人のみ、個人Workspaceは既存claim同様の明示OWNER/ADMIN管理権限も維持する（単なるMEMBERには許可しない）。利用原価は既存欄を維持し、欠測を0として補完しない。
- Generation削除時は参照のみnullへ戻し、利用イベントの費用記録を連鎖削除しない。利用記録は従来どおりbest effortで、全工程の完全性は保証しない。claim以前の拒否・失敗は今回の母集団外。
- 品質読取は開始経路の明示群を追加し、旧Metadata/品質signal/未帰属とは分ける。全Photo First成功率のUNKNOWNは維持する。生の本文・写真・解析・個人メモリーは観測へ追加しない。
- 新Worker/Provider/Job、管理UI、Feedback、検知・候補生成、本番migration、実生成・送信は含めない。schema追加はnullable2列とFK/index/checkのみで、既存業務判定や課金を変更しない。

## Improvement Engine: Photo First品質は確定素材Relationと未帰属を分けて観測する

- 日付: 2026-10-03
- 状態: Accepted（PR #1083マージ後の独立読取作業）
- 既存本人Mission単位のlistQualityAuditsの認可を緩めず、別のService管理者読取Adapterを追加する。固定scope照合とDBでのACTIVE owner/admin再認可を行い、原写真・本文・解析JSON・回答・秘密値を取得しない。
- 専用Photo First Metadataとの明示RelationはPHOTO_METADATA、既知品質codeだけはPHOTO_ISSUE_SIGNAL、その他はUNATTRIBUTED。Metadataなしを通常生成と断定しない。idempotency keyや時刻の近さから失敗の発生経路を推測しない。
- 生成開始時刻の期間cohortを読み、PASS/修正後PASS/最終REVISE/REJECTと検査未実行/処理中/不正監査/期間後更新を分ける。検査未実行をchecked分母に含めず、欠損がある群の率はnull。品質PASSと動画/投稿案の保存成功は別。
- limit+1で取得打切りを検知し、完全な母集団と見なさない。全Photo First開始試行の帰属と欠測が未解決なので、全Photo First成功率は常にnull/UNKNOWN。成功Metadataだけで全試行の成功率を作らない。
- 保存Prompt Versionはusage()の最後の工程版であり、生成版や品質ruleの完全な履歴ではない。既知版のcode分類と未知版を保持する。複数版混合の集計を修正前後の因果評価へ転用しない。
- schema・既存生成/品質検査/Job/Provider・HTTP/UI・設定は変更しない。次は未帰属・工程間相関の不足を実証し、必要な最小記録補完の候補を別PRで検討する。

## Improvement Engine: Hassy支援結果は提供期間cohortと提供時Goalから読む

- 日付: 2026-10-03
- 状態: Accepted（Phase 1マージ後の次の最小読取作業）
- SOCIAL capabilityにSnapshotのGoal分類とcohort集計を置き、databaseに既存支援行の読取Adapterを置く。共通EngineへSNS Goalを追加しない。schema・Provider・Job・HTTP/UIを変更しない。
- 信頼されたcompositionが固定scopeを渡す。Adapter自身が同じTransaction内でACTIVEのSERVICE_OWNER/SERVICE_ADMINを再検証する。tenant/Service/環境の入力から認可を推定しない。管理UIへの公開と本部横断権限は後続作業。
- offeredAtの半開期間を母集団にし、toExclusive以前の実acceptedAt/completedAt/skippedAtで集計する。現在のstatusから過去の状態や未記録のACCEPTを再現しない。退会済み参加者を母集団から黙って除外しない。
- COMMON、MIXED、UNATTRIBUTED、LEGACY、INVALIDはGoal固有支援と別bucket。現在Goal・最新Evidence・再発回数から補完しない。Snapshot全文はDB読取後に破棄し、文面・自由文・原素材をEngineへ渡さない。
- bounded読取はlimit+1で打切りを検知し、PARTIALなら完了率をnullにする。欠損/矛盾する結果時刻も率を保留する。未取得原価はnull。非再発や事業成果への因果効果は評価しない。
- 初回はcursorなしの最大1,000件/90日間。ページング、管理画面、少数セル表示抑止、Photo First品質は別PR。取り消しは本Adapterの呼出しを外すだけで、既存支援記録を変更しない。

## Improvement Engine Phase 1: 共通契約は非永続の収集と純粋domainから始める

- 日付: 2026-10-02
- 状態: Accepted（ユーザー承認済みPhase 0の最小実装単位）
- 共通分類、scope、観測Envelope、集計完全性、原価欠損、状態遷移、承認Revision照合をplatform-domainへ置く。SNS Goal・Photo First・研修難易度は共通型へ追加しない。
- applicationの認可Portを通過した後だけAdapterを呼び、出力もtenant/Workspace/Service/Package/環境・指定時のUser/Bunshinを再検証する。各Adapterは元記録の認可とprivacy projectionを担当し、共通収集もmetadata allowlistで防御する。
- 同じsource kind/IDは重複排除する。内容の不整合は失敗とし、時刻の近さや現在Goalから相関を推定しない。欠損・打切りがある集計を完全な母集団として扱わない。未確定原価はnullと件数で残す。
- 本変更は非永続の型・関数・Portとfake入力テストのみ。実Adapter、DB、HTTP/UI、Candidate永続化、管理者RBAC、実Codex指示案は後続作業。domainの承認適格性関数は認可そのものを保証しない。
- 次は既存Hassy読取経路へ限定Adapterを追加する。大規模schema・外部サービスの必要性が判明した場合は選択肢と影響を報告する。

## D-163: Photo Firstの解析・企画は投稿案と同一Transactionの専用Metadataに保存する

- 日付: 2026-10-01
- 状態: Accepted（D-162の再読込・履歴対応）

- Photo Firstの元写真ID、構造化解析、企画、解析モデル、Prompt Versionは、完成本文の`contentJson`へ混在させず、`MissionContentVariant`に対する1対1の専用Metadataとして保存する。通常の投稿本文処理やSNS投稿先へ内部Metadataを流さない。
- Metadata作成は投稿案の完成処理と同じDB Transactionで行う。Metadataだけ、または投稿案だけを成功扱いにしない。同じ生成冪等キーの再送は、保存済み投稿案とMetadataを返し、Vision解析を再実行しない。
- 元写真との関係はWorkspace・Bunshin・Memory IDの複合外部キー、投稿案との関係はWorkspace・Bunshin・Daily Mission・Variant IDの複合外部キーで制約する。他Workspace・他Bunshinの写真を関連付けられないようDBでも保証する。
- 投稿案削除時はMetadataを連動削除する。参照中の元写真は物理削除を制限するが、既存の利用者削除はsoft deleteのため画面から除外できる。履歴Metadataから秘密のStorage URLや画像bytesを返さない。
- Service画面の再読込では、認可済みRepositoryが返す最新のPhoto First投稿案と企画だけを復元する。LINE画像直接受信、Photo First単独Mission、自動画像編集、実Provider E2Eは本変更に含めない。

## D-162: ハッシー Photo First V1は既存の非公開写真と投稿案生成経路を再利用する

- 日付: 2026-10-01
- 状態: Accepted（Photo First V1の最小縦断実装）

- Photo FirstはPlan Firstを置き換えず、既存のDaily Action写真、確定済みDaily Mission、MissionContentVariant生成・品質検査・利用枠・AI利用記録へ接続する。別の公開Storage、独立Job、別履歴基盤はV1で追加しない。
- 写真は本人・Workspace・Service・Bunshin・READY状態を再検証してprivate Storageから読み、回転補正・長辺1600px以内への縮小・JPEG再符号化後だけVision解析へ渡す。画像内文字は命令として扱わず、人物特定・センシティブ属性推定・画像だけでは分からない事実の断定を禁止する。
- 写真分析にはSNS Goal、Goal Planning、企業・対象顧客・承認済みStrategy、今日と直近のMissionを渡し、CTAだけではなくテーマ・切り口・写真の使い方を変える。完成本文は既存の品質検査付き生成工程で作る。
- 投稿本文は既存MissionContentVariantとして履歴に残す。解析・企画MetadataはV1ではレスポンス表示だけで、再読込時の復元は部分対応とする。Metadata永続化とPhoto First単独入口は、所有境界・削除・冪等性を設計した別PRとする。
- V1はWeb写真Uploadから利用し、LINEへ送った写真の直接受信、自動画像編集、SNS自動投稿は行わない。実Provider、実Storage、スマートフォン、本番環境のE2Eを完了するまで本番利用確認済みとは扱わない。

## D-161: 千ノ国メディアの禁止招待URLはスキーム有無に関係なくホスト単位で除去する

- 日付: 2026-09-30
- 状態: Accepted（PR #994マージ後のURL表記監査）
- 千ノ国メディアのDiscord招待先は`https://`付き、プロトコル相対、スキームなしのいずれも、禁止ホスト自身とそのサブドメインに限って除去する。似た名前の別ドメインや承認済みLINE URLは書き換えない。
- 用語置換はドメイン名中で行わず、`公式LINE.gg`のような偽のアドレスを作らない。壊れたURL文字列でも処理を失敗させず、禁止ホストの断片があれば除去する。
- ルールの適用は千ノ国メディアに限定し、他ServiceのDiscordコミュニティ、保存済み原稿、DB、Provider、実LINE送信は変更しない。

## D-160: 専用URL・外部計測のService管理APIは管理権限で解決する

- 日付: 2026-09-30
- 状態: Accepted（D-159後の残存Public Resolver監査）
- Service配下の専用URL/外部計測管理APIは、管理画面と同じ認証済み本人のACTIVEな`ADMINISTRATION`権限からWorkspace/Serviceを解決する。非公開Serviceの管理者も操作でき、匿名・他Service・権限不足を拒否する。
- 下層のGroup ID照合、RepositoryのService限定とMANAGER権限、同一Origin、URL/CSV/結果Tokenの既存検証を維持する。Service外の成果受信Webhookと公開登録入口は変更しない。
- 不存在・権限不足と予期せぬDB障害を区別し、API失敗応答をprivate/no-storeとする。設定、DB schema、本番データ、Provider呼出は変更しない。

## D-159: Serviceの商品パックとCampaign操作は公開状態でなく内容編集権限で判定する

- 日付: 2026-09-30
- 状態: Accepted（D-158後の残存Public Resolver監査）
- 管理画面で扱う商品パックとCampaignの5 APIは、認証済み本人のACTIVEなService所属と`CONTENT`権限からWorkspace/Groupを解決する。非公開Serviceの権限者も操作でき、匿名・他Service・権限不足は拒否する。
- Request内のGroup IDやPack/Campaign IDは既存のService/Repository境界で再検証する。管理画面の役割、参加者向け公開入口、商品/参加同意、Provider、DB schema、本番設定は変更しない。
- 不存在・権限不足と予期せぬDB障害を区別し、APIエラーをprivate/no-storeで返す。

## D-158: 参加者専用画面のMetadataも本人のMember Serviceから解決する

- 日付: 2026-09-30
- 状態: Accepted（D-155後に残った非公開Serviceの汎用タイトル）
- 参加者専用9画面のページタイトルは認証済み本人のMember Serviceから表示名を取得する。匿名・所属外・停止中にはサービス名を返さず汎用タイトルとする。公開登録入口だけPublic ServiceのMetadataを維持する。
- 本文の認可は既存のMember判定を維持し、Metadataをアクセス許可として用いない。所属不存在だけ汎用タイトルへ戻し、DB等の未知障害は隠さない。User IDを含む認可結果をSlugだけでcacheしない。
- 本作業でサービスのVisibility、参加・同意フロー、Provider、DB schema、本番データを変更しない。

## D-157: Service法務文書の再同意を参加申請から分離する

- 日付: 2026-09-30
- 状態: Accepted（D-156の利用停止からの本人復帰導線）
- 既存参加者の最新公開版への再同意は、本人のACTIVE Membershipを維持したまま、Service/Workspace/本人をDBで再検証して追記する。参加申請を再実行せず、承認状態・紹介・登録メール・商品自動登録を変更しない。
- 送信時に有効なtype別最大versionの文書ID集合と完全一致した場合だけ保存する。旧版同意は監査履歴として保持し、他Serviceへ流用しない。非公開Serviceの既存参加者も同じ本人用導線を使う。
- 現行の利用/通知判定が要求する公開文書はTERMS、PRIVACY、COMMERCE_DISCLOSUREを含むため、参加画面と再同意画面も同じ集合を提示する。法務本文・公開条件を変更しない。法務上の同意対象の再定義は別判断とする。
- 本番データの移行、本人への一斉送信、デプロイは含めない。リリース前に旧版同意者の件数・再同意導線を読み取り専用で確認する。

## D-156: Service法務文書の表示・参加・利用・通知同意は同じ最新有効版を判定する

- 日付: 2026-09-30
- 状態: Accepted（PR #1019マージ後に確認した版選択不一致の修正）
- Service内でPUBLISHEDかつ有効日時以前の文書だけを対象とし、文書typeごとに最大versionを選ぶ。DB返却順序やMapの後勝ちへ依存しない。公開表示、参加時の同意ID、利用開始記録、通知設定の同意確認の4経路を同じ選択処理に合わせる。
- 新版が有効になった後は旧版だけの同意で参加/利用/通知設定の条件を満たさない。申請時はTransaction内で最新IDを再確認し、古い画面からの同意IDを拒否する。旧同意記録を消さず、既存の再同意・運用導線を維持する。
- Workspace/Group/本人/所属・公開登録条件と既存の法務文書status/有効日時を維持する。非公開Serviceの既存参加者向け文書閲覧も最大versionと一致させる。法務本文、公開/廃止運用、Provider、DB schema/migration、本番データは変更しない。実DBの複数版/境界とmockテストで検証する。

## D-155: 閲覧用のヘルプ・マニュアル・法務文書は公開訪問者と既存参加者を分ける

- 日付: 2026-09-30
- 状態: Accepted（推奨順の画面監査とPR #1018のマージ確認）
- 公開Serviceは匿名/未参加のログイン済みUserにも既存の閲覧入口を維持する。非公開ServiceはACTIVEな既存参加者だけがヘルプ・対応するマニュアル・公開済み法務文書を閲覧できる。まず本人のMember Serviceを確認し、所属拒否に限りPublic Serviceへ解決し直す。予期しない障害やProvider障害は公開fallbackで隠さない。
- マニュアルのService取得はUserごとに分離し、同じSlugの異なるUserへcache結果を暗黙共有しない。匿名の非公開閲覧は許可しない。
- 非公開Serviceの法務文書はService解決のWorkspace/Groupと文書type、PUBLISHED/有効日時に限定して取得する。公開Serviceの既存参加同意・法務閲覧ロジックは変更しない。DRAFT/将来版や他Service文書を返さない。
- 公開登録・参加申請・法務同意の承認条件、管理権限、設定、DB schema/migration、本番データ、実LINE/AIを変更しない。その他画面のMetadataの公開名解決は今回のアクセス権修正から分けて監査する。

## D-154: Program目標の管理操作と本人操作は独立したService権限で解決する

- 日付: 2026-09-30
- 状態: Accepted（推奨順の継続実装とPR #1017のマージ確認）
- 支援方針/目標候補の管理操作は既存ADMINISTRATION Resolverだけを使い、公開Service/参加者Resolverを前提にしない。本人の希望/目標はMember Serviceだけを使い、管理者権限へのfallbackを追加しない。非公開Serviceの既存参加者を対象にし、利用期間・ACTIVE Workspace/Group/本人所属を維持する。
- Enrollment/Program/候補/方針/監査/保存はサーバー解決したWorkspace/Serviceへ限定する。本人Membership/ACTIVE Enrollment、受講ロック後の再確認、AI研修だけの期間条件、支援方法選択の許可、方針版管理と過去目標の保持を維持する。
- 入力型と許可フィールドは広げず、Schema不一致/壊れたJSONは400へ明示変換する。未知キーは従来通り無視し、所有Scopeとして利用しない。既存管理ResolverのSERVICE_NOT_FOUNDだけ404へ変換し、未知障害500を握りつぶさない。
- 管理/本人フローの実行テストを追加する。公開入口/画面、DB schema/migration、設定、本番データ、実AI/LINE、期限処理の本番有効化を変更しない。既存の版競合や方針/候補変更の新しい排他保証は追加しない。

## D-153: 動画配信の参加者操作はMember Serviceと利用可能状態を先に確認する

- 日付: 2026-09-30
- 状態: Accepted（推奨順の継続実装とPR #1016のマージ確認）
- 閲覧/採用/辞退/自己申告投稿とダウンロードは認証後のMember Service解決へ合わせ、利用期間・ACTIVE Workspace/Group/本人所属と既存Repositoryの受信者/状態条件を維持する。不正Delivery IDは400へ明示変換する。
- 自己申告投稿/ダウンロードでは取得済みDeliveryの期限切れ・EXPIRED/REVOKEDを関連投稿/Storage操作より先に拒否する。本人の未取消Project取得失敗も投稿記録前に拒否する。POSTED再送、採用必須、SOCIAL能力、元Missionと紹介Milestone、元Missionなし手動動画を維持する。新しい排他保証は追加しない。
- ダウンロードは同じWorkspace/Service/本人/Project/Renderの未削除・期限内SUCCEEDED行と正本形式のStorage Keyを照合し、署名URL準備後にDOWNLOADEDを記録する。準備失敗や拒否時にURLを返さず、失敗を成功履歴にしない。履歴は実端末保存の確認ではなく引渡し準備を表す。
- 全例外を404にするdownload catchを既存APIエラー変換へ合わせ、拒否/不存在/未知障害を区別する。本人用成功/失敗/署名URL redirectはprivate no-store、redirectはno-referrerとする。
- 公開入口・専用LINE OAuth/送信・通知Snapshot/再試行・DB schema/migration・設定・本番データを変更しない。Storageはテストでmockし実署名URLを発行しない。

## D-152: 本人の商品紹介操作もMember Service境界で解決する

- 日付: 2026-09-30
- 状態: Accepted（推奨順の継続実装とPR #1015のマージ確認）
- 本人の商品プロフィール保存/非表示、コピー/自己申告投稿、紹介文生成は認証後のMember Service解決へ統一する。非公開Serviceの既存参加者を許可し、利用期間・ACTIVE Workspace/Group/本人所属は維持する。
- 入力Schemaは広げず不一致/不正な非表示IDを400へ明示変換する。Workspace/Group/操作者はサーバーで解決し、本人の商品・分身・活動・ACTIVE MEMBER URLと公式商品の自Service再照合/同意/公開期間を維持する。
- 生成入力の本人設定・公式商品、URLのProvider非送信、承認URL/#PR/必須表記/禁止表現/媒体上限、組織Quota、モデル/Prompt版/Token/原価/時間/成否の記録、活動の重複防止は維持する。生成Quotaへ自ServiceのgroupIdも渡し、既存Service上限を迂回しない。設定値やQuota実装は変更せず、実Providerは呼ばずテストでmockする。
- 動画通知、画面の公開判定追加監査、DB schema/migration、設定、本番データ、匿名公開入口と実AI/LINE/Storage呼出は本作業に含めない。

## D-151: 初回回答・紹介コード・本人専用URLは参加者のServiceで解決する

- 日付: 2026-09-29
- 状態: Accepted（推奨順の継続実装とPR #1014のマージ確認）
- 初回回答保存、紹介コード発行、本人の代理店URL保存は認証後にMember Serviceを解決する。利用期間・ACTIVE Workspace/Group/本人所属を維持し、非公開Serviceの既存参加者を対象にする。
- 初回質問、businessProfileEnabledとFULL/MINIMAL、業種検証、自Service所属への保存、既存投稿パートナー作成と紹介Milestoneを維持する。千ノ国へ共通業種入力を追加せず、ハッシー等の事業プロフィール要件を外さない。
- 紹介コードの設定・所属・停止状態・安定キー・重複防止、代理店URLの自Service Repository/許可ドメイン検証とDRAFT保存を維持する。紹介先の匿名登録は公開条件のままにし、非公開Serviceへの新規参加を許可したとは扱わない。
- 紹介コード解決で全例外をNOT_FOUNDへ変換するcatchを除去し、Member ResolverのApplicationErrorと未知障害を既存APIエラー変換へ渡す。障害を参加不可と誤報しない。
- 初回回答/代理店URLの厳格Schema不一致をVALIDATION_ERROR（400）へ明示変換する。旧parseAsyncの例外が500になっていたため、許可フィールドや型を広げずsafeParseAsyncで拒否を保持する。
- 商品紹介・動画通知・画面の追加監査は別作業。DB変更、公開登録、設定、本番データ、Provider/通知呼出は行わない。

## D-150: 投稿操作・成果・日々の記録は本人のMember Service境界で認可する

- 日付: 2026-09-29
- 状態: Accepted（推奨順の継続実装と前段PRのマージ確認）
- 投稿採否/活動/自己申告投稿/評価、共通Daily Mission操作Scope、業務成果、SNS数字保存/画像読取、日々のメモ/写真記録は認証済みUserを先に取得し、既存Member Service解決を使う。非公開Serviceの既存ACTIVE参加者を許可し、利用期間・Workspace/Group/所属・本人所有・既存参加同意条件を維持する。
- 業務成果の設定と操作Scopeは同じMember Service解決結果から作り、別の匿名公開判定や再取得した操作者を混ぜない。businessProfileEnabledの機能制限は維持し、千ノ国等へ業種/成果項目を強制しない。
- 既存SOCIAL能力、Mission/投稿者照合、Schema/同一Origin、再送キー、使用量・紹介Milestone、写真権利/Storage条件と自Service知識・生成/VariantのPolicyは変更しない。実AI/Storage/LINE呼出はせずテストではPortをmockする。
- 商品紹介・紹介リンク・初回登録・動画通知など別機能の残る公開判定は本PRに混ぜない。個人用API、公開登録/Metadata、DB schema/migration、設定、本番データを変更しない。

## D-149: SNS設定・発信方針・投稿テーマ・週間計画は参加者本人のサービスで解決する

- 日付: 2026-09-29
- 状態: Accepted（推奨順の継続実装と前段PRのマージ確認）
- SNS設定、アカウント発信方針、投稿テーマ、週間計画の各HTTP APIは認証済みUserを先に確認し、既存Member Service解決を使う。非公開Serviceの既存ACTIVE参加者を許可し、利用期間・Workspace/Group/所属の判定は維持する。
- Workspace/Group/操作者はサーバーで解決し、既存RepositoryのService/Bunshin本人所有条件とSOCIAL能力確認、入力Schema、同一Origin判定を維持する。Service固有の業種・初回回答を共通化しない。
- 生成時の自Service公式知識、参加Campaign、用語変換、業務投稿配分、Quota/使用量/冪等キーと確定済み計画のテーマ保護を変更しない。実Provider呼出はせず、テストでは生成Portをmockする。
- 投稿採否・完了・成果/振り返りのAPIは別PRとする。公開登録・Metadata、個人用操作、DB schema/migration、設定、本番データ、LINE送信は変更しない。

## D-148: 投稿パートナー操作は公開状態ではなく参加者本人のサービス境界で認可する

- 日付: 2026-09-29
- 状態: Accepted（推奨順の機能不足修正をユーザーが承認）
- サービス所属投稿パートナーの一覧・作成・取得・編集・停止と初回回答からの候補提案は、認証後に既存Member Service解決を使う。非公開サービスの既存ACTIVE参加者も操作できるようにし、利用期間とWorkspace/Group/所属の検証を維持する。公開入口・匿名登録・Metadataの公開判定は変更しない。
- 候補提案は本人の当該Service所属から初回回答・事業プロフィールを再取得し、他Serviceや共通プロフィールへ切り替えない。Providerの呼出・fallback仕様は変更しない。
- 一覧/取得の既存本人所有条件に合わせ、サービス所属Bunshinの編集/停止にも本人所有条件を追加する。Workspace OWNER/ADMINでも参加者向け操作で他人のサービス所属Bunshinを変更できない。個人用Bunshinの既存管理権限は維持する。
- SNS設定・週間計画・投稿採否/完了/成果APIは別PRとする。DB schema/migration、設定、本番データ、実AI呼出、LINE送信は変更しない。

## D-147: 専用LINE再連携は試行別proofと既存参加者のサービス境界を使う

- 日付: 2026-09-29
- 状態: Accepted（監査で確認した2件の修正をユーザーが承認）
- 専用LINEの新規接続はランダムstateのSHA-256を名前に含む試行別HttpOnly Cookieへ分離する。10分の期限、PKCE、nonce、本人/Configuration照合、DB単回CASを維持する。別Service・同じServiceの再試行・古い取消Callbackが他試行のCookieを上書き/削除しない。
- Cookieは同じブラウザで最大4試行とし、上限時は既存試行を消さず開始を拒否する。Callbackでは一致した自試行のCookieだけを除去する。旧共通Cookieは一致したstateだけ互換検証に使い、新規発行も削除もせず既存10分期限で失効させる。
- 接続ページ、開始、Callback、既存動画通知再試行は公開Slug解決でなく本人のACTIVE MembershipによるService解決を使う。非公開サービスの既存参加者を許可し、利用期間・Workspace/Group・Bunshin本人所有・参加同意・専用LINE設定の検証は維持する。匿名参加、他Service参照、管理権限の拡大はしない。
- DB schema/migration、共通ログインの有効化、業種/初回質問、設定、本番データ、Provider実呼出、LINE送信は変更しない。

## D-146: 不明な過去の研修終了日時は管理者の個別確認でのみ確定する

- 日付: 2026-09-29
- 状態: Accepted（管理者による証跡確認・日時指定・理由/監査付き操作をユーザーが承認）
- 既存の保持期限ページに個別操作を分けて表示し、アーカイブProgram/退会済み参加者も所有境界が有効なら扱う。未確定対象100受講/1000Programを超えた一覧は部分表示せず拒否する。対象確認用の表示名・Program名・受講IDだけを取得し、メール・回答本文などは一覧にも取得しない。
- 自ServiceのACTIVEなSERVICE_OWNER/ADMINをDBでも再検証し、所有関係が有効なAI_TRAINING_V1の終了/取消/期限終了済み受講1件だけを扱う。既存の確定日時、EXPIREDの既知予定終了日時、処理済み保持期限印は上書きしない。自動推定・既定日時・一括補完は追加しない。
- 管理者が証跡を確認して終了日時（日本時間）と個人情報を含まない根拠/理由を指定する。未来、既知開始より前、不正な日時は拒否。Previewは状態・候補日時・保持期限への影響だけを返し、回答/評価/仕事情報/点数/Toolkit本文を取得しない。
- 本人/Scope/受講Revision/保持期限状態/候補日時/理由/期限判定を束ねた確認Revisionを使う。共通受講ロックとSerializable transactionで再検証し、未確定日時だけを保存して最小Program監査へ操作者・理由・日時・Operation IDを記録する。再開/別操作/候補変更後の古い確認、他Service/本人への差替えは拒否。同一操作再送は二重保存しない。
- 受講状態・予定期間・学習情報・契約/課金・Jobは変更しない。終了日時は既存の保持期限起算日に使うが、本操作で削除・通知・定期実行・本番保持期限処理の停止解除は行わない。Schemaは既存保持期限記録/Program監査を利用し、migration追加なし。

## D-145: 占いAIは標準結果を維持した非同期Jobと試行単位の再試行へ分離する

- 日付: 2026-09-29
- 状態: Accepted（不足機能の実装依頼）
- 同時投入のDB重複防止は`createMany(skipDuplicates: true)`による原子的な挿入と既存Jobの再取得で行う。空updateのPrisma upsertは同時insertでP2002となるため使わない。既存Jobの本人/Workspace/Bunshin/用途の照合とReadingのCASは維持し、重複時にJobを更新・再開しない。
- 同じService/本人/日付のカードと承認済み標準結果を維持し、AIだけを共通Jobへ投入する。JobとGENERATINGへの変更は同じTransactionで確定し、Reading固有の冪等キーで重複投入・最終失敗後の自動再生成を防ぐ。Jobへ本文・Memoryを複製しない。
- WorkerはWorkspace/Service/本人/Bunshin/能力、参加同意、未削除、現在のJob leaseと試行番号を再検証する。完了・fallbackにもJob行ロックとReading更新Revisionを用い、期限切れ実行・削除・復旧後の上書きを拒否する。
- timeout/network、429、5xxのみ最大3回・既存Backoffで再試行する。設定/権限不備、その他HTTPエラー、空・不正・危険な出力は再試行せず標準結果へ戻す。各実試行で使用量・原価・Quotaのキーを分ける。Provider response本文や例外・秘密値を診断へ保存しない。
- 既存10分中断復旧は有効な待機/再試行/lease付きJobを優先する。Jobが終了・消失して中断したReadingだけを安全に復旧する。Worker停止時も標準本文を表示できる。
- `FORTUNE_ASYNC_GENERATION_ENABLED=true`で新規投入を有効化する。無効化後も既存Jobは安全に処理する。既存同期方式を維持し、本番設定、実AI呼出、LINE送信、過去失敗の一括再投入は本作業では行わない。既存Job schemaを利用し、DB schema変更は不要。

## D-144: 認証復帰を試行単位の本人確認・単回記録へ分離する

- 日付: 2026-09-29
- 状態: Accepted（複数Service同時ログインの混在防止依頼）
- 認証試行ごとにランダムID、10分のHttpOnly browser proof、RLS有効なサーバー記録を作る。戻り先・origin・LINE/EMAIL・段階を対応付け、Callbackのclaimと復帰のconsumeはCASで一度だけ許可する。法務同意は認証済みUserに束ね、別Userのセッションへ変わった場合は拒否する。
- LINEのPKCEは既存SDKのflowId指定で自試行のverifierだけを使う。メールは送信先の短期hashと検証済みemailを照合する。検証中のSupabase Cookieはbufferし、成功・本人照合後にのみcommitする。既存の共有User sessionをService別Identityへ分割しない。
- Cookie/URLで試行が確認できない場合に、別試行や共通戻り先Cookieを借りない。期限切れ・別ブラウザ・重複Callback・本人変更は再ログインを案内する。戻り先は認可ではなく、遷移先のWorkspace/Group/本人/役割の既存検証を維持する。
- 既存ログインを壊さないため開始の有効化は`AUTH_RETURN_ATTEMPTS_ENABLED=true`の明示設定を必要とする。Supabase Redirect URL allowlistとemail templateで試行IDを伝達する確認後に有効化する。設定変更・認証メール送信・本番OAuth操作は今回行わない。既に始めた試行の復帰は停止設定後も厳密に検証する。
- 試行記録は認証前の一時情報でありテナント業務データを保存しない。短期に期限切れ行を削除する。認証token、code、verifier、proof、email、戻り先のsigned tokenをログに出さない。

## D-143: サービス認証復帰は共通登録から分離し、遷移先でサービス認可を検証する

- 日付: 2026-09-29
- 状態: Accepted（LINE再連携と類似ケースの分離依頼）
- サービスの入口・参加・ホーム・LINE・初期設定・参加者/管理画面・サービス別アカウントへ認証復帰するとき、User共通の業種プロフィールを要求しない。共通法務同意は維持し、遷移先で既存Workspace/Group/本人/役割の認可とサービス固有の初期設定を検証する。URLの許可はデータアクセス権を付与しない。
- 戻り先は既存ページの厳密な許可リストで保持する。外部URL、正規化で別サービスへ変わるパス、任意query、未知の末尾を拒否する。認証開始で戻り先がない場合は古いCookieを消し、別プロジェクトへ誤復帰しない。
- 共通登録へサービスの戻り先を渡した旧リンクは当該サービスへ戻す。サービス経由のプロフィールを共通Userへ書き込ませない。ハッシーのServiceMemberBusinessProfileなど既存サービス固有の設定は変更しない。画像閲覧も動画と同様、共通業種登録を要求しない。
- 設定変更、LINE送信、本番OAuth操作、既存データの移行・削除は行わない。

重要な設計判断を時系列で記録します。詳細な検討が必要な場合は `docs/adr/` に個別ADRを作成し、ここからリンクしてください。

## D-142: 購入に紐づかないAI研修の期限終了はService限定の冪等バッチで確定する

- 日付: 2026-09-29
- 状態: Accepted（ユーザー依頼による次の不足機能実装）
- 明示Workspace/Service内のAI_TRAINING_V1で、購入に紐づかないACTIVE受講の開始/終了日時が既知・順序正常、endsAtが処理時刻以下の場合だけEXPIREDへ移す。期限なし、開始日不明、INVITED/終了済み、有料購入、別Module/Serviceは変更しない。休止/退会後も所有境界が有効なら期限終了できる。
- 最大100受講と101件目を確認する。共通受講ロック、所有境界とModuleの再検証、候補更新時刻/終了日時のCASを使い、状態変更・評価Job停止・PENDING回答FAILED化・システム監査EventをSerializable transactionで確定する。競合は件数で明示し、未知DBエラーを成功にしない。途中失敗時の既に確定した受講は再実行で二重変更しない。
- 手動Lifecycleと自動期限終了で評価停止処理を共用する。本文・点数・進捗・Toolkit・契約Snapshot、startsAt/endsAtは保持する。既存の終了状態遷移Triggerが確定終了日を記録する。過去の終了済み行や不明終了日を補完しない。
- 自動終了はactorUserIdなし・source SYSTEMの固定理由/状態/日付だけのEventで監査し、本人操作と誤帰属させない。この最小Eventは学習データの本人削除/保持期限処理とそのPreviewから除外し、既存の最小監査保持方針を維持する。学習本文を監査へ複製しない。
- Cron Secret認証のPOST内部実行口を追加し、明示Scopeを厳格に検証する。development/stagingだけ実行でき、production/previewは503停止。定期実行登録、既存有料期限処理変更、Provider・通知・課金・本番削除/停止解除は行わない。

## D-141: OEM決済CSVは日本時間の受付期間と全件取得の成否を明示する

- 日付: 2026-09-29
- 状態: Accepted（不足機能の洗い出し・実装依頼の第一作業単位）
- 受付日時createdAtを日本時間の開始日以上・終了日の翌日未満で絞る。from/toは双方指定または双方未指定。存在しない日付、逆順、重複/未知パラメータを拒否する。入金日・返金日による会計集計とは扱わない。
- Workspace OWNER/ADMINまたは既存Platform Adminの認可、Organization ACTIVE、サービス名のWorkspace境界を維持する。CSV列、BOM、数式対策、金額計算を変更しない。
- 最大10,000件に対して10,001件目を確認し、超過時は413と固定の期間絞込案内を返す。部分CSVは返さない。同期Exportの上限を撤廃したとは扱わない。
- 画面に開始/終了日、期間の意味、件数上限、失敗時の案内を追加する。未指定の全期間取得も上限内で維持する。DB変更、課金、Provider呼出、本番設定変更は含めない。

## D-140: 研修管理画面は利用期間と登録状態を分ける

- 日付: 2026-09-29
- 状態: Accepted（ユーザー依頼による管理画面の期限表示統合）
- 1回のサーバー確認時刻で、ACTIVEの利用可否を開始日時以下・終了日時未満として表示判定する。期限後は「期限終了（状態未更新）」、開始前/開始日時なしも区別し、受講中・継続率・声かけ集計から除く。登録状態、履歴・学習成果の集計は保持する。
- Lifecycle操作には登録状態とupdatedAtをそのまま渡し、見かけの期限終了をEXPIREDへ書き換えて送信しない。管理者の明示的終了/取消は既存確認・監査を維持する。再開・延長を追加しない。
- 予定終了日時と確定終了日時を分け、ACTIVEの期限超過から確定終了日・保持期限起算日を補完しない。画面閲覧で状態更新・削除・通知・課金や設定変更を行わない。

## D-139: AI研修の学習操作は状態だけでなく受講期間を確認する

- 日付: 2026-09-29
- 状態: Accepted（次の実装タスクとして期間判定の差分を修正）
- 学習操作はACTIVEかつ開始日時以下・終了日時未満のサーバー時刻に限定する。終了日時なしは期間上限なし。終了日時と同時刻は期限後として扱う。
- Runtime、初期設定、回答、学習操作、目標/設定変更、評価QueueとWorkerを同じDB期間条件へ揃える。書込は受講ロック取得後に現在時刻で再確認し、期限内に始めたAI評価も保存前に確認する。
- ACTIVEのまま終了予定日を過ぎた本人画面は期限終了案内を表示し、Runtimeを起動しない。これは利用可否の表示であり、DB状態更新や終了日記録・保持期限起算日の確定ではない。
- Toolkit/本人Exportの既存権限を維持する。契約延長、自動終了Cron、課金、通知、削除、過去終了日の補完、Provider実呼出や本番操作は含めない。

## D-138: 保持期限の管理画面は自Serviceの集計だけを読み取り専用で示す

- 日付: 2026-09-29
- 状態: Accepted（ユーザー依頼によるPreflightの管理画面接続）
- SERVICE_OWNER/ADMINだけにService Slugから解決した保持期限集計を表示する。Repositoryも同じ読み取りTransactionで活動中の管理者・User・Workspace・Serviceを再検証する。
- 既存Preflightの期限判定・件数上限・所有境界検証を共用する。本文・評価・仕事情報・点数・Toolkit本文・個人名・監査理由を表示取得せず、カテゴリ件数と終了日/所有境界の判定保留件数だけを示す。
- 最大100受講/1000Programを超えた場合やDB障害時は部分集計・0件成功に置き換えない。確認時刻、情報カテゴリ間の重複、Toolkit保持、起算日を推定しないことを明示する。
- 終了日補完、削除、Cron登録、Provider、通知、本番実行APIの停止解除は含めない。内部Cron Secretによる既存Preflight APIの認証契約は変更しない。

## D-137: 研修管理集計はDBで評価自由文を除外する

- 日付: 2026-09-29
- 状態: Accepted（既存Privacy方針との実装差分修正）
- 管理画面のREADY回答取得では評価JSON全体を読み込まない。DBでPASS/REVIEWと既知6技能の0〜100の数値だけに射影し、回答本文・評価自由文・未知フィールドを返さない。
- DBの同一Queryで活動中のSERVICE_OWNER/ADMIN、Workspace/Service、本人所属と回答User、AI研修Program、対象Enrollmentを再検証する。CONTENT_EDITORや他サービス管理者は対象外。
- 個人の弱点欄はProfileの復習必要フラグ等から固定文言を表示し、AI評価のweaknessesを表示しない。既存のPASS/REVIEW・技能改善集計と本人の評価閲覧は維持する。
- DB変更・Migration、管理者への個人回答閲覧許可、Provider呼出、本番データ変更は行わない。

## D-104: 販売可能な共通会員境界は既存Service Membershipを拡張する

- 日付: 2026-09-16
- 状態: Accepted
- Product boundary: 顧客固有の会員テーブルを追加せず、既存`Group`をService、`GroupMembership`をService Membershipとして再利用する。User全体を削除せず、対象Serviceだけを退会できる。
- Authorization: Module利用時はサーバーがslugと認証済みUserからACTIVE Membershipを解決し、公開中の最新Service規約への同意を確認する。ClientからworkspaceId、groupId、membershipId、userIdを受け取らない。
- Activity: 共通Membershipへ`lastUsedAt`を保持する。Module固有の内容、占い結果、投稿履歴、Memoryは記録しない。
- Withdrawal: 本人退会はMembershipを`REVOKED`にして監査を残す。共通User、Workspace Membership、他Service Membership、各Moduleの保持データは削除しない。
- Packaging: 占い、投稿支援、Point、Badge等はこの会員境界を利用する追加Moduleとし、顧客名、固定ID、LINE資格情報をCoreへ直書きしない。

## D-105: 通知同意と会員利用イベントをService Membership単位で分離する

- 日付: 2026-09-16
- 状態: Accepted
- Consent: 通知同意は`workspaceId + groupId + groupMembershipId + topic + channel`で管理する。既存のBunshin別投稿通知設定を流用せず、別Service・別Module・別Channelへ同意を波及させない。
- Event: 登録完了、初回利用、再訪、通知同意・解除、Service退会を共通イベントとして保存する。イベントはService Membershipに束縛し、本文、占い結果、投稿、Memory等のModule固有内容を保存しない。
- Idempotency: 登録・初回利用・退会はMembership単位、再訪はUTC日単位、通知変更は直前状態単位の冪等Keyで重複を防ぐ。
- Packaging: 顧客別の集計とModule追加に利用できる共通境界とし、顧客名やModule固有テーブルをCoreイベントへ固定しない。

## D-103: サービス管理者のLINE再送は自サービスの一時的失敗だけに限定する

- 日付: 2026-09-01
- 状態: Accepted
- Scope: SERVICE_OWNER と SERVICE_ADMIN は、所属サービスのLINE通知だけを再送できる。個人向け通知、他サービスの通知、バッジ通知は対象外とする。
- Safety: 失敗済み、未送信、再送可能なエラー種別だけを対象とし、同じ試行回への再送は一度だけとする。理由を必須にして、再送要求とジョブを監査可能に保存する。
- Privacy: サービス画面にはLINE ID、通知本文、秘密情報を表示しない。

## D-102: サービスごとの話題調査利用はサービス運営者が管理する

- 日付: 2026-09-01
- 状態: Accepted
- Ownership: サービス運営者は、自サービスで外部の話題を投稿案に使うかを設定できる。Provider、APIキー、費用上限はプラットフォーム管理者だけが管理する。
- Default: 既存サービスを止めないため、初期値は有効とする。
- Stop behavior: 無効化したサービスは新しい話題調査の対象から除外し、保存済みの話題候補も新しい投稿案に反映しない。既存の投稿案・調査履歴は削除しない。

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
- B-6B2C-Bでは、準備漏れ、Jobなし待機、DEAD、全体停止中待機、停止中Groupの残存配信を環境別に読み取り専用で照合する。管理画面からの自動修復や配信行削除は行わず、原因解消後の既存Schedulerまたは監査付き個別再送を使う。

## 2026-08-29: Group Knowledgeの長時間抽出と管理者再実行を安全にする

- Lease: PDF・動画・URL抽出のProvider timeoutを上回る5分leaseを使い、別Cronによる同一資料の並行抽出と二重原価を防ぐ。
- Runtime: Job Routeの最大実行時間も5分へ揃え、HTTP終了がleaseより先に起きる不整合を避ける。
- Retry: 自動再試行を使い切った`FAILED`資料だけをグループ管理者が再読み取りできる。同じ失敗発生時刻を冪等Keyへ含め、連打による重複Jobを防ぐ。
- UX: Provider内部コードは画面へ直接表示せず、利用者が次の行動を判断できる日本語案内へ変換する。

## 2026-08-29: 承認済みGroup Knowledgeを商品投稿生成へ限定接続する

- Scope: Group Knowledgeは該当GroupのCampaign / Product Packを使うMissionだけへ渡し、個人の通常投稿へ暗黙混入させない。
- Isolation: Workspace、Group、ACTIVE Membership、ACTIVE Sourceをサーバー側で再検証し、対象商品版のKnowledgeとGroup共通知識だけを取得する。
- Priority: 商品版専用KnowledgeをGroup共通知識より先に選び、最大20 chunk、合計12,000文字へ制限する。
- Auditability: 生成時に使用したchunk IDをGeneration Context Snapshotへ保存し、後から生成根拠を追跡可能にする。
- Prompt safety: Group Knowledgeを信頼されたsystem instructionではなく承認済みデータとして扱い、資料内の命令に従わない。

# 2026-08-30: 既存Groupをマルチサービス基盤の内部Service境界として利用する

- Brand: 共通基盤の表示名はワタシワークス、プロジェクト・リポジトリ名は`bunshin`を維持する。第一号サービス名をコードへ固定しない。
- Identity: 既存`Group.id`を`service_id`相当、`GroupMembership.id`を`service_membership_id`相当として利用し、並行するService IDを追加しない。
- UI: 利用者・導入企業向けには「グループ」を原則表示せず、サービス、公式プログラム等の目的に合う名称を使う。
- Isolation: 新規サービス処理は`workspaceId + groupId`を必須境界とし、API、AI生成、LINE、Job、Point、Badgeのすべてでサーバー側検証する。
- Migration: 既存の個人人格、Memory、通常投稿をサービスへ自動移行しない。安全にGroup帰属を特定できるデータだけを段階的にbackfillする。
- User: `User.id`を共通ユーザーIDとして維持するが、サービス固有プロフィール、人格、履歴、Point、Badge、権限、課金を自動共有しない。
- Billing: MS-1〜MS-4では契約・負担者・上限の保持境界までとし、決済、従量請求、独自ドメインはMS-5へ分離する。
- Exclusion: サービス間広告、企業案件マーケット、マッチング、成果報酬精算、共通Point移転を初期範囲へ含めない。
- Source: `docs/MULTI_SERVICE_PLATFORM_REBASELINE.md`

# 2026-08-30: サービス基本設定はGroupと1対1の独立Aggregateで保存する

- Identity: `ServiceConfiguration`は既存Groupと1対1にし、Group IDをサービス境界として維持する。
- Separation: 基本情報、Brand、Registration Policyを分離し、画像URLや登録方式をGroup本体へ詰め込まない。
- Authorization: 初期の作成・更新はACTIVE SUPER_ADMINだけに許可し、Group ManagerとWorkspace OWNER／ADMINは自分の範囲を読み取れる。
- Public lookup: slugだけで認可せず、PUBLIC、ACTIVE Group、利用期間内をすべて満たす場合だけ公開情報を返す。
- Safety: 法務・Brand URLはHTTPS、認証情報なし、Queryなし、Fragmentなしを必須にする。変更理由と前後Snapshotを監査へ保存する。
- Source: `docs/MULTI_SERVICE_FOUNDATION_CORE_REPORT.md`

# 2026-08-30: サービス新規作成はGroupと設定を同一Transactionで作成する

- UX: Platform AdminはGroupを先に作らず、サービス名、slug、Brand、登録方式を1画面で作成できる。
- Atomicity: Group、最初のManager、Service Configuration、Brand、Registration Policy、Auditを同一Transactionへ保存する。
- Authority: 新規作成はACTIVE SUPER_ADMINだけに許可し、対象はACTIVE ORGANIZATION Workspaceに限定する。
- Boundary: ClientにgroupIdや別のserviceIdを生成・指定させず、既存Group IDをTransaction内でサービス境界として確定する。
- Default: PRIVATE、INVITATION_ONLY、Email有効、LINE無効、Powered by表示から開始する。
- Source: `docs/MULTI_SERVICE_ADMIN_REPORT.md`

# 2026-08-31: AIキャラクター動画実証は支援方法と利用者別ゴールを分離する

- Program: AI女性キャラクター、ダンス、副業を固定機能にせず、Program Template、Service Program、Offering、Enrollmentの汎用階層で扱う。第一号Programとして自社副業サービスで実証する。
- Commerce roles: programOwner、seller、priceOwner、paymentOwner、apiCostOwner、supportOwner、contentOwner、characterOwnerを分離し、同一主体であることを前提にしない。
- Initial sales: 初期実証は無料・招待限定・手動Enrollmentとし、Checkout、請求、返金、売上分配、代理店報酬は販売プランPhaseへ分離する。
- Offering: 利用者は`IDEA_ONLY / GUIDED / READY_TO_USE`からサービスが許可した支援方法を選ぶ。GUIDEDは作り方・台本・Prompt、READY_TO_USEは運営確認済み完成動画を提供する。
- Video: 初期実証では生成AI動画Providerを自動実行せず、既存Video Renderを基に運営が確認した完成動画を対象利用者へ明示的に割り当てる。
- Goal: ゴールはサービスへ固定せず、サービス管理者の候補と利用者の目標値・期限・補足を組み合わせる。行動、集客、事業目標を分離する。
- Context: ACTIVE Goalは同じService・Membershipの週間計画とDaily Missionだけへ入力データとして渡し、別サービスや別利用者へ共有しない。
- Attribution: 外部成果計測URLとは別に、媒体・動画・投稿者別の登録経路Codeとサービス内Funnel Eventを記録する。URLへ個人情報を含めない。
- Measurement: PreferenceとOutcomeを分け、最低母数未達は`INSUFFICIENT_DATA`とする。確認できない因果関係をAIが断定しない。
- Scope: SNS自動投稿、Kling等の自動生成、報酬計算・支払い、一般サービスへの自動開放は含めない。
- Source: `docs/AI_CHARACTER_VIDEO_ACQUISITION_PILOT.md`

# 2026-08-31: 実践Programの原型・提供条件・参加条件を版管理する

- Template authority: Platform共通TemplateはSUPER_ADMIN、サービス限定Templateは当該サービスのSERVICE_OWNER／SERVICE_ADMINだけが作成・版追加できる。
- Adoption: サービスは公開済みのPlatform Template Versionまたは自サービス所有Versionだけを採用でき、原型の更新で採用中Versionを差し替えない。
- Offering: 販売者、価格決定、売上受取、AI原価、サポート、コンテンツ、キャラクターの責任主体をPLATFORM／SERVICEで個別保存する。
- Snapshot: Enrollmentへ参加時点のOffering条件とGoalを複製し、その後のOffering変更で過去条件を上書きしない。
- Isolation: Service Program、Offering、Enrollmentは`workspaceId + groupId`の複合外部キーでGroup、Membership、相互Resourceを拘束する。
- Initial scope: 永続化とCore権限制御のみを実装し、Checkout、請求、返金、売上分配、報酬、管理画面は含めない。
- Source: `docs/PROGRAM_FOUNDATION_CORE_REPORT.md`

# 2026-08-31: 公式Programの作成・採用・無料参加を管理画面へ接続する

- Official program: ACTIVE SUPER_ADMINだけがACTIVE ORGANIZATION WorkspaceへPlatform共通Programと最初の公開版を作成できる。
- Adoption: SERVICE_OWNER／SERVICE_ADMINは、自サービスから参照可能な公開版だけを採用できる。採用時に無料・招待限定・手動参加のOfferingを同一Transactionで作る。
- Enrollment: サービス管理者は、自サービスのACTIVE PARTICIPANTだけをACTIVE Offeringへ参加させられる。参加条件と目標はEnrollmentへSnapshot保存する。
- Isolation: 作成、採用、参加の各処理で`workspaceId + groupId`をサーバー側で再検証し、Client指定値だけを信用しない。
- Atomicity: Programと初版、Service ProgramとOffering、EnrollmentとAuditをそれぞれ同一Transactionで保存し、中途半端な状態を残さない。
- Initial scope: Checkout、請求、返金、売上分配、代理店報酬、動画Provider実行は含めない。
- Source: `docs/PROGRAM_MANAGEMENT_AV2_REPORT.md`

# 2026-08-31: Programの支援方針・希望・目標を独立Resourceにする

- Policy: サービスの支援方針はService Program単位で版管理し、同時にACTIVEな版を1件へ制限する。
- Preference: 利用者が欲しい支援方法はEnrollment単位で保存し、管理者が設定したSupport Policyとは分離する。
- Goal definition: サービス管理者が再利用できる目標候補と、利用者個別の目標・進捗を別Resourceにする。
- Measurement: 目標種別をACTION、TRAFFIC、BUSINESSに分け、利用者の好みと市場成果を同一指標へ混ぜない。
- Isolation: 全Resourceを`workspaceId + groupId`の複合外部キーでProgram、Enrollment、Membershipへ拘束する。
- History: 支援方針の旧版と終了済み目標を削除せず、監査・改善判断に利用できる状態で保持する。
- Source: `docs/PROGRAM_GOALS_CORE_REPORT.md`

# 2026-08-31: Program設定を管理者と参加者の別画面へ接続する

- Manager: SERVICE_OWNER／SERVICE_ADMINは自サービスの支援方針と目標候補だけを管理する。
- Member: ACTIVE Membership本人は、自分のACTIVE Enrollmentに対する希望と個別目標だけを更新する。
- Choice: 利用者が支援方法を選べるのはACTIVE Policyで許可されている場合だけとする。
- Goal history: 新しい個別目標を設定した場合、従来のACTIVE目標を削除せずCANCELLEDとして残す。
- UX: 管理者には「支援方法と目標候補」、参加者には「参加中のプログラムと目標」と平易な名称で表示する。
- Security: Same Origin、Session、Workspace、Service、Membership、Enrollmentをサーバー側で再検証する。
- Source: `docs/PROGRAM_GOALS_UI_REPORT.md`

# 2026-09-01: AIキャラクターの人格設定・許諾・画像を別Resourceとして版管理する

- Generic: 「美女」を固定Enumや専用機能にせず、任意の外見・世界観を持つ汎用AI Character Profileとして扱う。
- Ownership: PLATFORM、SERVICE、PERSONALの所有範囲を明示し、所有範囲に合わないGroup・User組合せをDBで拒否する。
- License: 権利者、商用利用、改変、再配布、期間、同意記録をLicense Versionへ保存し、Prompt VersionへSnapshotする。
- Version: 外見、世界観、基本Prompt、Negative Prompt、安全ルールを版管理し、公開版を同時に1件へ制限する。
- Asset: 基準画像は公開URLを保存せず、Private Storage Key、MIME、容量、SHA-256、権利確認日時を保存する。
- Isolation: SERVICE/PERSONALデータは`workspaceId + groupId`の複合外部キーでProfile・Version・Assetを拘束する。
- Source: `docs/AI_CHARACTER_PROFILE_CORE_REPORT.md`

# 2026-09-01: サービス管理者がAIキャラクターを段階的に公開する

- Flow: キャラクター作成、利用許諾記録、Prompt Version公開の順に進め、許諾なしの公開を禁止する。
- Authorization: ACTIVE SERVICE_OWNER／SERVICE_ADMINだけが自サービスのCharacterを管理できる。
- License gate: 公開時に同じService・Profileの有効なLicense Versionを再検証し、内容をSnapshotする。
- History: 新しいPrompt Version公開時は旧版を削除せずSUPERSEDEDにし、同時公開を1版へ制限する。
- Audit: Profile、License、Prompt Versionの作成・公開を専用Audit Logへ記録する。
- UX: 法務用語だけを並べず、「仕事で使える」「加工できる」「参加者へ渡せる」と平易に表示する。
- Source: `docs/AI_CHARACTER_ADMIN_REPORT.md`

# 2026-09-01: AIキャラクターの基準画像は非公開保存し、権限確認後だけ表示する

- Storage: 基準画像はPrivate Supabase Storageへ保存し、公開URL・共有URLをDBへ保存しない。
- Validation: JPEG、PNG、WebPのみを受け付け、容量・安全なファイル名・実データの形式をサーバー側で検証する。
- Authorization: アップロードはSame Origin、ログイン、サービス管理権限、公開済みCharacter Version、権利確認を必須とする。
- Display: 画像はログイン済みで同一Serviceの管理権限を持つ利用者だけへ認証済みAPIから配信し、ブラウザキャッシュを禁止する。
- Audit: 保存成功時はSHA-256等のメタデータとUPLOADED監査ログを残し、DB保存失敗時はStorage上のファイルを削除する。
- Scope: 削除・置換UI、顔照合、動画レンダリングへの参照画像固定は後続段階で実装する。
- Source: `docs/AI_CHARACTER_REFERENCE_UPLOAD_REPORT.md`

# 2026-09-01: 動画プロジェクトは選択時点のAIキャラクターをSnapshotで固定する

- Selection: 動画作成者は、同一Serviceで有効・公開済み・基準画像ありのAI Characterだけを任意選択できる。
- Snapshot: Character Versionの外見・Prompt・安全ルールと、READY Reference AssetのID・Storage Key・MIME・SHA-256をVideo Projectへ複製する。
- Isolation: 作成TransactionでworkspaceId・groupId・SERVICE Scopeを再検証し、別ServiceのCharacterや画像を指定できない。
- History: 既存Video ProjectのSnapshotは、Character設定・画像の後続変更で更新しない。
- Provider boundary: 現行標準Rendererは内部Prompt・Storage Keyを外部Providerへ渡さない。参照画像対応Providerは別Adapterとして後続導入する。
- Source: `docs/VIDEO_CHARACTER_REFERENCE_SNAPSHOT_REPORT.md`

# 2026-09-01: AIキャラクターの安全なSnapshotだけを動画企画へ反映する

- Planning: 動画企画を作る際は、作成者が所有する対象Video ProjectのSnapshotから、キャラクター名・見た目・世界観・安全ルール・基準画像数だけを企画AIへ渡す。
- Privacy: 基本Prompt、Negative Prompt、非公開Storage Key、画像データは企画AIにも外部Rendererにも渡さない。
- Isolation: Video Projectを`workspaceId`、`groupId`、所有者、Bunshin、Campaignで再検証し、別Serviceや別利用者のSnapshotを企画に混入させない。
- Rendering: 現行の標準動画は基準画像を使ったAI動画生成を行わない。参照画像対応Provider Adapterは外部チームの検証後に導入する。
- Source: `docs/VIDEO_CHARACTER_REFERENCE_SNAPSHOT_REPORT.md`

# 2026-09-01: 動画は利用者ごとの個別生成を基本とする

- Product: 同じ完成動画を複数の利用者へ配る仕組みを中心機能にしない。利用者ごとのVideo Project、分身、ゴール、SNS、キャラクター設定、許可済みコンテキストから個別動画を作る。
- Candidate: 参照画像・非同期Job・短尺動画を扱えるfal経由Klingを第一候補とし、Creatomateは字幕・静止画・文字演出の標準動画用として維持する。
- Boundary: Providerへの画像送信はサーバー側だけで行い、Private Storage Key、APIキー、画像の恒久公開URLをブラウザや通常ログへ出さない。
- Gate: Providerの実行前に、利用許諾、同一Service・同一利用者のProject Snapshot、原価上限、緊急停止、画像送信同意を再検証する。
- Source: `docs/VIDEO_AI_PROVIDER_RESEARCH.md`

# 2026-09-01: サービス運営者のお知らせは参加者ホームだけへ表示する

- Scope: サービス管理者はサービス設定から見出し・内容・表示の有無を管理できる。お知らせはログイン済み参加者の同一サービスホームだけへ表示する。
- Storage: 軽量な運営案内として既存のサービス登録設定JSONへ保存し、個人情報・既読履歴・配信履歴は作らない。
- Safety: 表示を有効にする場合は見出しと内容をサーバー側で必須とし、サービス設定更新の既存権限・監査理由をそのまま利用する。
- Boundary: お知らせの表示・非表示はLINE送信、機能の有効・無効、参加受付の停止を行わない。これらは既存の専用設定で管理する。

# 2026-09-01: 参加者ホームのお知らせは日本時間で開始・終了を予約できる

- Scheduling: サービス管理者は表示開始・終了を任意で設定でき、開始前・終了後のお知らせは参加者ホームに表示しない。
- Timezone: 管理画面の日時入力は日本時間としてサーバーでISO日時へ変換して保存する。
- Boundary: 任意の一斉LINE送信、配信予約、配信上限、同意、配信履歴は別の配信機能として扱う。今回のお知らせ予約では送信しない。

# 2026-09-01: 任意のサービスLINE配信は投稿通知と別Resourceで管理する

- Separation: 運営者の任意LINE配信はDaily MissionやReminderの通知テーブルを流用せず、下書き・予約・取消・完了を持つService Line Broadcastとして分離する。
- Audience: 初期対象は同一サービスのACTIVE PARTICIPANTだけとし、任意ユーザーID・別サービス・外部リストの指定を許可しない。
- Privacy: Broadcast本文、対象Membership、送信結果だけを保存し、LINEユーザーID、Access Token、顧客情報はBroadcastへ保存しない。
- Safety: 実送信はこのCore PRの対象外とする。次段階で、同意、停止中設定、サービス別LINE設定、上限、配信結果を確認してからRecipientを作成・実行する。

# 2026-09-01: 副業サービスの紹介特典はサービス別画像クレジットとして分離する

- Referral boundary: サービス登録への紹介コード・流入・成果は、商品紹介向けの`ExternalTrackingLink`および`{{referral_url}}`と混在させない。後続の公式紹介投稿では専用の`{{service_referral_url}}`を使う。
- Credit boundary: 既存Point残高は`workspaceId + userId`単位のため、紹介特典には流用しない。画像クレジット口座と台帳は`workspaceId + groupId + membership`単位で保存する。
- Attribution: 被紹介Membershipごとの確定紹介者は最大1人とし、確定後に後続クリックで置き換えない。クリックは個人情報を含まない匿名の流入証跡だけを保存する。
- Idempotency: 特典は紹介、ルール版、受益Membershipの組で一意にする。台帳の訂正は過去行の上書きではなく、返却または調整の追記で行う。
- Scope: CoreではURL発行・公開流入処理・クレジット消費・公式キャンペーン配信・不正判定・現金報酬を実装しない。
- Source: `docs/SERVICE_REFERRAL_CREDIT_CORE_REPORT.md`

# 2026-09-01: 紹介URLはログイン前後をまたいでサービス境界を再検証する

- Entry: 共有URLは `/r/{code}` とし、公開中かつ紹介を許可したサービスだけへサーバー側で遷移する。外部アフィリエイトURLの `{{referral_url}}` は使わない。
- Authentication: LINEとメールのログイン中は、固定形式の紹介コードとクリックIDだけを10分間保持する。任意URL、フラグメント、他のクエリは復元しない。
- Attribution: 登録時にコード、クリック、サービス、紹介者Membershipを再検証する。無効・期限切れ・別サービス・自己紹介は特典対象にしないが、通常の登録は妨げない。
- Source: `docs/SERVICE_REFERRAL_REGISTRATION_FLOW_REPORT.md`

# 2026-09-01: 紹介画像クレジットは成果発生時に一度だけ付与する

- Milestone: 初期設定完了と初投稿報告を、紹介特典ルールの評価契機にする。登録だけでは付与しない。
- Grant: 有効なルール、紹介関係、受益Membership、月間上限を同一トランザクションで確認する。対象外またはルール未設定なら何も付与しない。
- Ledger: 特典レコードを先に冪等作成できた時だけ残高を増やし、画像クレジット台帳へ追記する。失敗・再試行で二重付与しない。
- Scope: ルール設定画面、クレジット残高画面、失効処理、画像生成時の消費接続は後続Phaseとする。

# 2026-09-01: 紹介特典ルールはサービス管理者が版管理する

- 紹介特典は、サービス内で「初期設定完了」「最初の投稿報告」ごとに設定する。
- 特典を変更または停止する時は、既存のルールを上書きせず、新しい版を保存する。古い版はSUPERSEDEDにして、過去の付与根拠を残す。
- サービス管理者は、付与先、画像作成回数、有効期限、1人あたりの月間上限、有効・停止を変更できる。
- プラットフォーム全体のクレジットや、別サービスの特典へは影響させない。

# 2026-09-01: 画像作成回数は参加者自身がサービスごとに確認できる

- Visibility: 参加者向け画面では、今使える画像作成回数、直近の増減理由、増減後の残り回数、付与時の利用期限だけを日本語で表示する。
- Isolation: 口座と履歴の取得には、ワークスペース、サービス、参加情報、ログインユーザーをすべて一致させる。他サービスや他参加者の回数は表示しない。
- Separation: 画像作成回数は既存のワタシワークスポイントと混ぜない。紹介・キャンペーン・購入等の付与元は台帳の種別として保持する。
- Scope: 今回は読み取り画面のみ。画像作成時の消費、期限切れの自動処理、購入による付与は後続の専用処理で実装する。
- Source: `docs/SERVICE_CREDIT_BALANCE_REPORT.md`

# 2026-09-01: 期限付き画像作成回数は未使用分だけを失効する

- Expiry: 期限切れ時は、付与・消費・返却の追記台帳を古い順に再計算し、未使用の期限付き回数だけを失効する。
- Safety: 失効は新しい`EXPIRE`台帳行として記録する。同じ付与行には固定の冪等キーを使うため、定期実行の再試行で二重失効しない。
- Boundary: 失効処理はサービス別の口座だけを対象にする。ワタシワークスポイント、他サービス、他参加者の残高は更新しない。
- Source: `docs/SERVICE_CREDIT_EXPIRATION_REPORT.md`

# 2026-09-01: 画像作成回数はサービス内の画像作成時に優先して消費する

- Consumption: 参加者にサービス別画像作成回数口座がある場合、投稿用画像を作る時に1回だけ消費する。残高不足なら画像作成を始めない。
- Compatibility: 口座がない既存サービスは、従来のバッジ利用権またはワタシワークスポイントの仕組みを継続する。両方を同時には消費しない。
- Recovery: キュー登録に失敗した場合は、同じサービス・参加情報・ユーザーの口座へ1回を返却する。消費と返却は依頼ID由来の冪等キーを使い、再試行で二重処理しない。
- Scope: 期限切れ回数の自動失効と購入分の付与は後続で実装する。

# 2026-09-05: 初回登録の質問はサービスごとに必要最小限へ調整する

- Configuration: 業種、目的、活動情報、SNS、LINE通知同意の表示可否を、サービス登録設定JSONでサービスごとに管理する。未設定の既存サービスは従来どおり全項目を表示する。
- Proposal: 運営団体の種類と主な運営方法への回答から、費用や外部Providerを使わない決定的なルールで推奨質問を提示する。運営者は提案後に各項目を変更して保存できる。
- Validation: ブラウザーの入力だけを信頼せず、登録完了時に対象サービスの保存済み設定を再取得し、そのサービスで必須の質問をサーバー側で検証する。
- Boundary: 共通プロフィールをサービス間で暗黙補完せず、サービス独自の自由記述質問は既存のサービスオンボーディング回答として分離する。
- Source: `docs/SERVICE_CREDIT_IMAGE_CONSUMPTION_REPORT.md`

# 2026-09-06: 利用者本人の代理店URL登録は確認待ちのMEMBER URLとして保存する

- Responsibility: 運営者は外部サービス、許可ドメイン、有効化、停止を管理し、利用者は本人へ発行されたURLだけを登録・変更する。
- Ownership: API入力にMembership IDを含めず、認証Userと対象ServiceからACTIVE・同意済みMembershipをRepositoryで決定する。
- Review: 利用者入力は即時有効化せずDRAFTで保存する。使用中URLの変更も既存ACTIVE URLを確認前に置換しない。
- Validation: 既存のHTTPS、許可Domain、個人情報Query Key検証を再利用し、利用者によるDomain・商品・Campaign・状態の指定を許可しない。
- Audit: 本人による登録・変更も既存の外部URL監査履歴へ記録する。

# 2026-09-06: 紹介・ポイント・バッジはサービス共通画面から本人だけが確認する

- Reuse: 千ノ国メディアと副業向けで別実装を作らず、サービス参加者向けの共通「活動・紹介」画面を利用する。
- Referral: 紹介制度が有効な場合だけ、ACTIVEな本人のService Membershipへ固定した紹介コードを冪等発行する。紹介先の個人情報は表示せず、到達段階と日付だけを表示する。
- Sharing: コピー、端末共有、LINE共有、QRコードを提供する。QRは外部生成サービスへ紹介URLを送らず、サーバー内で生成する。
- Balance: サービス別画像クレジットとWorkspace共通ワタシポイントを同じ残高として合算せず、別項目として明示する。
- Badge: サービス画面では対象Group IDを持つバッジ獲得・進捗だけを表示し、他サービスの活動を混在させない。

# 2026-09-06: サービス紹介用投稿は本人の明示操作で作成する

- Separation: サービス参加への紹介URLは専用の投稿文生成ロジックで扱い、商品・代理店成果用の`ExternalTrackingLink`や`{{referral_url}}`へ混在させない。
- Consent: 通常のDaily Missionへ自動挿入せず、参加者が「紹介用の投稿文を作る」を押した時だけ作成する。SNSへの自動投稿は行わない。
- Disclosure: 生成文には`#PR`を必ず含め、参加者が投稿前に全文を確認・コピーできるようにする。
- Attribution: 紹介URLには投稿先だけを計測情報として付与し、氏名、メール、LINE ID等の個人情報を含めない。
- Cost: 初期版は決定的テンプレートを用い、AI Providerを呼び出さない。サービス共通機能として千ノ国メディアと後続の副業サービスで再利用する。
- Source: `docs/SERVICE_REFERRAL_CONTENT_REPORT.md`

# 2026-09-06: 本人の商品URLは確認済みURLから明示的に投稿文を作る

- Product fit: 利用者ごとのSNSコンテンツ提供というワタシワークスの役割に含め、千ノ国メディア固有ではなく副業向けにも使える共通機能とする。
- Review gate: 利用者が登録したURLのうち、運営者確認後に`ACTIVE`となった本人のURLだけを投稿文候補へ表示する。確認待ち・停止中URLは使わない。
- User intent: 通常のDaily Missionへ自動挿入せず、利用者が商品、伝えたいポイント、投稿先を入力して作成した時だけURLを含める。
- Accuracy: URL先から価格、効果、在庫等を自動取得しない。利用者が確認した事実を入力し、生成後の全文を確認して手動投稿する。
- Disclosure: 投稿文へ`#PR`を必ず含める。サービス参加紹介URLとは分離し、商品・代理店用の確認済みURLを使う。
- Cost: 初期版は決定的テンプレートを用い、AI Providerを呼び出さない。
- Source: `docs/MEMBER_PRODUCT_CONTENT_REPORT.md`

# 2026-09-06: 本人の商品情報はサービス参加情報と確認済みURLへ固定して保存する

- Persistence: 商品名、伝えたいポイント、対象者を端末内ではなくDBへ保存し、複数端末から同じ商品を再利用できるようにする。
- Isolation: 商品プロフィールを`workspaceId + groupId + groupMembershipId + userId`へ固定し、保存時と取得時の双方でACTIVEかつ同意済みの本人Membershipを再検証する。
- Link gate: 商品プロフィールは本人所有の`ACTIVE MEMBER` URLだけへ関連付ける。URLが停止した場合、その商品プロフィールも投稿作成候補から除外する。
- Audit: 作成・更新時はURL本文を重複保存せず、商品情報と関連Link IDを外部URL監査へ記録する。
- Scope: 削除、商品マスターへの昇格、AI個別生成、商品別成果集計は後続とする。
- Source: `docs/MEMBER_PRODUCT_PROFILE_REUSE_REPORT.md`

# 2026-09-06: 標準の参加質問はタップ選択を優先する

- Accessibility: 高齢の利用者を含むスマートフォン利用では、長文の自由入力を参加開始の必須条件にしない。
- Choice: 標準質問と千ノ国メディア向け質問は大きな単一選択ボタンで回答し、選択肢にない場合だけ自由入力を表示する。
- Custom fallback: 運営者が独自に追加した質問は内容を推測せず、従来どおり自由入力にフォールバックする。
- Compatibility: 保存する回答形式は文字列のままとし、既存の投稿パートナー提案およびサービス境界を変更しない。
- Source: `docs/SERVICE_ONBOARDING_CHOICE_OPTIONS_REPORT.md`

# 2026-09-06: 本人の商品紹介は分身設定から3案を明示生成する

- Intent: 保存済み商品と本人所有の分身を選び、Instagram、X、Threads向けの投稿文を明示操作時だけ3案生成する。
- Runtime: 本番管理画面で有効化済みのOpenAI設定を既存Runtime Resolver経由で再利用し、鍵を画面・ログ・DBの生成記録へ露出しない。
- Isolation: 商品、分身、承認済みURLは認証Userと対象Serviceからサーバーで再取得し、クライアント提供の本文やURLを生成根拠にしない。
- Safety: URLはProviderへ送らず、生成後に承認済みURLと`#PR`を強制する。Provider生成URL、未提供の事実、媒体上限超過を許可しない。
- Choice: 利用者は3案を選択・修正・コピーし、自分のSNSから投稿する。自動投稿は実装しない。
- Operations: 組織AI上限を消費し、モデル、Prompt版、Token、原価見積り、処理時間、成否を既存AI利用履歴へ記録する。
- Source: `docs/MEMBER_PRODUCT_AI_SUGGESTIONS_REPORT.md`

# 2026-09-06: 投稿案作成ボタンは処理中・失敗を必ず画面へ返す

- Compatibility: `crypto.randomUUID`がない古いアプリ内ブラウザでも、Web CryptoからUUID v4形式の冪等キーを生成する。
- Feedback: 押下直後に処理中表示へ切り替え、APIエラー、通信失敗、60秒の待機超過を画面へ表示する。
- Support: APIエラーでは公開用メッセージと受付番号だけを表示し、内部エラーや認証情報を露出しない。
- Scope: 投稿案生成の前提条件・生成内容・自動投稿しない境界は変更しない。

# 2026-09-06: 投稿案生成の409をすべて作成済みと扱わない

- Incident: 千ノ国メディアで「作成済み」と空の投稿案一覧が同時表示された。本番の該当時間帯の生成APIは409だったが、既存ログには詳細理由がなく、個別の失敗原因は未確定。
- Feedback: 保存済み、方針未承認、生成中、予定日未設定を既知のApplicationErrorのコードとメッセージの組で識別し、公開用の日本語とreasonへ変換する。不明なエラーの内部詳細は公開しない。
- Refresh: 成功または明示的なALREADY_EXISTSだけで一覧を更新する。HTTP 409だけでは作成済みと判断しない。
- Support: クライアントの受付番号をx-request-idで送信し、非JSON応答・通信失敗・待機超過でも表示する。生成APIは受付番号、公開エラーコード、分類、HTTPステータスだけを記録する。
- Scope: 既存の権限・サービス分離・生成前提条件は維持する。DB変更・追加環境変数は不要。

# 2026-09-06: 参加者本人の発信方針の保存・承認を許可する

- Evidence: 本番の受付番号`req_6049b7a4-10d7-452e-a1ff-15ba9111a0e4`でAI生成成功直後の保存がNOT_FOUNDとなった。投稿案側もSTRATEGY_REQUIREDを返している。
- Cause: 発信方針RepositoryだけがWorkspaceのOWNER/ADMINを必須とし、本人所有の分身を操作するMEMBERを拒否していた。
- Authorization: SNSプロフィール・週間予定と同じcanManageBunshin判定を使う。サービス指定時の本人所有条件、Workspace/Group一致、有効な所属、分身の非アーカイブ条件は維持する。
- Regression: 実DBテストにサービス内MEMBER本人の保存・承認成功と、他人（ADMIN含む）・別Workspace・別Group・Group未指定の拒否を追加する。
- Feedback: かんたん設定の各API呼び出しにも受付番号を付け、公開用エラーを表示する。
- Operations: migration・追加環境変数・本番データの変更は不要。

## 2026-09-06: サービス投稿案は初回設定後に自動で届ける

利用者の指摘により、手動生成を通常導線としていた実装を修正する。サービス参加者は初回にSNS・ペース・LINE通知同意を設定し、以後は既存cron/workerが週間予定の準備・確定・投稿案生成・通知を行う。予定のない日はエラーにしない。個人用機能の手動確定とSNSへの本人による投稿は維持する。詳細は `SERVICE_AUTOMATIC_DELIVERY.md`。

## 2026-09-07: 企業向け毎日発信アイデアはService Membership単位で生成・配信する

- Product: 和愛株式会社が運営する無料サービスとして、企業・店舗・個人事業主へ業種に合う発信アイデアを毎日または平日にLINEで届ける。
- Isolation: 業種、事業名、商品・サービス、目的、対象顧客は`ServiceMemberBusinessProfile`へ保存し、Workspace、Service Group、Membership、Userの複合参照で固定する。User共通プロフィールから暗黙補完しない。
- Generation: Service固有の事業プロフィールと業種別安全ルールを、投稿パートナー候補、週間計画、Daily Missionの公式Knowledgeへ渡す。
- Delivery: 専用テンプレートはLINE登録、毎日8時、発信アイデア、頻度固定を初期値とする。利用者は初回にSNSと通知時刻を設定し、以後の生成・通知は既存の冪等なJobで自動実行する。
- Resilience: AI Provider障害、品質拒否、AI上限到達時は決定的な安全予備案をDaily Missionとして保存し、通常のLINE配信へ接続する。
- Limits: AI利用枠はOrganization枠に加えてService単位でも予約・消費し、参加者上限はService参加時に適用する。
- Scale: Mission Schedulerは通知対象をIDカーソルで順次取得し、1,000件超の後続利用者も処理対象にする。
- Boundary: SNS自動投稿、画像・動画生成、メール配信、課金、業種別の個別法務審査は今回のFREE MVPに含めない。
- Source: `docs/WATASHI_WORKS_DAILY_IDEA_IMPLEMENTATION_REPORT.md`

## 2026-09-07: 毎日の配信内容はService初期値と参加者のProgram設定から決定する

- Levels: 発信アイデアを`IDEA_ONLY`、作り方・台本・配信用プロンプトを`GUIDED`、そのまま使える投稿案を`READY_TO_USE`へ対応させる。
- Default: Serviceの毎日配信設定を、そのServiceでProgramを割り当てていない参加者の初期値とする。
- Member plan: ACTIVEなProgram Enrollmentがある場合はEnrollmentのsupport modeを優先し、本人が許可された範囲で選んだPreferenceがあればさらに優先する。
- Generation: 決定したlevelをDaily Mission保存時に使用し、初回Social Profile作成時にも同じlevelを保存する。AI障害時の予備案も同じlevelで表示する。
- Boundary: 画像・動画本体の自動生成とLINEへの直接送信は別工程とし、今回の変更では開始しない。
- Source: `docs/WATASHI_WORKS_DELIVERY_PLAN_FOUNDATION_REPORT.md`

## 2026-09-07: 商用Serviceの画像枠はDaily Mission生成後に自動利用できる

- Opt-in: Service管理者が毎日配信の画像添付を有効にした場合だけ対象とする。既存Serviceは本文のみを初期値とする。
- Eligibility: `READY_TO_USE`の`IMAGE`または`SLIDE` Missionに限定し、Production、同意済みACTIVE Membership、Feature Entitlement、承認済み画像パイロットの既存Gateを維持する。
- Limit: Service商用設定の月間画像数を予約台帳で先に確保し、同じService・月・Missionの重複消費を防ぐ。画像完成と同じTransactionで消費し、失敗時は解放する。
- Delivery: 完成画像は`READY_FOR_REVIEW`のまま、短期署名URLをLINEへ確認用画像として添付する。SNSへの自動投稿や画像の自動採用は行わない。
- Fallback: 画像が処理中ならLINE Jobを再試行し、生成失敗または安全に画像URLを取得できない場合はDaily Mission本文の通知だけを送る。
- Boundary: 無料一般枠と動画生成は対象外とする。動画Provider接続は既存ロードマップの運営確認条件を維持する。
- Source: `docs/SERVICE_DAILY_IMAGE_LINE_DELIVERY_REPORT.md`

## 2026-09-07: 個人BUNSHINの一覧と詳細は同じ所有権境界を使う

- Incident: MEMBERの一覧に別User所有のBUNSHINが表示され、カードを開くと詳細側の管理認可で404になっていた。
- Authorization: 個人BUNSHINは本人所有だけを表示・取得する。WorkspaceのOWNER / ADMINは既存どおり所属Workspace内を管理できる。
- Error handling: 詳細画面はNOT_FOUND / FORBIDDENだけを404へ変換し、DB障害や不正データ等の内部エラーを404として隠さない。
- Isolation: Workspace外、Inactive Membership、ARCHIVED Bunshin、Service Bunshinは従来どおり対象外とする。
- Source: `docs/BUNSHIN_DETAIL_404_AUTHORIZATION_REPORT.md`

## 2026-09-07: 本番Schema不整合をmigration付き公開前Gateと定期readinessで防ぐ

- Deploy gate: Vercel Production buildは、保持済みのDB接続で`prisma migrate deploy`を実行し、最新migrationを読み取り専用で再確認してからApplicationをbuildする。
- Failure: migration、Schema Gate、Application buildのいずれかが失敗した場合、新deploymentは公開されない。PreviewとDevelopmentではmigrationを実行しない。
- Credential: 古いGitHub Environment secretを更新する方式はやめ、現在正常稼働しているVercel Productionの接続情報に一本化する。
- Connectivity: Vercel build machineはSupabaseのIPv6 direct hostへ到達できないため、migration実行中の`DIRECT_URL`だけ明示設定したIPv4 session poolerへ変換する。
- Monitoring: 正式ドメインのlive/readinessを15分ごとに確認し、DB接続と最新Schemaの両方を監視する。
- Error boundary: 画面で404へ変換するのは`NOT_FOUND` / `FORBIDDEN`だけとし、DB・Provider・設定・未知の障害は観測可能なサーバーエラーとして残す。
- Credential operation: DB password変更時はVercel Productionの`DATABASE_URL`と`DIRECT_URL`を同じ作業で更新する。
- Source: `docs/PRODUCTION_SCHEMA_SAFETY_REPORT.md`

## 2026-09-07: 毎日の字幕動画と動画生成枠を一緒に接続する

- Scope: 利用者の依頼に基づき、毎日配信の画像設定へ字幕動画と併用設定を追加する。
- Automation: 明示的に有効化されたServiceの完成原稿から30秒の字幕動画を準備する。SNSへの投稿判断は本人に残す。
- Content: 投稿本文と必須表記を省略しない。制作指示や外部AI向けPromptは字幕に転用しない。長文は文章通知を継続する。
- Quota: 個別AI場面と完成合成で同一プロジェクト版の動画枠を共有する。Service行ロックで同時予約を直列化し、完成MP4保存と同じTransactionで消費する。失敗で解放し再試行で再予約する。
- Delivery: 完成動画は既存の本人確認URLをLINEへ送る。動画ファイル添付、AIキャラクターの自動選択、素材写真の生成入力は後続作業とする。
- Source: docs/DAILY_VIDEO_MEDIA_INTEGRATION_REPORT.md

## 2026-09-07: 機能完成度監査の是正と提供範囲の明示

- Scope: ユーザーの一括対応依頼を受け、誤った利用開始を防ぐ変更と退会処理の補完をまとめる。
- Video: 写真合成・音声合成は提供予定を維持するが、出力実装が揃うまで選択・企画・出力を許可しない。既存の字幕動画とAI動画を維持し、未対応企画を単色背景へ黙って置き換えない。
- Account deletion: 本人所有の追加メディアをStorageから削除してから退会完了とする。停止から24時間の待機、リース検証、所有者照合、ページ処理、削除失敗時の再試行を設ける。共有組織素材は従来の手動確認を維持する。
- Configuration: Runwayと独自ドメイン公開は提供準備中として扱う。設定保存を機能の稼働と同一視しない。
- Follow-up: 写真・音声の実生成、写真再利用、運営者LINE動画添付、独自ドメイン公開、決済自動化はこの修正だけで完成扱いにしない。
- Source: docs/FUNCTIONAL_COMPLETENESS_REMEDIATION_REPORT.md

## 2026-09-07: 本人写真と同意済みAIナレーションを標準動画へ接続する

- Photo scope: 本人が利用許諾を確認して保存した画像・ロゴを5枚まで選び、企画の場面順に繰り返して合成する。
- Isolation: 写真はWorkspace、Group、Membership、Owner、MIME、期限、保存パスを作成時・承認投入時・実行時に再確認する。
- Narration: 利用者が明示的に有効化した場合だけ、確認対象の場面台本をOpenAI `tts-1`へ送り、24kHz mono PCMから固定長WAVを構成する。完成動画には「AI音声」を表示する。
- Reliability: レンダー単位の音声状態とPrompt Version、モデル、声、試行文字数、推定原価、処理時間、成否を保存する。一時障害は同時実行を排除して最大3回まで再試行する。
- Retention: 音声は非公開Storageへ90日保存し、期限切れ処理と退会処理の対象に含める。
- Boundary: SNSへの自動投稿、写真自体のAI生成、AI動画場面の仕様変更は含めない。
- Source: `docs/VIDEO_PHOTO_NARRATION_IMPLEMENTATION_REPORT.md`

## 2026-09-07: 本人商品の投稿活動は生成単位と追記イベントで集計する

- Record: 投稿本文や専用URL本文を複製せず、本人商品プロフィール、分身、承認済み専用URL、公式商品との参照と候補数だけを生成単位で保存する。
- Activity: コピーと本人申告の投稿完了は、生成単位・候補番号へ紐づく追記イベントとして保存し、再送や連打で同じ操作を重複計上しない。
- Isolation: 作成時と活動記録時にWorkspace、Service、Membership、User、商品プロフィール、BunshinをRepositoryで再検証する。
- Visibility: 参加者は本人の商品別集計だけを確認する。サービスのコンテンツ担当者以上は商品別の匿名集計を確認できるが、参加者の投稿本文は取得・表示しない。
- Meaning: 専用URL使用数は、承認済みURLを含む投稿案を作成した回数であり、外部サイトでのクリック数・購入数・成果発生数とは扱わない。
- Source: `docs/MEMBER_PRODUCT_ACTIVITY_REPORT.md`

## 2026-09-07: Daily Missionの別案は本体と分離した追記履歴として保持する

- Mission: 通常のDaily Missionは引き続き同一日・同一Bunshinにつき1件とし、一意制約を変更しない。
- Variant: 別案本文は元Missionへ紐づく`MissionContentVariant`として追記し、初期上限を1件に固定する。
- Observation: 生成claim、成功、失敗にはモデル、Prompt Version、token、推定原価、処理時間、エラー区分を保存する。
- Selection: 「この案を使う」は本文の上書きではなく選択履歴へ追記し、最新の選択を現在値として扱う。
- Isolation: すべての操作でWorkspace、Service、User、Bunshin、Daily Missionの一致と有効なMembershipを再検証する。
- Source: `docs/MISSION_CONTENT_VARIANT_FOUNDATION_REPORT.md`

## 2026-09-07: 別案は元Missionの生成文脈と現在の利用権を両方検証する

- Context: Generation Context SnapshotのIDと版から原案の生成文脈を復元し、現在も同じWorkspace、Service、User、Bunshinから参照できる場合だけ生成する。
- Link: AIが出力したURLは除去し、コピー可否を再確認した元Missionの承認済みURLだけを同じ配置先へ復元する。
- Difference: 原案とのSimHash類似度が85%以上の候補は保存しない。
- Safety: CampaignとProduct Packを現在時点で再解決し、Campaign重複審査と広告表現審査を通過した候補だけを保存する。
- Observation: 生成と品質審査ごとにAI枠を予約し、別案生成試行には合計token、固定リクエスト原価、処理時間、失敗区分を残す。
- Source: `docs/MISSION_CONTENT_VARIANT_GENERATION_REPORT.md`

## 2026-09-07: Daily Missionの別案は元本文を上書きせず画面上で選択する

- UI: 配信済みのDaily Missionにだけ「別の案を見る」「内容を直す」を表示し、Mission自体の自動配信は維持する。
- Selection: 「この案を使う」で選択履歴を追記し、最新の選択案を表示・コピー対象として解決する。元Mission本文は変更しない。
- Correction: 利用者の修正指示は500文字以内とし、別案生成時の追加指示として扱う。元Missionの必須表記と許可済みURLは引き続きサーバー側で固定する。
- Service: Service、Workspace、Membership、User、Bunshinの範囲はURLやリクエスト本文から信用せず、公開Service文脈からサーバー側で導出する。
- Copy: Service画面ではコピー直前に専用URLの有効性と承認状態を再確認し、変更・停止・確認待ちの投稿案をコピーさせない。
- Source: `docs/MISSION_CONTENT_VARIANT_UI_REPORT.md`

## 2026-09-08: Daily Missionの別案生成は版管理されたWP交換を先に予約する

- Price: 必要WPを画面へ固定値で埋め込まず、現在有効な`ALTERNATIVE_PLAN_GENERATION`カタログから取得する。
- Consent: 「別の案を見る」と「内容を直す」は必要WPを表示し、利用者が確認画面で了承した場合だけ生成APIを呼ぶ。
- Validation: 画面で了承した価格をAPIへ渡し、サーバー側の現在価格と一致しない場合は予約前に停止する。
- Lifecycle: AI生成前に最大60分のポイント予約を作成し、派生案の保存完了後だけ確定する。生成・品質・安全・保存処理が失敗した場合は予約を解放する。
- Retry: Mission IDと生成冪等キーを交換対象に含め、同じ送信の再試行は同じ予約を使う。失敗後の新しい生成は新しい冪等キーで予約できる。
- Confirmation failure: 派生案保存後の確定処理だけが失敗した場合は自動解放せず、同じ冪等キーの再試行で確定できる状態を維持する。
- Balance link: 複数Workspace所属時は交換対象Workspaceをポイント画面へ明示し、本人が所属する場合だけその残高を表示する。
- Source: `docs/MISSION_CONTENT_VARIANT_POINT_REDEMPTION_REPORT.md`

## 2026-09-08: Service専用LINE通知先を現在のセッションに紐付けて復旧する

- メールで利用中のService参加者が動画完成通知を復旧できるよう、通知同意と専用LINE OAuthを独立した接続画面にする。
- 現在の所有者・Service所属と単回state/PKCE/nonceを検証し、ログインIdentityやアカウントの統合は行わない。
- Groupだけに所属する本人の通知許可を認め、停止設定とService/Bunshinの境界を維持する。
- 完成済み動画は再生成せず、23時間以内の抑止取消通知だけを一意ジョブで再開する。
- Source: `docs/SERVICE_LINE_LINK_RECOVERY.md`

## 2026-09-13: 運営者の動画配信も初回送信内容を固定してLINEへ添付する

- Delivery: 運営者が割り当てた完成動画は、既存の通知許可、本人接続、配信停止、Quota、所有範囲を通過した場合に動画メッセージと確認リンクを同じPushで送る。
- Retry: 初回送信前に宛先、認証情報のハッシュ、本文、署名URL、Retry KeyをDeliveryへ保存し、同時実行と再送では保存済みの内容だけを使う。
- Compatibility: 過去通知の再送と24時間以内に期限を迎える動画はリンク通知を維持する。既存通知へ期限付き動画URLを後付けしない。
- Privacy: 通知Snapshotを通常APIへ返さず、退会処理で消去する。平文のLINEアクセストークンは保存しない。

## 2026-09-14: ワタシワークス全体・運営団体・プロジェクトを3階層に固定する

- Hierarchy: ワタシワークス全体はシステム管理だけを担当し、その直下に運営団体を置き、すべてのプロジェクトを運営団体の配下へ置く。
- Mapping: 運営団体は`Workspace(type=ORGANIZATION)`、プロジェクト本体は`Group`、公開名・URL・ブランド・登録方法はGroupと1対1の`ServiceConfiguration`で表現する。
- Authorization: `PlatformAdmin`と`WorkspaceMembership`を分離した既存方針を維持し、どちらの権限も他方へ暗黙付与しない。
- Visibility: 団体管理者は団体内の全プロジェクトを確認できる。プロジェクトだけを管理する人には親団体と自分が管理するプロジェクトだけを表示し、団体全体の管理権限は与えない。
- UI: システム管理画面と運営者画面の「グループ」を「プロジェクト」へ統一し、公開設定をプロジェクトとは別の階層に見せない。
- Data example: 運営団体Aの配下に「千ノ国メディア」「副業」、運営団体ワタシワークスの配下に「企業向け」を置ける。

## 2026-09-14: ワタシワークス公式を運営団体配下へ初期設定する

- Structure: `運営団体ワタシワークス`の配下へ`企業向け`プロジェクトを作り、その公開サービス設定を`ワタシワークス公式`とする。
- Ownership: 既存の千ノ国メディアを管理するLINE認証済みサービス責任者を、運営団体OWNERおよび企業向けプロジェクトSERVICE_OWNERとして明示的に割り当てる。
- Offering: 企業・店舗・個人事業主向けの無料サービスとして、業種や商品に合わせた完成投稿文を毎日8時にLINEへ届ける初期設定を使用する。
- Launch gate: 問い合わせ先、公開済み利用規約・プライバシー文書、LINE経路と接続が確認されるまでサービスは非公開とし、MigrationではLINE通知を開始しない。
- Source: `docs/WATASHI_WORKS_OFFICIAL_SERVICE_SETUP_REPORT.md`

## 2026-09-14: 公開サービス名の変更で親プロジェクト名を変更しない

- Boundary: `Group.name`は運営団体配下のプロジェクト名、`ServiceConfiguration.displayName`は利用者に見せる公開サービス名として独立して管理する。
- Update: サービスの見た目・登録設定を保存しても親Groupを更新せず、ブランド、登録方法、公開サービス設定だけを保存する。
- Result: `企業向け`プロジェクトの公開名を`ワタシワークス公式`として運用しても、管理階層のプロジェクト名は`企業向け`のまま維持される。

## 2026-09-14: 企業向け無料サービスの投稿パートナー選択を省略する

- Entry: 利用者は事業情報を登録した後、投稿パートナー候補を選ばず、SNSと受信時刻の設定へ進む。
- Default partner: 会社名、商品・サービス、目的、対象顧客、事業の特徴、希望する文章の雰囲気から、利用者専用の標準投稿パートナーを1件だけ作成する。
- Existing member: 同じServiceに利用者本人の投稿パートナーがある場合は新規作成せず、その投稿パートナーを再利用する。
- Preparation: SNS選択とLINE通知同意後、Content Pillar、Social Profile、Strategy、週間予定の準備を既存の一括設定で進める。
- Boundary: 投稿パートナー候補を選ぶ従来導線は、事業プロフィールを使わない他Service向けに維持する。
- Source: `docs/WATASHI_WORKS_BUSINESS_ONBOARDING_REPORT.md`

## 2026-09-14: ポイント・バッジの無料試験は登録済み一般参加者を全員対象にする

- Eligibility: 対象Serviceで利用中の一般参加者が利用規約へ同意すると、ポイントとバッジを自動で利用できる。
- Operation: 運営者による参加者の個別選択、個別許可、30人上限を廃止し、今後登録する一般参加者も自動で対象に加える。
- Boundary: Serviceの機能許可、試験期間、一括停止、ポイント付与条件は引き続き適用する。サービス所有者、運営管理者、コンテンツ担当者は自動対象に含めない。
- Privacy: 規約同意前、参加停止中、または別Serviceの参加者には利用を許可しない。
- Source: `docs/REWARDS_ALL_REGISTERED_PARTICIPANTS_REPORT.md`

## 2026-09-15: 独自ドメインはVercelとDNSの実確認後だけ公開する

- Registration: SUPER_ADMINが利用ホスト名を保存し、Vercel Project Domains APIへ登録する。契約で独自ドメインが停止中の場合は操作を許可しない。
- State: 所有確認前を`DRAFT`、所有確認済みでDNS接続待ちを`VERIFIED`、Vercel Domain Configuration APIが正常接続を返した場合だけ`ACTIVE`とする。
- Routing: Next.js Proxyが`ACTIVE`なホスト名をService slugへ解決し、Service、Workspaceがともに利用中の場合だけ内部Service URLへrewriteする。
- Authentication: Proxyが検証した独自ホストをリクエスト内部ヘッダーで渡し、同一Origin検証とLINE／メール認証のcallback URLへ使用する。外部から渡された同名ヘッダーはProxyで必ず削除する。
- Boundary: Vercel API tokenとSupabase Redirect URLは運用環境へ別途設定する。認証情報をDBやリポジトリへ保存しない。
- Source: `docs/CUSTOM_DOMAIN_ROUTING_REPORT.md`

## 2026-09-16: 占いも共通Service会員状態と通知同意を使用する

- Membership: 占いの利用可否は`GroupMembership.status=ACTIVE`と最新の規約同意を正とし、`FortuneParticipant.withdrawnAt`を参照しない。
- Extension: `FortuneParticipant`は年齢確認と既存の占い結果参照を保持するCapability固有拡張として残す。
- Notification: 週次占い通知の本人同意は`ServiceNotificationPreference(topic=FORTUNE_WEEKLY, channel=LINE)`へ統一し、占い固有の`notificationEnabled`を参照・更新しない。
- Migration: 旧設定で通知ONかつ現在も有効な参加者だけを共通設定へ移す。既に共通設定がある場合は明示的な停止を含む現在値を上書きしない。
- Compatibility: 旧カラムは段階移行中の互換用としてDBに残すが、アプリケーションからは利用しない。十分な運用確認後に別Migrationで削除する。
- Package boundary: 占いパッケージは通知Topicだけを公開し、会員・同意・通知保存の実装は共通Service基盤へ委譲する。

## 2026-09-16: 週次占いLINE通知は本人同意を送信直前にも確認する

- Schedule: Service運営者が曜日と時刻を設定し、占い公開中かつ週次通知が有効なServiceだけを定期Schedulerの対象にする。
- Consent: `ServiceNotificationPreference(topic=FORTUNE_WEEKLY, channel=LINE)`、ACTIVE会員、参加同意、年齢確認済みの占い参加状態を準備時に確認し、配信時にも通知同意と会員状態を再確認する。
- Routing: GroupのLINE経路設定に従い、共有LINEではWorkspaceの接続、専用LINEではGroupの接続と確認済み専用設定を使用する。
- Idempotency: 環境、Service、配信日から作る自動配信キーで、同じ週次案内を同日に複数回作らない。
- Privacy: LINE本文はサービス名、一般的な案内、サービスURLだけとし、占い結果、テーマ、カード、氏名を含めない。

## 2026-09-16: 占いを版付きService作成テンプレートとして提供する

- Template: 新しい運営団体・プロジェクトへ導入するときは`FORTUNE_DAILY_GUIDANCE`テンプレートを選び、パッケージキーと版をServiceのOnboarding設定へ保存する。
- Safe defaults: 登録は公開LINEを初期値とするが、占い公開、AI個別化、週次通知はすべて停止状態から開始する。
- Provisioning: サービス作成後、既存のService管理権限で担当の投稿パートナー、標準解釈468件、法務文書、ブランド、問い合わせ先を確認し、既存の公開ゲートを通過した場合だけ占いを公開する。
- Navigation: 占いテンプレートまたは既存の占い設定を持つServiceにだけ占い運営メニューを表示する。その他のServiceへ製品固有メニューを混在させない。
- Upgrade: パッケージ版はOnboarding設定に残し、将来の設定追加や有償パッケージ更新で対象Serviceを判別できるようにする。

## 2026-09-16: 占い標準パッケージを1操作で非公開導入する

- Install: 占いテンプレートを選んだServiceだけが、専用の占い担当、`FORTUNE`能力、標準解釈468件を1回の操作で導入できる。
- Atomicity: 担当、能力、設定、解釈は単一DBトランザクションで保存し、途中失敗時に一部だけ残さない。
- Idempotency: すでに占い設定がある場合は担当や解釈を追加せず、保存済みの導入結果を返す。
- Safety: 導入直後も利用者公開、AI個別化、週次通知を停止したままにし、法務、ブランド、問い合わせ先の公開条件を省略しない。

## 2026-09-16: 占い公開条件へ公式LINEの稼働確認を追加する

- Guidance: 占い管理画面は、パッケージ、サービス情報、利用規約、プライバシーポリシー、公式LINEの5項目を固定順で案内する。
- Action: 未完了項目には設定先へのリンクを表示し、導入先の運営者が別の管理メニューを探さずに準備を進められるようにする。
- LINE gate: 共通LINEはシステム設定の稼働状態、専用LINEは利用設定、接続確認、エラー、配信停止を確認し、利用可能な場合だけ公開条件を満たす。
- Publication: 5項目が揃うまで`FortuneServiceSetting.enabled`を有効化しない。

## 2026-09-16: 占いの運用品質をService単位の集計で確認する

- Window: 公開後の品質判断は直近30日の占い結果を対象にし、利用者数、AI結果、標準文、失敗、処理停滞を集計する。
- Threshold: AI利用中の標準文切り替えが20%以上なら経過確認、50%以上、失敗率10%以上、または10分以上の処理停滞があれば対応必要とする。
- Standard mode: AIを停止しているServiceでは標準文表示を正常動作として扱い、切り替え率に数えない。
- Privacy: 運用品質画面には個人名、占いテーマ、カード、結果本文を表示しない。

## 2026-09-16: 占い結果の閲覧完了と選択式評価を記録する

- Completion: 結果生成時ではなく、利用者が表示可能な結果ページを初めて開いた時刻を`FortuneReading.firstViewedAt`へ記録する。履歴一覧は要約だけを表示し、詳細を開くまで閲覧完了に数えない。
- Feedback: 閲覧済みの結果に限り、3段階評価と任意の定型理由を1件保存する。同じ結果への再回答は既存回答を更新する。
- Validation: 評価値と理由は固定候補だけを受け付け、自由文や占い本文を評価レコードへ保存しない。
- Scope: 閲覧記録と評価更新ではService、参加者、会員本人、結果所有者をすべて照合し、別Serviceや別利用者の結果を更新しない。
- Reporting: 運営者には直近30日の閲覧者、別日の再利用者、評価別・理由別件数だけを表示し、氏名と占い内容は表示しない。

## 2026-09-16: 占いAIの上限と利用原価は共通Service基盤で管理する

- Ledger: 占いAI生成は共通の`AiUsageEvent`へ`FORTUNE_DAILY_READING`として成功・失敗、トークン、概算原価を記録し、占い専用の重複台帳を作らない。
- Quota: 外部AIを呼び出す前に`ServiceAiGenerationReservation`でService月間枠を確保し、システム管理者が設定する`ServiceCommercialSetting.monthlyAiGenerationLimit`を正とする。
- Operator view: 占い運営画面には当月のService全体の利用数・上限と、占い担当に限定した成功・失敗、トークン、概算AI原価を読み取り専用で表示する。
- Unknown price: Provider単価が未設定の呼び出しは0円と断定せず、概算に含まれない件数を表示する。
- Rejection accounting: 月間枠の拒否などProviderへ到達していない失敗には、リクエスト原価を記録しない。

## 2026-09-16: 占いv1の限定公開は共通Service参加枠で100人に制限する

- Default: `FORTUNE_DAILY_GUIDANCE` v1の導入時に、Service契約設定がなければ無料・100人上限を作成する。既存の契約設定は上書きしない。
- Existing services: 既存の占いServiceで契約設定がない場合もMigrationで同じ初期値を補う。
- Enforcement: `ServiceCommercialSetting.includedMemberLimit`と共通Service参加処理を利用し、占い専用の定員テーブルを追加しない。
- Concurrency: 新規参加時はService設定行をトランザクション内でロックしてから参加者数を数え、同時登録による上限超過を防ぐ。
- Counting: 契約人数には`PARTICIPANT`の有効・承認待ち参加だけを数え、Service所有者や運営担当者を利用者枠として消費しない。
- Operations: 占い運営画面には登録参加者数、上限、残り参加枠だけを表示し、参加者の個人情報は表示しない。

## 2026-09-16: 占い退会は共通Service会員だけを停止する

- Scope: 利用者は占い設定画面から対象の占いServiceだけを退会し、共通Userと他Serviceの会員状態を維持する。
- Authority: 本人の`PARTICIPANT`会員だけを退会対象とし、管理者権限を利用者向け退会APIから変更しない。
- Data separation: 退会で占い結果行を別サービスへ移動または公開せず、ACTIVE会員要件により本人画面からの閲覧を停止する。
- Re-entry: 公開受付中のServiceでは、退会済み参加者も最新文書へ再同意して再参加できる。再参加も参加者上限の確認対象とする。

## 2026-09-16: 占いの登録・継続ファネルは共通Serviceイベントから集計する

- Source: 新規登録、初回利用、再訪、通知同意、退会は`ServiceMembershipEvent`を正とし、占い専用の分析イベントを重複作成しない。
- Scope: 集計は対象Workspace・Serviceと直近30日に限定し、他Serviceのイベントを混在させない。
- Counting: 同一参加者の同種イベントは期間内で1人として数え、再訪回数の多い利用者が人数を水増ししないようにする。
- Privacy: 運営画面には人数だけを表示し、氏名、テーマ、カード、占い結果を表示しない。

## 2026-09-16: 占い結果の閲覧期間をすべての参照経路で統一する

- Boundary: 保存日数は日本時間の当日を含む日数として計算し、履歴一覧と個別結果へ同じ境界を適用する。
- Direct access: 期限を過ぎた個別結果は、保存済みURLからも表示せず、閲覧完了記録と評価を受け付けない。
- Deletion: 本人による削除と同日再抽選を防ぐ最小記録は既存方針を維持し、今回の変更では物理削除しない。

## 2026-09-16: 保存期間を過ぎた占い結果を日次処理で物理削除する

- Schedule: 本番環境の保護されたCronを日次実行し、各Serviceの`historyRetentionDays`を日本時間の日付で評価する。
- Scope: 期限切れの`FortuneReading`を物理削除し、関連する選択式評価も外部キーの連鎖削除で除去する。
- Draw safety: 公開APIは当日の日付でしか抽選できないため、保存期間を過ぎた過去行の削除は同日再抽選防止を弱めない。
- Idempotency: 対象行そのものを削除するため、再実行時は残っている期限切れ行だけを処理する。

## 2026-09-16: 占いパッケージの導入版とシステム最新版を運営画面へ表示する

- Source: ServiceのOnboarding設定に保存された`fortunePackage.key`と`version`を導入版の正とする。
- Status: 導入版とコードが提供する最新版を比較し、最新版、更新可能、未対応の新しい版、版情報なしを区別する。
- Safety: システムより新しい版は占いServiceとして認識しつつ、設定変更を控えてシステム管理者へ連絡する案内を表示する。
- Scope: 今回は版の可視化と判定を実装し、版固有のデータ移行を伴う自動更新は追加しない。

## 2026-09-16: 専用LINE未接続のService参加者を配信開始扱いにしない

- Finding: 千ノ国メディアでは利用中14名に対して専用LINEの送信対象が1名だけであり、共通LINEログイン済みでも専用LINE未接続のまま自動配信設定を保存できていた。
- Gate: ServiceのLINE経路が`DEDICATED`の場合、対象Serviceの有効な接続、友だち状態、通知同意を確認してから自動配信を有効化する。
- Recovery: 既に投稿設定が保存されている参加者にも、投稿パートナー画面の先頭で専用LINE接続を案内する。設定内容は保持し、接続完了後の次回投稿予定日から配信する。
- Shared LINE: 共通LINEを使うServiceでは従来のWorkspace接続確認を維持する。
- Messaging: 登録完了通知はServiceの頻度に合わせ、毎日、平日、投稿予定日のいずれかを明記する。

## 2026-09-16: 占いパッケージv2を運営画面から安全に適用する

- Update: 導入版がシステム最新版より古い場合、Service運営者が占い管理画面から明示的に更新する。
- Preserve: 更新時は公開状態、独自解釈、AI、週次通知、既存の契約設定を上書きせず、版情報と不足している初期契約だけを補う。
- Idempotency: 最新版への再更新はデータを書き換えず、システムより新しい版や占い未導入Serviceの更新は拒否する。
- Version: 更新操作を提供する現在の標準パッケージをv2とし、新規作成Serviceにはv2を設定する。

## 2026-09-17: 占いパッケージの新規提供を運営団体の契約で管理する

- License: `OrganizationEntitlement.fortunePackageEnabled`を占いパッケージの新規提供可否とし、初期値は無効にする。
- Enforcement: 契約が有効な運営団体だけが占いテンプレートでServiceを作成し、未導入Serviceへ標準パッケージを初回導入できる。
- Period: 団体契約の一時停止、開始日時、終了日時を新規導入判定にも適用する。
- Continuity: 導入済みServiceの公開、既存結果、設定、パッケージ更新は停止せず、新規販売許可と既存運用を分離する。
- Audit: 許可の変更は既存の運営団体契約画面から理由付きで保存し、変更前後を契約監査へ記録する。

## 2026-09-17: 占いパッケージの導入・更新履歴をService単位で記録する

- Record: 初回導入と実際に版が上がる更新だけを、設定変更と同じDBトランザクションで監査履歴へ記録する。
- Detail: 履歴には対象Service、変更前後のパッケージ版、日時、実行者を保存し、占い利用者の情報と結果本文は保存しない。
- Idempotency: 導入済みパッケージの再実行と最新版への更新操作では、変更も重複履歴も作らない。
- Operations: Service運営者は占い管理画面で直近20件の導入・更新履歴を確認する。

## 2026-09-17: 占いパッケージの導入状況をシステム管理画面で横断確認する

- Inventory: 占い設定済み、または占いテンプレート選択済みのServiceを導入対象として一覧化する。
- Signals: 団体契約、公開状態、導入版、更新要否、5項目の公開準備、参加者数を表示する。
- Authority: 一覧は`SUPER_ADMIN`限定とし、システム管理者へService運営権限を暗黙付与しない。
- Actions: 一覧から団体契約と公開設定へ移動できるようにし、Service運営者専用画面への権限迂回は作らない。

## 2026-09-17: 専用LINE接続の完了状態と次の操作を明示する

- Consent: 同意前は接続ボタンを無効にし、最初にチェックを付ける手順を画面内に表示する。
- Progress: 送信後はLINE本人確認を開いている状態を表示し、二重送信を防ぐ。
- Completion: 接続と友だち状態の確認に成功したら投稿パートナー設定へ戻し、完了メッセージを表示する。
- Failure: 失敗時は未完了であることを見出しで明示し、同意、ログイン、友だち追加を確認して再実行できる画面を維持する。

## 2026-09-17: 利用者向け操作の処理中・完了・失敗表示を統一する

- Feedback: 保存、認証、参加、決定などの送信直後に処理中の文言を表示し、完了まで同じ操作を無効にする。
- Completion: 成功後は状態を更新し、完了済みの選択肢を残さず、次に必要な操作だけを表示する。
- Failure: 通信・認証・保存の失敗は通常の説明文と区別し、未完了であることと再実行方法を明示する。
- Mobile: 利用者向けの主要操作はスマートフォン幅で横にはみ出さず、全幅ボタンとカードのまとまりを基本とする。

## 2026-09-17: 占いマニュアルをService単位で共通提供する

- Participant: 占いパッケージまたは占い設定を持つ公開Serviceでは、共通の`/manual`に初心者向け手順を表示する。
- Branding: 見出しと問い合わせ先はService設定から取得し、販売先ごとのコード複製を避ける。
- Operator: 運営手順はService管理権限で保護した`/manage/fortune/manual`に分離し、公開準備画面から案内する。
- Existing service: 千ノ国メディアの投稿支援マニュアルは同じURLで従来内容を維持する。

## 2026-09-17: 占いの公開準備と実運用確認を分ける

- Configuration: 占い担当、標準解釈、サービス情報、利用文書、LINE接続の5項目を公開前の設定確認とする。
- Operation: 公開後に別のテスト利用者で登録、占い作成、結果閲覧まで実行し、実データを使って動作確認済みと判定する。
- Feedback: 結果評価は運用品質画面まで確認する推奨項目とし、初期の運用開始は妨げない。
- Privacy: 運営画面には確認人数と件数だけを表示し、利用者名、選択テーマ、カード、占い本文を表示しない。

## 2026-09-17: 占いの会員・通知状態を共通Service基盤へ完全移行する

- Notification: 占い週次通知の同意は`service_notification_preferences`の`FORTUNE_WEEKLY`だけを正本とする。
- Membership: 参加中・退会済みの状態は`GroupMembership.status`だけを正本とする。
- Cleanup: 移行済みでアプリケーション参照のない`fortune_participants.notification_enabled`と`withdrawn_at`、旧検索Indexを削除する。
- Retention: 年齢確認と過去の占い結果を結び付ける`fortune_participants`行自体は保持する。

## 2026-09-18: AI物販V1の次Action判定をProgram Coreと物販固有Policyへ分離する

- Runtime: `ProgramMissionAssignment`、`ProgramActionEvent`、`ProgramProgressSnapshot`を提示、事実、現在状態の正本として維持する。
- Boundary: 共通Application層は`NextActionPolicy`と判定結果の形式だけを定義し、`ITEM_FIND`等の意味、商品状態、優先順位は`capability-resale`が所有する。
- Decision: Next Best ActionはRuleが1件だけ決定し、AIは判断を変更しない。`WAIT`は`reevaluateAt`を必須とする。
- Evidence: DAY7の`LISTED`はAction完了申告だけで判定せず、`ResaleItem`の出品状態または`FIRST_LISTING` Eventを根拠にする。
- Continuity: PAUSEDはユーザー操作の最終時刻を基準とし、正式なWAIT期間を無活動日数へ含めない。
- Events: ユーザーの「できなかった」は`ACTION_NOT_COMPLETED`、技術的失敗は`ACTION_FAILED`として分離する。
- Scope: この段階ではDB、API、画面、LINE、決済へ接続せず、純粋なcatalog、日付計算、状態遷移、Policyとunit testだけを追加する。

## 2026-09-18: AI物販V1のAction/Event/Snapshotは既存Program Runtimeへ保存する

- Decision: AI物販専用のAction/Event/Snapshotテーブルは作らず、`ProgramMissionAssignment`、`ProgramActionEvent`、`ProgramProgressSnapshot`を正本として再利用する。
- WAIT: `ProgramMissionAssignment`へ`actionMode`、`reasonCode`、`reevaluateAt`を、Progress Snapshotへ`nextEvaluationAt`を追加し、WAITをJSONだけに閉じ込めずJobから検索可能にする。
- Capability boundary: 商品固有状態だけを`ResaleItem`として追加し、Program Coreへ商品状態や反応状態を混ぜない。
- Tenant boundary: `ResaleItem`はWorkspace、Group、Enrollment、EnrollmentのMembership、Owner Userを複合外部キーで結び、別会員・別運営団体の商品を参照できないようにする。
- Concurrency: 作成はEnrollment単位のidempotency key、更新はrevisionによる楽観ロックを使う。商品状態は前進のみ許可する。
- Scope: この段階ではDB、Repository、domain validationまでを実装する。PolicyからAssignment/Event/Snapshotを一括更新するOrchestratorとWeb/API/Job接続は次の作業単位とする。

## 2026-09-18: AI物販V1の無料Enrollmentと次Action評価を既存Cronへ接続する

- Enrollment: `ServiceProgram.settings.moduleKey = AI_RESALE_V1`かつ`FREE_7D`、自動登録が明示されたProgramだけを対象にする。公開サービス登録と同じtransactionでEnrollmentを作り、既存会員はCronで補完する。
- Clock: `ProgramEnrollment.startsAt`は公開サービスへの同意時刻とOffering利用開始時刻の遅い方を正本とし、既存会員を開始前の期間で不利にしない。Program dayはProgram設定のtimezoneで計算し、無料期間は開始時刻から7暦日後までとする。
- Orchestration: Policyは判断だけを行い、RepositoryがAssignmentとProgress Snapshotを同一transactionで保存する。DAY7分類はEvent、Snapshot、Enrollment完了を同一transactionで保存する。
- Idempotency: Enrollmentは既存unique key、DAY7はEnrollment単位のevent idempotency key、Action評価はSnapshot revisionとAssignment sequenceで競合を検出する。
- Boundary: サービス名、料金、LINE ChannelをPolicyへ埋め込まない。Program固有設定はServiceProgramが所有し、固定fallback文はAI障害時にも現在Actionを表示するためCapability側が所有する。
- Scope: この段階では自動Enrollment、Runtime Orchestrator、定期評価までとし、利用者向けAction API/UI、結果入力、LINE通知、Offer UIは後続作業とする。

## 2026-09-18: AI物販V1の参加者画面は現在Actionと結果記録に絞る

- UX: 参加中プログラムから「今日やること」を開き、1つのAction、理由、手順、所要時間だけを表示する。
- Result: `DONE`、`PARTIAL`、`NOT_DONE`を記録し、Action固有の最小情報だけを追加で受け取る。
- Immediate next: 結果保存後にPolicyを再評価し、画面遷移なしで次のActionまたはWAITを表示する。
- WAIT: 作業不要を正式な状態として表示し、完了ボタンは出さず、次の確認予定を案内する。
- Boundary: 操作できるのはServiceの有効な参加者本人だけとし、Workspace、Group、Enrollment、Membership、Userを全て照合する。
- Consistency: 商品更新、結果Event、Assignment終了、Progress更新を同じSerializable transactionへまとめ、UUIDの冪等キーとrevisionで重複・競合を防ぐ。
- Scope: LINE通知、DAY7有料Offer、決済はこの変更へ含めず、現在Actionの利用経路が安定した後に接続する。

## 2026-09-18: AI物販V1の現在Action通知はService LINE配信を再利用する

- Delivery: Daily MissionへProgram Assignmentを混在させず、既存`ServiceLineBroadcast`、Recipient、Job、配信履歴、再送経路を利用する。
- Idempotency: 通知はEnvironmentとAssignment IDを含む`automationKey`で一意にし、Cron再実行で二重作成しない。
- Recipient: 有効なService参加者本人について、通知同意、友だち状態、専用LINEまたは共用LINEの有効な接続を確認する。未接続なら通知済みにせず、後続Cronで再評価する。
- Freshness: 実送信直前にもEnrollment、Program、Progressの現在Assignment、Assignment状態を照合し、結果入力後の古いActionを送らない。
- Link: Service slugとEnrollment IDから本人用Action URLを組み立て、未ログイン時は既存の安全な`returnTo`で同じ画面へ戻す。
- Message: WORK、WAIT、RECOVERYを区別し、Action判断はRuleの結果を変更せず、固定文面へ変換するだけにする。
- Scope: この変更では通知設定・配信・直接導線までとし、DAY7 Offerと決済は次の作業単位に分ける。

## 2026-09-18: AI物販V1のDAY7 Offerと有料利用権を分離する

- Offer: 無料Enrollmentの分類EventとProgress Snapshotを正本にし、標準・モニターの料金と申込み先を`ProgramOffering.termsSnapshot`から取得する。
- Transition: 価格理由の辞退時だけモニターを表示し、参加者の申込み操作はEvent記録に留める。
- Entitlement: pilotでは外部入金を管理者が確認して確認番号を入力した時だけ`PAID_90D` Enrollmentを開始し、90暦日後に共通Runtimeで失効させる。
- Boundary: 実決済を装うPurchase／Paymentは作らず、Webhookを含む決済基盤は別工程とする。

## 2026-09-18: AI物販DAY7 Offer通知とファネルは既存記録を再利用する

- LINE: `ServiceLineBroadcast`と既存Jobを利用し、`AI_RESALE_OFFER`を配信境界として追加する。
- Eligibility: DAY7分類済み、標準Offer未処理、LINE通知同意・友だち状態が有効な本人だけを候補にする。
- Revalidation: 送信直前にOffer状態を再取得し、辞退・申込み・有料開始後は送信対象から外す。
- Funnel: Program Action Event、進捗スナップショット、LINE Recipientを集計し、集計専用テーブルは追加しない。

## 2026-09-18: 投稿別スクリーンショット結果を次回企画へ反映する

- Input: SNS APIを必須にせず、利用者が投稿単体のインサイト画面を選び、画像から読み取った数字を確認して保存する。
- Storage: 投稿との関係を失わないよう`PostRecord.manualMetrics.socialPerformance`へ保存し、既存の問い合わせ・予約実績を維持する。画像自体は保存しない。
- Boundary: 保存対象のPostRecordはWorkspace、Service Group、Bunshin、Owner Userを全て照合し、別参加者の投稿を選択できないようにする。
- Analysis: いいね、コメント、保存、シェア、プロフィール閲覧、フォロー増加を投稿単位で比較する。3件未満では傾向を断定せず、記録継続を案内する。
- Generation: 直近28日間の投稿別実績を週間企画の`recentPerformance`へ渡し、反応の強いテーマを別の切り口へ展開する。数値や因果関係を公開文面へ書かない。

## 2026-09-18: 投稿別改善メモは既存の週次レポートLINEへ統合する

- Delivery: 新しい通知種別を増やさず、運営者が曜日と時刻を設定できる既存の週次レポート配信へ改善メモを追加する。
- Window: 対象週の終了日時から直近28日間に保存された投稿別反応を利用し、週内の投稿が少ない場合も比較材料を維持する。
- Privacy: Workspace、Service Group、Bunshin Owner、Actor Userを照合した本人の投稿だけを集計し、LINEには個人別の改善メモと本人用レポートURLだけを含める。
- UX: LINE本文は反応数を羅列せず、一つの改善方針と基準テーマを伝える。詳細な投稿別数値は認証済みWebレポートで確認する。

## 2026-09-18: OEM商用利用量はWorkspace単位のMAUとして確定する

- Billing tenant: OEM契約と請求の単位は`Workspace(type=ORGANIZATION)`とし、配下の複数Service Groupを合算する。
- Evidence: ログインや自動生成を数えず、参加者本人が成功させた対象操作だけを`ServiceUsageEvent`へ冪等記録する。
- Exclusion: Platform Admin、Workspace OWNER/ADMIN、Service運営RoleはMAU対象外とし、ACTIVEなPARTICIPANTだけを数える。
- Calculation: 月中はAsia/Tokyoの半開区間で`COUNT DISTINCT userId`相当を表示し、月末後は`TenantMonthlyUsage`へ料金表versionとともに確定する。
- Immutability: FINALIZED後の月次値はService層の再確定防止とDB triggerの両方で更新・削除を禁止する。
- Pricing: 初期版は0〜100人19,800円から1,001〜3,000人198,000円までを共通Policyに置き、3,001人以上は個別見積として自動金額を確定しない。
- Boundary: SNS固有画面は対象イベントを発生させるだけとし、集計・料金・月次確定を共通Application/Database境界へ置く。

# 2026-09-18: OEM契約・請求は確定MAUと外部決済をつなぐProvider非依存台帳にする

- Context: 運営団体ごとのMAU料金は確定できるが、契約状態、請求先、請求済み・入金済みの管理が存在しなかった。決済Providerと税務上の請求書仕様は未決定。
- Decision: Workspace単位の`OrganizationCommercialContract`、確定MAUと一対一の`TenantInvoice`、変更履歴`CommercialBillingAudit`を追加する。内部台帳には確定金額と外部参照番号を保存し、税務上の請求書発行と決済は外部Providerへ委ねる。
- Safety: OEM権限がない団体は契約を有効化できない。請求操作はPlatform SUPER_ADMINだけが行い、団体管理者は自団体の発行済み請求だけを閲覧する。状態遷移とWorkspace条件をServiceで強制する。
- Automation: 月次MAU確定後、契約中の団体へ下書き請求を冪等に作成する。個別見積は自動請求しない。
- Consequence: 手動請求で商用運用を開始でき、将来Stripe等を接続してもCoreの契約・利用・請求根拠を置き換えずに済む。

## 2026-09-18: 商用請求の全体管理と個別見積を内部台帳で完結させる

- Operations: Platform SUPER_ADMINは全運営団体の下書き、未入金、期限超過、入金済みを一画面で確認し、経理用CSVを出力する。
- Custom quote: 3,001 MAU以上の確定月は自動金額を設定せず、合意した金額を管理者が入力した時だけ請求台帳を作る。
- Boundary: 入力金額は確定MAUを変更せず、Workspaceと未請求の月次利用を照合して一対一の請求へ変換する。
- Accounting: 内部台帳は消費税計算や適格請求書発行を担わない。正式な請求書は外部サービスで発行し、番号と入金参照を内部台帳へ記録する。
- Provider: Stripe等の接続先が決まるまではProvider固有コードを追加せず、契約・利用量・請求状態を共通基盤として維持する。

## 2026-09-18: OEMの決済先は運営団体ごとに所有する

- Ownership: エンドユーザー向け商品の決済接続は`Workspace(type=ORGANIZATION)`単位で保持し、各OEM運営団体の`OWNER / ADMIN`が自社のStripe設定を管理する。
- Boundary: 契約、MAU、内部請求台帳はProvider非依存のまま維持し、Stripe接続情報は外部連携境界へ分離する。Programの`paymentOwner=SERVICE`から所属Workspaceの有効な設定を解決する。
- Security: 秘密鍵とWebhook署名シークレットは用途分離したAES-GCMで暗号化し、平文の再表示、監査ログへの保存、別Workspaceからの参照を許可しない。
- Activation: 秘密鍵の保存だけでは利用開始せず、Stripe APIでアカウントを確認した設定だけを有効化できる。保存、接続確認、有効化、停止を監査する。
- Scope: この段階は決済接続設定までとし、購入画面、Checkout、Webhookによる入金確定、返金は後続作業とする。

## 2026-09-19: Vercelの自動デプロイをproductionブランチへ限定する

- Cost control: Pull Request、作業ブランチ、`main`の更新ではVercel Deploymentを作成せず、ビルド費用の重複を防ぐ。
- Branch roles: `main`を開発統合先、`production`を本番公開先とする。公開は`main`から`production`へのPull Requestで行う。
- Enforcement: `apps/web/vercel.json`は全ブランチを既定で無効化し、`production`だけを明示的に許可する。回帰テストで設定を固定する。
- Operations: Vercel Project SettingsのProduction Branchも`production`へ変更する。`production`への直接pushとforce pushは行わない。
- Consequence: `main`へのマージだけでは本番へ反映されない。公開担当者は差分とCIを確認してrelease Pull Requestを`production`へマージする。

## 2026-09-19: 共通Program販売はversioned Offeringと運営団体所有の決済を再利用する

- Product boundary: AI物販専用DAY7 Offerは変更せず、共通の有料Programを`PROGRAM_ACCESS / DIRECT`のversioned termsとして`ProgramOffering`へ保存する。
- Server authority: 価格、期間、通貨、Membership、Workspace、Service Groupはサーバー側のOfferingと認証主体から解決し、ブラウザー入力を請求根拠にしない。
- Entitlement: Stripeの署名済みWebhookで入金確認後にだけ期間付き`ProgramEnrollment`を作り、購入時点のOffering条件と決済参照をsnapshotへ残す。
- Legal gate: 新規販売とCheckoutにはサービス単位の利用規約、プライバシーポリシー、特定商取引法に基づく表示の公開を必須とする。商取引表示は参加登録の同意対象には含めない。
- Lifecycle: 商品停止・改版後も開始済みCheckoutの正当な入金は履行し、購入済みEnrollmentは維持する。直接購入の重複はApplication判定とDB部分一意indexで防ぎ、Checkout作成失敗は`FAILED`へ移して再試行を可能にする。
- Limitation: 現行の一会員・一Program制約を維持するため、同一Programの更新購入はこの作業範囲に含めない。

## 2026-09-19: 失敗した決済WebhookはStripeの正本Eventから再処理する

- Payload: カード情報やProvider payloadの保持範囲を増やさず、失敗台帳にはEvent ID、digest、分類だけを保存する。
- Recovery: 運営団体の暗号化済みStripe秘密鍵で同じEvent IDを再取得し、初回受信と同じdispatcherへ渡す。
- Isolation: Workspace、実行環境、Provider、設定状態、FAILED状態を再処理前に照合し、再取得したEvent IDの一致も必須とする。
- Idempotency: 購入、Enrollment、返金、Webhook台帳の既存冪等性を再利用し、再処理専用の状態変更経路を作らない。
- Audit: 運営者の理由を必須にし、要求・成功・失敗を既存の決済設定監査履歴へ追記する。秘密値やProvider responseは監査へ含めない。

## 2026-09-19: Webhook未着の支払い待ちはStripe Checkoutの正本状態と照合する

- Scope: `CHECKOUT_OPEN`かつ保存済みSession IDを持つ、自Workspace・現在環境の購入だけを手動照合できる。
- Authority: 運営団体の暗号化済みStripe秘密鍵でSessionを再取得し、Session IDと`metadata.purchase_id`を内部購入台帳と照合する。
- Transition: `paid`は既存の購入確定、`expired`は既存の期限切れdispatcherへ渡し、未払い・受付中は状態を変更しない。
- Idempotency: 照合用Event IDとdigestを作り、購入・Enrollment・Event台帳の既存冪等性を利用する。遅延Webhookも別Eventとして安全に処理する。
- Audit: 照合理由を必須とし、要求・成功・変化なし・失敗を決済設定監査へ追記する。Stripe response本文は保持しない。

# 2026-09-19: OEM決済の異議申立ては返金と分離し、利用権を可逆に停止する

- Boundary: Stripeの署名検証後にWorkspace、Payment Configuration、Payment Intent、金額、通貨、実行環境を照合し、他団体の購入を更新しない。
- Lifecycle: 開始時は `DISPUTED`、勝訴は `PAID`へ復旧、敗訴は `CHARGEBACK_LOST` とする。異議申立て前のEnrollment状態をSnapshotし、勝訴時だけ可逆に戻す。
- Accounting: 係争額と返金額を別カラムで保存し、差引売上は二重控除を避けるため両者の大きい方を総額から除く。
- Ordering: 解決済みの同一Disputeに遅延した開始イベントが届いても再開しない。Webhook Event IDとProgram Action Eventの冪等Keyで再送を無害化する。
- Privacy: StripeのWebhook本文や証拠は保存せず、Dispute ID、状態、金額、時刻とdigestだけを保持する。

## 2026-09-19: OEM月額利用料は基盤側Stripeで請求台帳と一対一に回収する

- Separation: OEM各社がエンドユーザー売上を受け取る決済接続と、ワタシワークスがOEM月額利用料を回収するStripeを分離する。
- Authority: Checkoutの金額、請求番号、Workspaceは確定MAUから作成済みの`TenantInvoice`だけを正本とし、ブラウザー入力を請求根拠にしない。
- Payment: `EXTERNAL_BILLING`契約の`ISSUED`請求だけを団体OWNER/ADMINが支払い、署名済みWebhookで金額・通貨・Session・Workspaceを照合して`PAID`へ更新する。
- Idempotency: Stripe Event IDを専用台帳で一意にし、Checkout作成にも請求単位のidempotency keyを付ける。Webhook本文とカード情報は保存しない。
- Scope: 今回はHosted Checkoutと自動入金消込までとし、カード保存による無操作の自動課金、督促、税計算は後続作業へ分離する。

## 2026-09-19: サービス固有の禁止語は生成境界で適用する

- Scope: 千ノ国メディア（`sennokuni-media`）では英字の独立語`OVE`を禁止し、生成文では`ORI`を使用する。
- Isolation: 表記ルールはService slugに結び付け、ワタシワークス公式や他の運営団体・サービスには適用しない。
- Enforcement: AIへの表記指示に加え、週間計画、投稿戦略、投稿本文、再生成案を保存・品質確認する前にサーバー側で正規化する。
- Boundary: 共通生成Providerへ千ノ国固有語を直書きせず、サービス固有Policyとして外側から適用する。

## 2026-09-20: OEM請求の自動案内は団体単位の明示的な利用開始を必須にする

- Decision: `automatic_reminders_enabled`の初期値を`false`とし、契約中かつ運営者が明示的に有効化した団体だけを自動送信対象とする。
- Reason: 既存の請求先へ機能追加直後からメールが送られる事故を防ぎ、テスト請求で確認してから段階的に利用開始できるようにする。
- Delivery: 支払期限3日前の案内と期限超過後の案内を各1回送信し、手動送信と共通の監査履歴で重複を判定する。失敗は送信済みにせず翌日再試行する。
- Scope: 保存カードによる自動決済、複数回督促、団体別スケジュール設定は後続作業とする。

## 2026-09-20: OEM請求の自動案内失敗は請求監査へ残す

- Decision: 自動案内の送信失敗を通常案内と期限超過案内に分けて`CommercialBillingAudit`へ保存する。
- Reason: 定期処理の集計ログだけでは運営者が団体の請求画面から失敗を把握できず、再送判断が遅れるため。
- Recovery: 失敗は送信済み判定に含めず翌日の定期処理で再試行し、運営者は既存の手動送信ボタンでも再送できる。
- Boundary: Providerの応答本文や認証情報は監査履歴へ保存せず、請求と案内種別と実行日時だけを保存する。

## 2026-09-20: OEM請求案内の未解決失敗を全体請求画面へ集約する

- Decision: 請求中の請求に関する最新の案内送信結果を運営団体横断で集約し、失敗が最新結果である場合だけ要確認として表示する。
- Reason: 団体別画面を順番に開く運用では、OEM提供先が増えた際に送信失敗を見落とすため。
- Recovery: システム管理者を団体別請求画面へ案内し、既存の管理者メール確認と手動再送を利用する。
- Boundary: 新しい監視テーブルは追加せず、請求台帳と監査履歴を正本として利用する。

## 2026-09-20: OEM請求先は実請求前に保存済み宛先へテスト送信する

- Decision: 運営団体の保存済み請求先へ、請求書や決済を作らない接続確認メールを送信できるようにする。
- Authority: 実行者はシステム管理者に限定し、接続確認済みで利用中の管理者メール設定だけを使用する。
- Safety: 件名と本文でテストであること、支払いや操作が不要であることを明示し、請求番号・金額・決済URLは含めない。
- Audit: 成功と失敗を契約監査へ記録する。認証情報とProvider responseは保存しない。

## 2026-09-20: OEM月額請求書は発行時SnapshotからPDFを生成する

- Source of truth: 確定MAUから作成した`TenantInvoice`の請求番号、期間、金額を請求書の正本とし、PDF側で金額を再判定しない。
- Snapshot: 請求済みへの遷移時に請求元、請求先、税額、支払期限をJSONで固定し、後の設定変更で発行済み文書を変えない。
- Tax: 既存の決済総額を変えず税込総額として扱い、10%内税を表示する。登録番号は確認済みの環境設定がある場合だけ表示する。
- Access: システム管理者と対象団体のOWNER/ADMINだけが、請求済みまたは入金済み文書を取得できる。
- Audit: 再発行専用の可変文書を作らず同じSnapshotから再生成し、各ダウンロードを既存の請求監査へ記録する。

# 2026-09-20: 千ノ国メディアの旧企画名を生成禁止にする

- Scope: `sennokuni-media`だけで「戦国インフルエンサー」「戦国メタバース」を禁止し、生成時は「千ノ国メディア」へ置換する。
- Historical terms: 「戦国時代」「戦国武将」「戦国文化」は一般的な歴史表現として許可し、部分一致する「戦国」だけを禁止しない。
- Enforcement: サービス固有Knowledgeで生成前に指示し、生成後は本文・見出し・スライド等の全テキスト項目へ同じPolicyを適用する。
- Link preview: 外部サイトのOGPに禁止語が残る旧企画URL（`project=sengoku-influencer`）は生成結果から除外し、SNS側で禁止語のプレビューが再表示されないようにする。
- Existing settings: 千ノ国メディアの保存済みOnboarding・Survey設定と利用者マニュアルに残る旧名称も「千ノ国メディア」へ更新する。

# 2026-09-20: OEM自動回収は明示同意と初回支払い後に準備する

- Default: 既存・新規契約とも自動回収は停止から開始し、システム管理者が契約上の同意を確認した団体だけ有効化する。
- Payment method: 初回のStripe Checkoutで`off_session`利用を設定し、成功済みPaymentIntentをStripe APIで再確認してからCustomer IDとPayment Method IDだけを保存する。
- Sensitive data: カード番号、Webhook本文、Stripe応答本文は保存しない。
- Rollout: 本変更は支払方法の準備までとし、実際の日次自動回収と未払い停止は準備済み契約だけを対象とする後続作業へ分離する。

# 2026-09-20: OEM登録チャネルを運用テンプレートから分離する

- Registration channel: サービス運営者はメールのみ、LINEのみ、または両方をサービス単位で選択できる。
- Existing service: ワタシワークス公式を含む既存サービスの保存値は変更せず、運営者が明示保存した場合だけ変更する。
- Business free policy: 公開登録、招待コード停止、紹介元記録停止、毎日配信の制約は維持するが、企業向けであることを理由にLINE専用へ強制しない。
- Email boundary: 認証メールと登録完了後の自動返信は分離し、OEM固有の送信元・本文・資格情報は後続のメール配信基盤で扱う。

# 2026-09-20: OEMの登録完了メールは認証メールから分離する

- Registration email: 登録・承認完了後の案内メールはサービス単位で設定・配信する。
- Authentication: ログイン用のメールマジックリンクは認証基盤の責務として維持し、運営者向け本文編集の対象にしない。
- Provider: 共通メール基盤とOEM専用Resend APIキーを選択できる。専用キーはサービス・環境に紐づく暗号化データとして保存する。
- Safety: テスト送信成功前は送信キューを作らず、配信は冪等・最大3回・サービス単位の履歴管理とする。

# 2026-09-21: AI研修の初期診断は既存ProfileとProgram Goalへ分けて保存する

- Assessment: 職種、AI経験、現在の利用用途、困りごと、希望テーマ、1日の学習時間、Learning CatalogのGoal Keyを既存`TrainingParticipantProfile`へ保存する。
- Goal: 利用者へ表示する30日後の目標は新しいGoalテーブルを作らず、既存`ProgramMemberGoal`を正本として同一トランザクションで更新する。
- Catalog: 選択肢は`AI_TRAINING_CATALOG_V1`として固定Keyと表示文を分離し、将来Service別Catalogへ差し替えられる境界を研修Capability内に置く。
- Privacy: 初期診断は選択式とし、顧客名、個人情報、社外秘を収集する自由入力欄は設けない。
- UX: スマートフォンで情報量が集中しないよう、診断を4段階に分け、現在位置と戻る操作を表示する。

# 2026-09-21: AI研修の課題品質は研修Capability内のVersioned Catalogを正本にする

- Boundary: 共通`ProgramDefinition V1`は課題の識別・進行管理に維持し、学習目的、実務場面、条件、成功基準、よくある失敗、評価基準はAI研修Capability固有のCatalogへ置く。
- Consistency: 課題画面の表示スナップショットとAI回答評価は同じCatalogを参照し、表示した条件と異なる基準で評価しない。
- Version: 初版を`AI_TRAINING_MISSION_QUALITY_V1`として固定し、公開後の意味変更は新しいVersionで行う。
- Compatibility: 既存Assignmentの`TRAINING_FIXED_V1`表示スナップショットは読み取り時にCatalogから不足項目を補い、進行中の受講者を止めない。
- Scope: Skill別評価、難易度の動的変更、Mission遷移への利用は後続PRとし、本変更では25課題の実務定義と評価入力の整合を確立する。

# 2026-09-21: AI研修の進級判定はSkill評価をDomain Ruleで確定する

- Skills: V1では指示構造、背景設定、条件指定、出力制御、実務活用、改善力の6能力に固定する。
- AI boundary: AIは理解度と能力別スコア、根拠、次の推奨能力を構造化して返すが、PASS/REVIEWを決定しない。
- Domain rule: 理解度と対象能力がすべて60以上の場合だけPASSとし、未達の場合は対象能力のうち最低スコアを復習対象にする。
- Projection: 評価全文は既存`TrainingMissionAnswer`、監査は`ProgramActionEvent`に維持し、Enrollment単位の現在値だけを`TrainingParticipantProfile.skillScores`へJSONで投影する。
- Scope: 既存値のうち今回評価した能力だけを更新する。動的難易度、復習Mission、進級への接続は次のAdaptive Policy PRで扱う。

# 2026-09-23: 個別化精度を段階的な回答・複数回傾向・生成根拠で強化する

- Choice: 参加者の情報不足は新テーブルを作らず、ServiceOnboardingResponseの回答を1問ずつ補完し、既存の生成コンテキストへ翌日以降反映する。
- Learning: 単発の評価や不採用理由は参考情報に留め、同じ傾向が直近履歴で2回以上確認された場合だけfallback方針を変更する。良かった投稿も原稿を再利用せず、読者価値を別の疑問・場面へ展開する。
- Audit: 運営者にはGenerationContextSnapshotの情報種別・参照件数・生成経路・品質結果だけを表示し、本人の回答本文やMemory本文は表示しない。
- Boundary: 集計と表示はWorkspace・Service配下のBunshinに限定し、User/Bunshin間の履歴を混在させない。

# 2026-09-26: 現行の依存境界をAST検査で固定する

- Authorization: 2026-09-26のユーザー指示により、旧Phase指示の整理と設計境界の自動検査追加を許可された。不変の安全原則は弱めない。
- Scope: `platform-domain`、`shared`、`capability-contract`から実装層への逆流、`application`からDB/UI/個別Providerへの直接依存、未公開package subpathと相対パスによるpackage越境を検査する。
- Allowed direction: `database`がapplication/capabilityのPortを実装する依存と、`apps/web` composition rootでの公開packageの組み立ては許可する。
- Enforcement: TypeScript ASTによる実source検査を`pnpm lint`へ、禁止・許可fixtureによる検査自体のテストを`pnpm test`へ接続する。
- Limits: 非Literalの動的import、runtimeのtenant条件、未確定のCapability間依存はこの検査だけで保証しない。個別例外や自動更新allowlistは追加しない。

# 2026-09-26: OEM向けLINE一斉配信を既存の運用監視へ統合する

- Detection: 予定時刻から15分以上経過した未完了配信、失敗5件以上または失敗率50%以上の完了配信、停止したRecovery Jobを通知対象とする。
- Recovery: Recovery Jobが成功し、対象配信の失敗受信者が0件になった場合は復旧通知を送る。
- Isolation: 監視対象は指定環境の`SERVICE_LINE_BROADCAST_DELIVER` Jobから逆引きし、別環境の配信を混在させない。通知本文は集計件数だけを含める。
- Idempotency: 通知成功後に対象配信の既存監査ログへイベントキーを保存し、同じ障害・復旧を再通知しない。通知失敗時は記録せず、次回監視で再試行する。
- Failure boundary: 通知は既存の時間監視で実行し、一斉配信ワーカーから分離する。管理者メールやWebhookの障害で配信処理を停止しない。

# 2026-09-26: LINE一斉配信の障害を全体運用アラートへ表示する

- Source of truth: メール通知と管理画面で別々の障害判定を持たず、既存の一斉配信運用イベント検出を共用する。
- Visibility: 通知済みの監査記録はメールの重複送信だけを抑止し、未解消の障害を管理画面から消さない。
- Navigation: サービス設定が特定できる場合は対象サービスのLINE配信管理へ直接案内し、不明な場合はサービス一覧へ案内する。
- Isolation: 指定環境のJobから対象配信を逆引きする境界を維持し、表示内容はサービス名、障害種別、件数に限定する。
- Duplication: 一斉配信Jobは汎用停止Job件数から除外し、同じ障害を専用アラートと汎用アラートへ二重表示しない。

# 2026-09-26: 事業者向け初期設定の簡略化はService設定で明示的に有効化する

- Boundary: サービス名やslugをコードへ固定せず、`businessProfileInputMode`をServiceのVersioned onboarding設定として保持する。
- Compatibility: 既存Serviceと保存値がないServiceは`FULL`を維持し、運営者が`MINIMAL`を選択したServiceだけ5項目入力へ切り替える。
- Minimum input: 初回は業種、店舗・会社名、商品・サービス、届けたい顧客、SNS目的を取得する。
- Deferred profile: 事業の特徴、Tone、地域、Webサイト、価格、必須・禁止事項は利用開始後の既存1問補完へ回す。設定済みの値は変更しない。
- Generation safety: Bunshin生成に必要な特徴とToneには明示した安全な初期値を保存し、空値のまま生成経路へ渡さない。

# 2026-09-26: SNS行動停止要因は行動証拠から推定し、本人回答でのみ確定する

- Status: 配信、閲覧、採用、コピー、投稿、反応の集計だけで分かるのは候補までとし、推定結果は必ず`SUSPECTED`で返す。`CONFIRMED`への変更は後続の本人回答フローに限定する。
- Evidence: Workspace、Service、User、Bunshin、観測期間、集計値、閾値、Rule Versionを追跡し、回答本文や投稿本文などの個人情報は証跡へ複製しない。
- Availability: システム障害期間を除外した集計だけを入力し、有効観測日が0日の場合は推定しない。除外日数は監査用に保持する。
- Measurement gap: 投稿実績があってもInsightが未記録なら効果不足と断定せず`UNKNOWN`とし、測定できる状態かを先に確認する。
- Boundary: 推定関数は`capability-social`内の決定的なDomain Ruleとし、DB保存、本人への質問、支援内容の決定は後続PRへ分離する。

# 2026-09-26: SNS行動停止要因はService MembershipとBunshinの複合境界で保存する

- Scope: Barrier CaseはWorkspace、Service Group、Group Membership、User、Bunshin、Categoryの組で一意にし、RepositoryでActive MembershipとBunshin所有者を再検証する。
- Projection: 既存`DailyMission`、`MissionActivity`、`MissionDecision`、`PostRecord`、`SocialInsightSnapshot`、`LineMessageDelivery`を読み、同じ役割のActivityテーブルは追加しない。
- Availability: 生成失敗日とLINE配信失敗日は既存ログから除外する。統一Incident台帳は現段階で新設しない。
- Idempotency: Caseは現在状態を保持し、EvidenceはRule、Code、Category、観測期間から作るKeyで追記を冪等化する。同一観測の再実行で再発回数を増やさない。
- Recurrence: RESOLVEDまたはDISMISSEDは`nextEligibleAt`まで再推定を抑止し、期間後の新EvidenceだけでSUSPECTEDへ戻す。
- Privacy: Evidenceには集計値と閾値だけを保存し、投稿、回答、Prompt、Memoryの本文を保存しない。

# 2026-09-26: SNS行動停止要因は本人への1問確認でのみ確定する

- Question: 同じEvidenceから推定した複数候補は一つの質問へまとめ、内部のCategory名や推定値を本人へ表示しない。
- Confirmation: 本人が選んだ候補だけを`CONFIRMED`へ変更し、同時に提示した他候補は`DISMISSED`として30日間再質問を抑止する。「どれにも当てはまらない」では全候補を抑止する。
- Support: 確定したCategoryにはAI生成や有料提案を使わず、Version管理した無償の小さな支援を一件だけ提示する。
- Audit: 回答と支援内容はSnapshotおよびRule Versionとともに保存する。回答本文や投稿本文は複製しない。
- Isolation: 冪等な再送でもWorkspace、Service、Membership、User、Bunshinがすべて一致する場合だけ既存結果を返す。

# 2026-09-27: SNS継続支援は本人の開始・完了・見送りを状態として保持する

- Lifecycle: 支援は`OFFERED`から本人の操作で`ACCEPTED`、`COMPLETED`、`SKIPPED`へ遷移する。完了・見送り後の別状態への変更は許可しない。
- Resume: `OFFERED`と`ACCEPTED`は再訪時にも表示し、回答直後だけの一時表示にしない。
- Idempotency: 同じ遷移の再送は現在状態を返し、競合する終端遷移は`CONFLICT`として扱う。新しいEventテーブルは追加しない。
- Isolation: 支援IDだけでは更新せず、Workspace、Service、Membership、User、Bunshinが一致するCase Relationを必須条件にする。

# 2026-09-27: SNS継続支援の事業者表示はService集計に限定する

- Visibility: 事業者には本人が確定したCategory件数、本人確認待ち件数、支援状態件数だけを表示する。
- Privacy: User ID、氏名、回答内容、投稿本文、支援Snapshotは集計結果へ含めない。
- Scope: Managed Service Contextで認可し、WorkspaceとService Groupに属するActive Membershipだけを集計する。
- Reuse: 既存の個別化確認画面へ追加し、同じ目的の管理画面や集計テーブルは新設しない。

## D-109: SNS継続支援の定期判定は明示的なService Featureで限定する

- 日付: 2026-09-27
- 状態: Accepted

- `SOCIAL.ACTIVITY_SUPPORT`が有効なServiceのACTIVE参加者だけを対象とする。サービス名やslugはハードコードしない。
- 既存Mission・投稿完了・結果・LINE配信を28日単位で集計し、システム障害日は除外する。
- 毎日03:10 JSTに確定済み日付までを評価し、行動だけでは`SUSPECTED`までとする。本人回答なしに障壁を確定しない。
- Userごとの先頭Bunshinへ暗黙集約せず、対象Service内のACTIVEなSocial Bunshinを個別に評価する。
- Scheduler再実行時は既存Evidence KeyとCase一意制約で二重保存を防ぎ、参加者ごとの失敗は他参加者の判定を止めない。

## D-110: SNS継続支援の本人確認はLINEからWebへ導く

- 日付: 2026-09-27
- 状態: Accepted

- LINEは本人確認があることだけを知らせ、回答は既存Web画面で行う。本人が回答する前の推定Categoryは通知文に出さない。
- 通知予約前と実配信時に、Workspace、Service、Membership、User、Bunshin、LINE連携、通知同意、Case状態を再検証する。
- Case IDと再発回数から決定的な通知キーを作り、同じ確認回の二重配信を防ぐ。
- 配信時に本人回答済みであれば送信しない。

## D-111: OEM支援候補は無償支援後の再観測でのみ作る

- 日付: 2026-09-27
- 状態: Accepted

- 本人確認済み障壁への無償支援が完了し、その後の14有効日以上のEvidenceで未改善が確認できた場合だけ候補化する。
- システム障害日を含むEvidenceは候補化しない。
- `CONTENT` はワタシワークス側の個別化品質問題を先に調べるため、自動のOEM支援候補から除外する。
- 商品・価格はCoreへ固定せず、支援種別のSnapshotまでを保存する。

## D-112: OEM支援候補の対応はService管理者が明示的に決める

- 日付: 2026-09-27
- 状態: Accepted

- 候補生成から自動営業・契約・課金へ進まず、Service Owner / Adminが「対応する」「今回は対応しない」を選ぶ。
- 状態遷移は `OPEN -> ACCEPTED / DISMISSED`、`ACCEPTED -> COMPLETED` に限定する。
- 操作ごとに実行者、前後状態、理由、日時を監査履歴として保存する。

## D-113: OEM支援アラートの扱いはServiceごとに決める

- 日付: 2026-09-27
- 状態: Accepted

- 月額課金と支援アラートの扱いを分離し、追加提案、契約内支援、内部対応、無効をService単位で選択する。
- 既存Serviceの既定値は自動営業を起こさない `INTERNAL_ESCALATION` とする。
- 候補生成時の方針をSnapshotに残し、後の設定変更から監査可能性を守る。

## D-114: OEM支援候補通知は運営管理者限定の専用配送履歴で管理する

- 日付: 2026-09-27
- 状態: Accepted

- 有効な`SERVICE_OWNER / SERVICE_ADMIN`だけへ送信し、支援対象の利用者本人には送信しない。
- Service別のメールProvider、暗号化された資格情報、共通Resend Adapterを再利用する。
- 候補と受信管理者の組を一意にし、Providerへは配送ID由来の冪等キーを渡す。
- `DISABLED`、未検証Provider、停止中メールは配送しない。通知から自動営業、契約変更、課金は実行しない。

## D-115: OEM支援候補のLINE通知は既存Service Broadcastを再利用する

- 日付: 2026-09-27
- 状態: Accepted

- LINE通知を有効にしたServiceだけを対象にし、有効な`SERVICE_OWNER / SERVICE_ADMIN`へ送る。支援対象の利用者本人には送らない。
- 候補ID由来の`automationKey`でBroadcastを一意にし、既存の配送Job、同意・友だち状態検証、再試行、監査、未投入Job回復を再利用する。
- 個別のLINE受信設定が存在するServiceでは、有効かつ同意済みの管理者だけを受信者にする。
- 通知は管理画面への入口に限定し、自動営業、契約変更、課金を実行しない。

## D-116: OEM支援候補のLINE本文は用途別Service Templateから取得する

- 日付: 2026-09-27
- 状態: Accepted

- `LINE / OEM_SUPPORT_CANDIDATE`の最新有効テンプレートをService単位で取得し、固定文を各所へ増やさない。
- `name`、`serviceName`、`supportType`、`manageUrl`だけを置換対象とし、受信者別本文はBroadcast Recipientへ保存する。
- テンプレートがないServiceには安全な既定文を使い、既存Serviceの通知を停止させない。

## D-117: OEM支援候補の通知担当者はチャネルごとに選択する

- 日付: 2026-09-27
- 状態: Accepted

- `OEM_SUPPORT_CANDIDATE`の受信設定は、Service Owner / Adminを対象にEMAILとLINEを別々に保存する。
- EMAILはメールアドレス登録済み管理者だけを選択可能にし、LINEは実配信時にもLINE連携、通知同意、友だち状態を再検証する。
- Service管理権限とWorkspace / Service境界を既存の管理Contextで検証し、設定変更をService監査へ記録する。

## D-118: OEM支援LINEの失敗は個別化画面から既存LINE運用画面へ導く

- 日付: 2026-09-28
- 状態: Accepted

- 候補ID由来の`automationKey`を持つBroadcastだけをWorkspace / Service内で抽出し、失敗件数と分類を個別化管理画面に表示する。
- 再送処理を複製せず、既存の公式LINE管理画面にある失敗宛先だけの再送、監査、冪等Jobを再利用する。
- 受信者の個人情報や通知本文は失敗一覧に表示しない。

## D-119: OEM支援LINE Schedulerは未通知候補だけを先に選ぶ

- 日付: 2026-09-28
- 状態: Accepted

- `automationKey`が存在しないOPEN候補をDBで抽出してから処理上限を適用し、古い通知済み候補による新規候補の枯渇を防ぐ。
- Candidate IDとBroadcast `automationKey`の対応を決定的に保ち、同時実行時の一意制約とJob冪等性を維持する。
- Broadcast作成後にJob投入が中断した場合は、既存のService Line Broadcast Recoveryを正本として回復する。

## D-120: OEM支援通知Schedulerは配信可能な候補へ上限を適用する

- 日付: 2026-09-28
- 状態: Accepted

- EMAIL / LINEとも、チャネル有効、アラート有効、ACTIVEな管理者、受信設定を満たす未通知候補をDBで抽出してから処理上限を適用する。
- 無効設定や受信者不在の古い候補が新しい配信可能候補を永続的に遮らないようにする。
- 候補状態や設定は詳細取得後にも再検証し、抽出から作成までの設定変更に対して安全側で停止する。

## D-121: OEM支援メールはProvider送信直前に受信資格を再検証する

- 日付: 2026-09-28
- 状態: Accepted

- 予約後に候補対応済み、チャネル停止、担当解除、権限失効、アドレス変更が起きた場合はProviderへ送らず`SKIPPED`として記録する。
- Workspace、Service、Configuration、Candidate、Recipientを同時に照合し、別Scopeへの送信を許可しない。
- 配送予約時の検証だけに依存せず、外部副作用の直前に最新状態を確認する。

## D-122: OEM支援LINEはProvider送信直前に候補と受信資格を再検証する

- 日付: 2026-09-28
- 状態: Accepted

- OEM支援候補由来のBroadcastだけを識別し、CandidateがOPEN、LINE通知が有効、受信者がACTIVEなService Owner / Admin、個別同意が有効であることを再確認する。
- 資格を失った宛先はProviderへ渡さず`SKIPPED / NOTIFICATION_NO_LONGER_ELIGIBLE`とし、対象がゼロならBroadcastを正常終了させる。
- 一般のService Broadcastにはこの追加判定を適用せず、既存配信仕様を維持する。

## D-123: Production Gateは自社限定の条件付き運用で検証する

- 日付: 2026-09-28
- 状態: Accepted

- 最新mainの自動Gate、Production Deployment、health / readiness、branch protectionが成功していることを前提に、自社管理アカウントだけでProduction運用を開始できる。
- backup / restore、実端末、外部Provider、法務・運用の未完了項目は免除せず、運用中に対象commit、日時、担当者、結果を証跡として収集する。
- 未検証Providerは必要になるまで無効とし、有効化時に疎通、失敗記録、費用上限を確認する。
- データ境界違反、復旧不能、重大な認証障害が発生した場合は対象機能または運用を停止する。
- この判断は一般公開、外部顧客向け販売、無人運用のGOを意味しない。それらは未完了Gateの完了後に再判定する。

## D-124: AI研修のBarrierは構造化EventとAssignment Variantで扱う

- 日付: 2026-09-28
- 状態: Accepted

- 進めにくい理由は `BUSY / TOO_DIFFICULT / NOT_RELEVANT / DONT_KNOW_HOW / LOW_VALUE / OTHER` の選択式とし、自由記述や回答本文をBarrier Eventへ保存しない。
- `BUSY` は1分版、`TOO_DIFFICULT / DONT_KNOW_HOW` はやさしい1分版、`NOT_RELEVANT / LOW_VALUE` は学習目標の見直しへ決定的に分岐する。
- 1分版は新しいMissionを生成せず、現在のAssignmentのVariantとして保存する。学習目的を維持し、成功条件と評価条件を1項目へ縮小する。
- 通常版の内容をAssignment Snapshot内に保持し、本人が回答前に通常版へ戻せるようにする。回答提出後のVariant変更は許可しない。
- Practice / Workは表示上明示し、FOUNDATION完了後かつ実務利用実績がある場合だけWorkとする。
- AI ProviderへMission選定、Barrier分岐、学習目的、評価条件の決定を委ねない。

## D-125: AI研修の回答評価は共通Job基盤で非同期実行する

- 日付: 2026-09-28
- 状態: Accepted

- 回答保存APIは回答を保存した後、回答IDだけを参照する `TRAINING_ANSWER_EVALUATE` Jobを冪等投入する。回答本文をJob payloadへ複製しない。
- Workerは実行直前にWorkspace、Service、Participant、Enrollment、AI研修Program、Answerの境界と有効状態を再検証する。
- Provider障害は共通Job基盤の指数バックオフで最大3回まで再試行し、全試行失敗時だけAnswerを `FAILED` にする。
- Provider試行ごとにmodel、Prompt Version、usage、原価、処理時間、成否を別のAI Usage Eventとして記録する。
- 評価とMission、Profile、Progress、監査Eventの更新は同じDB transactionで確定し、部分的な進捗更新を残さない。
- 受講画面は30秒まで状態を確認するが、画面を閉じてもJobは継続する。`FAILED` は保存済み回答から本人が明示的に再投入できる。

## D-126: AI研修の評価運用はService単位の集計指標で観測する

- 日付: 2026-09-28
- 状態: Accepted

- 自社Pilotで非同期評価を運用検証できるよう、直近7日間の評価Job成功率、再試行、最終失敗、本人再投入、平均完了時間をService管理画面へ表示する。
- 現在の処理中Job、最古の待機時間、`PENDING` / `FAILED` 回答数も表示し、回復が必要な滞留を確認可能にする。
- 集計はWorkspace、Service、AI研修Enrollmentの境界内に限定し、回答本文、評価本文、参加者別の失敗情報、Provider responseは取得・表示しない。
- 固定の自動警報閾値はPilot観測前に決めず、まず実測値を収集する。閾値と通知経路は運用データに基づく後続判断とする。

## D-127: 参加者別LINE診断は配信資格の分類だけを表示する

- 日付: 2026-09-28
- 状態: Accepted

- サービス管理者の参加者画面では、現在環境の配信設定と既存配信処理が使う参加状態、サービス同意、アカウント状態、接続状態、通知同意、友だち状態を基に配信可否を判定する。
- Provider User ID、Channel Secret、Access Tokenなどの外部識別子・秘密値は取得・表示しない。管理者には復旧に必要な分類と案内だけを示す。
- 診断画面から同意、友だち状態、接続状態を自動変更しない。サービス設定の問題は既存LINE設定画面、参加者固有の問題は本人への接続案内で解消する。
- 診断は読み取り専用とし、画面表示時に外部Providerへの追加問い合わせを行わない。

## D-128: AI障害は応答契約と有限の処理時間を保ち、恒久的失敗を再試行しない

- 日付: 2026-09-28
- 状態: Accepted

- Grok X Searchは短い調査として最大2turn、60秒で打ち切る。Responses APIの引用annotationと既存citationsを安全なURLへ変換し、根拠なし・不完全な応答を公開しない。
- 投稿本文・品質審査のgpt-5-miniだけにlow reasoningを指定する。他モデル・管理者のモデル設定は変更しない。45秒の上限、品質・重複Gate、既存Quotaを維持する。
- 品質審査の文字数と非空制約をProvider SchemaとPromptへ明示し、Domain側の厳格な検証は維持する。
- 本文・品質Providerの障害には安全なHTTP status/code、timeout/network分類だけを保持し、本文・キー・例外内容を保存しない。
- Mission Jobは参照切れ・入力不正・品質拒否・恒久的HTTPエラーを最終失敗として記録し、同じ処理の最大5回再試行を防ぐ。一時的通信障害・429・5xxは既存Backoffで再試行する。
- 本番の参照切れPillar、DEAD Job、過去失敗件数は自動修復・再送・消去しない。再発防止は既存の確定計画参照保護を維持し、対象データの復旧は別途確認する。

## D-129: 占いの中断生成は保存済み標準結果へ冪等に復旧する

- 日付: 2026-09-28
- 状態: Accepted

- 45秒のProvider期限に対し、最終更新から10分以上経過した未削除の`GENERATING`だけを復旧対象にする。認証済みProduction Cronで5分ごと、最大100件を処理する。
- 保存済みの承認された標準本文・行動が両方ある場合は`READY_BASIC`へ戻す。本文が欠ける場合は`FAILED`とし、空の結果を成功扱いしない。
- カード、日付、本人、本文、Knowledge版は変更しない。AI再呼び出し、課金、LINE送信は行わない。
- 全所有境界、状態、未削除、最終更新日時、本文をcompare-and-set条件とし、並行完了・削除・更新を上書きしない。遅延AI完了も既存の`GENERATING`条件で拒否する。
- 本文・個人識別子をログへ出さず、対象数・復旧数・失敗数だけを記録する。DB障害を握りつぶさず次回Cronで再実行する。

## D-130: 追加質問は本人の見送りと回答後の休止を尊重する

- 日付: 2026-09-28
- 状態: Accepted

- 追加質問は1問ずつ提示し、初回登録・回答保存・見送り後は24時間提示を休止する。見送った質問は7日間候補から外す。手動の全回答編集は休止中も許可する。
- 見送りは回答を書き換えず、Service Membership固有の回答行に質問文と期限を保存する。質問の並び順ではなく文面で照合し、設定から削除された質問を次回見送り時に除く。
- 履歴は直近20件に制限し、回答本文を複製しない。期限内の同じ見送りの再送は成功扱いで期限・履歴を増やさない。
- 認証、同一Origin、活動中の所有境界、現在の質問候補をサーバーで検証する。更新日時をcompare-and-set条件にして並行回答を上書きしない。閲覧だけで状態を変更しない。
- 本作業は追加質問UXに限定する。AI再生成、通知・配信設定、Provider、既存の回答内容は変更しない。

## D-131: AI研修の個人データは本人Exportを先に接続し、削除を段階実装する

- 日付: 2026-09-28
- 状態: Accepted（ユーザー承認済み）

- 回答本文・AI評価は回答から90日、仕事情報は研修終了から90日、学習進捗・点数は終了から1年を保持期間とする。本人が明示保存したToolkitは回答の自動期限削除とは分離し、利用中は保持する。
- 本人による回答削除は対応する評価・関連Toolkitを含む。全研修データ削除は仕事情報・進捗・点数も対象にする。削除前に対象を表示し、Exportの導線を提供する。
- 実装は本人Export、本人削除、自動期限削除の独立したPRに分ける。本段階はExportだけであり、削除・保持期限の稼働済み表示や既存データ消去は行わない。
- ExportはJSON形式、Serviceと本人のEnrollmentを単位とし、明示操作のsame-origin POSTからダウンロードする。実行中・完了・期限終了の受講を対象にする。
- DBの一貫した読み取りsnapshotで所有境界を検証し、本人プロフィール・回答評価・Toolkit・課題と進捗・本人操作の種類と日時だけを選択する。Job、Provider診断、管理者操作、秘密値、他参加者の情報、監査metadataは含めない。
- 各一覧は最大2000件、ファイルは10MiBを上限とし、超過時に不完全なファイルを成功扱いしない。本文やファイルをサーバーのログ・外部Storageへ複製しない。
- 自動削除時の既存行への期限設定、評価Jobとの競合、バックアップや外部Providerに残る情報の扱いは削除段階で明示する。アプリの削除を即時の全経路完全消去とは表示しない。

## D-132: AI研修の本人削除は確認済みSnapshotとEnrollment単位の排他で確定する

- 日付: 2026-09-28
- 状態: Accepted（D-131の本人削除の実装判断）

- 回答1件の削除は本文・評価・関連Toolkit・回答由来Eventを消去する。集計済み学習進捗・点数は維持することを確認画面で明示する。未完了の課題はスキップし、古い回答を再投入しない。
- 全学習データ削除は回答・評価・Toolkit・Profile（仕事情報・点数）・Progress・課題・活動Event・目標・研修Preference・Enrollmentの目標Snapshotを消去する。アカウント、サービス参加同意、Enrollmentの参加/契約情報、決済・原価・最小監査記録は残す。活動中の研修を継続する場合は本人が初期設定を入力し直す。
- 削除前に対象件数と内容を含まない回答一覧を読み取り専用で提示する。対象IDと更新日時のSHA-256を確認Revisionとし、変更済みSnapshotの削除は409で拒否する。各一覧2000件を超えた場合は一括削除を拒否し、不完全な成功を返さない。
- 削除と全Training書込は、同一Transaction内でWorkspace/Group/Enrollment固有の行ロックを最初に取得する。古いRuntime CandidateはProfileの更新日時を再検証する。評価Workerは削除後に回答が存在しなければ評価・進捗を保存しない。
- 評価Jobは本人・Service・Enrollment・回答参照を限定してキャンセルし、本文を含まない削除Revision・件数だけを監査へ記録する。再送は同じRevisionなら冪等に成功する。Providerへ送信済みの処理を撤回する保証はしない。
- Backup、既に端末へ保存したExport、外部Provider、契約・費用記録の消去は本操作の対象外と画面に明示する。自動保持期限は後続PRであり、本PRは本番の一括消去を行わない。

## D-133: AI研修の保持期限は非破壊Preflightで対象と起算日の不足を確認する

- 日付: 2026-09-28
- 状態: Accepted（D-131の保持期限実装の事前検証）

- 最初のPRは期限判定と読み取り専用の対象集計に限定する。削除API、定期実行登録、既存データへの期限設定は行わない。
- 回答・評価は回答作成日時から90日。仕事情報は確定した終了日から90日、進捗・点数は暦年の1年後（2月29日は翌年2月末）を期限とする。期限時刻ちょうどから対象とする。
- `EXPIRED`で過去の`endsAt`がある場合のみ期限終了日として採用する。`COMPLETED`/`CANCELLED`の`endsAt`や`updatedAt`を実際の終了日時と推定しない。起算日未確定は判定保留として集計する。
- Cron Secretによる認証を必須とし、Workspace/Groupを明示したPOSTだけで集計する。AI研修Programと同一Scopeの参加者所有境界を再検証する。最大100 Enrollment、1000 Programを超えた場合は部分成功を返さない。
- 本文、評価、仕事情報、点数、Toolkit本文は取得せず、件数だけを返す。明示保存Toolkitは対象から除外する。Backup/Provider/端末Export、契約・費用・監査の消去を保証しない。
- 実削除は別PRで、終了日時の確定方法、評価Jobとの競合防止、保存Toolkit維持、監査、停止条件を実装・確認してから接続する。本Preflightを自動削除の稼働済み証拠にしない。

## D-134: AI研修の期限処理は終了記録・確認Revision・受講排他を用い、本番では停止する

- 日付: 2026-09-28
- 状態: Accepted（D-131、D-133の後続実装）

- AI研修専用のRetention Stateを追加する。今後の受講状態の終了への変更時にDBで終了日を記録し、再開時は終了日と期限処理済み印をリセットする。過去の完了/取消日時はMigrationで推測・補完しない。EXPIREDの確定した過去endsAtは既存方針通り利用できる。
- 回答90日で本文・評価・回答由来Eventを削除し、未完了課題と評価Jobを停止する。本人が明示保存したToolkitとその保存Eventは保持する。元の回答がなくてもToolkitは読める。
- 終了90日で仕事Profileの職種・仕事Context・用途・課題・希望Topic、目標Snapshot・自由文・課題表示Snapshot・活動metadataを消去する。集計点数・進捗は1年まで保持する。契約Snapshotと監査の存在は保持し、参加監査のgoalSnapshotだけを除去する。
- 終了1年でProfile・進捗・課題・目標・Preference・活動履歴を削除する。Toolkit本体は削除しない。新しい回答は自分の90日期限まで保持し、遅延評価は終了状態を再確認して確定しない。
- SUPER_ADMIN本人・same-origin POST・明示Scope・確認文字列・対象Revisionを必須とする。DBでも管理者と所有境界を検証する。対象一覧は2000件を上限にし、確認後の変更は409、超過は413で拒否する。実行と既存Training書込は同じEnrollmentロックを取る。再送は確認Revision監査により冪等にする。
- HTTP実行はdevelopment/stagingだけ許可し、production/その他は停止する。Cron登録、Provider呼出、LINE送信、本番有効化、過去行の一括消去は含めない。本番有効化には別途対象確認・停止/復旧手順・運営承認が必要。

## D-135: AI研修の終了・取消・再開はサービス管理者の確認操作で確定する

- 日付: 2026-09-29
- 状態: Accepted（ユーザー依頼によるD-134の運用導線）
- SERVICE_OWNER/ADMIN本人をDBでも再検証し、同一Workspace/ServiceのAI研修・参加者だけを対象とする。CONTENT_EDITOR、他サービス管理者、参加者は変更できない。
- ACTIVEからCOMPLETED/CANCELLED、終了状態からACTIVEだけを許可する。現在状態・更新日時による確認Revision、理由、確認文字列、操作UUIDを必須とする。受講ロックと監査を同一Transactionで確定し、同じ操作の再送は冪等とする。
- 再開はACTIVEなProgramとParticipant、現在の契約期間内に限定する。期限延長、課金・返金、契約Snapshot変更、終了日補完、消去データ復元は行わない。
- 終了/取消時には受講固有の評価待ちJobをキャンセルし、PENDING回答はFAILEDへ移す。再開でも自動再評価・外部送信は行わない。遅延評価は既存ロック・PENDING条件で保存しない。
- 終了日時・再開リセットはD-134のTriggerを使用する。本番保持期限処理の停止解除やCron変更は含めない。

## D-136: 終了したAI研修は本人限定の読み取り専用案内へ分岐する

- 日付: 2026-09-29
- 状態: Accepted（受講者側の終了・取消表示のユーザー依頼）
- ACTIVEな本人Service ParticipantのEnrollmentをWorkspace/Service/会員IDで検証してから、AI研修のCOMPLETED/CANCELLED/EXPIREDを読み取り専用の状態案内へ分岐する。非AI研修の取消、招待中、他参加者、所属失効は引き続き404とする。
- 終了表示ではRuntime.current、課題生成、回答提出、評価・再試行、Job投入を呼ばない。管理者の操作理由・監査・回答本文を取得表示しない。確定終了記録だけを表示し、EXPIREDの過去endsAt以外は推定しない。
- 終了研修を本人プログラム一覧から確認できる。COMPLETED/EXPIREDの既存Toolkit/Export権限は維持し、CANCELLEDへ閲覧権限を拡大しない。再開は既存管理者操作と現在の参加/契約期間条件を必要とし、本人の案内閲覧で受講状態を変更しない。
- 本番削除有効化、通知送信、返金、契約変更、削除データ復元は含めない。

## D-137: falのrequest IDを失った発注は自動再送せず照合待ちにする

- 日付: 2026-09-30
- 状態: 実装PRで検証中。本番有効化はmigration前件数と運営照合手順の確認後。
- 理由: fal/KlingのF2/F3再現では応答喪失・ID保存失敗後に次回POSTが出た。確認済みfal資料からはID喪失時の照合またはクライアント重複抑止の保証を確定できない。実二重請求の発生は未確認。
- falのみ、`QUEUED`から`SUBMISSION_UNKNOWN`へWorkspace・generation・Providerを条件としたCASを永続化してからPOSTする。Job delivery番号とこの論理的な発注状態を混同しない。IDを受け取れたときだけ同状態から`SUBMITTED`へ進める。`SUBMISSION_UNKNOWN`でIDがなければ再POST・原価0確定・動画枠解放を行わず、Jobを再試行不可の`DEAD`、generationを要照合として残す。Runwayの経路は維持する。
- 旧fal `QUEUED`行のうちID保存済みは`SUBMITTED`へ移して既存照会を使う。IDなしは既に受付された発注と真の未発注を区別する証拠がないため、migrationで保守的に要照合へ移す。運営者の通常再試行はfalに限り止める。保留行の原価・実Provider注文の有無・取消可否は自動推定せず、別途運営確認する。
- これだけでProvider側の重複抑止、ID喪失時の自動照合、外部原価履歴、手動の安全な再開は完成しない。原価は未確定でありゼロと表示しない。既存の文章・画像配信へ影響させず、実API・本番データでの検証は別承認とする。

## D-138: AI研修の自動期限終了は本番の読み取り専用Preflightを先行する

- 日付: 2026-10-01
- 状態: Accepted（本番有効化前の安全確認）
- 無料・手動登録受講の期限終了をproductionで有効化する前に、Cron Secret認証と明示Workspace/Service Scopeを必須とする読み取り専用Preflightを用意する。
- Preflightは実行処理と同じAI_TRAINING_V1、Participant、ACTIVE、開始/終了日時、期限到達、有料購入除外条件を共通化し、対象件数・100件上限・必要バッチ数・判定時刻だけを返す。受講ID、User、回答、評価、仕事情報は取得・応答・ログへ含めない。
- PreflightではTransaction、状態更新、評価停止、監査Event、Provider、LINEを実行しない。productionで利用可能でも、期限終了のproduction停止とCron未登録は維持する。
- 本番有効化はPreflight結果、Migration適用、停止/復旧手順、運営承認を別作業で確認する。Preflight成功を自動期限終了の稼働済み証拠として扱わない。

## D-139: SNSの事業目的を導線・中間指標から分離する

- 日付: 2026-10-01
- 状態: Accepted（Goal伝播監査の最小Foundation）
- SOCIAL capabilityの正規Goalは、認知、来店・予約、問い合わせ、リピート、採用、販売、信頼・専門性、その他の8種類とする。フォロワー、LINE登録、ブログ流入は事業目的そのものではなく、中間指標または導線として分離する。
- 既存の`ServiceMemberBusinessProfile.primaryPurpose`と`SocialAccountStrategy.goal`は直ちに削除・書換えず、純粋な変換境界を追加する。一意に変換できる値だけを`RESOLVED`とし、広い「集客」やフォロワー、LINE登録、ブログ流入は候補と理由を持つ`REVIEW_REQUIRED`にする。
- 曖昧値へ既定Goalを暗黙適用しない。次のUI・初回設定接続では、Service設定または利用者確認により解決し、異なるService、User、Bunshin、SocialProfileの目的を共有しない。
- 本判断は契約と既存語彙の変換までとする。DB、onboarding、Strategy、Weekly、Daily、Prompt、CTA、KPI、本番設定は別の小さな変更で接続し、ハッシー名やOEM名を共通基盤へハードコードしない。

## D-140: 初回SNS Strategyは事業目的から決定し、広い「集客」は利用者が成果を選ぶ

- 日付: 2026-10-01
- 状態: Accepted（D-139の初回Strategy接続）
- Service会員の初回SNS Strategyは`ServiceMemberBusinessProfile.primaryPurpose`から決定し、固定の`BRAND_AWARENESS`を使わない。認知、来店・予約、販売、採用、リピートは対応するGoalを保存し、明示されていない遷移先URLは推測しない。
- 広い`ATTRACT`は来店・予約、問い合わせ、販売のどれかへ暗黙変換せず、初回設定で利用者に最優先成果を確認する。事業目的を使用するServiceで目的が欠損・未知の場合は、認知へフォールバックせず初回Strategy作成を停止する。
- 既存Strategyとの互換性を保つため既存Goalは削除せず、`VISIT_RESERVATION`、`REPEAT`、`TRUST_EXPERTISE`を追加する。正規Goalと中間指標・導線の区別はD-139を維持する。
- この変更は初回Strategyまでとし、Weekly Plan、Daily、投稿本文、CTA、結果評価、次回提案への目的差は後続PRで段階的に接続する。ハッシー名や特定OEM名を共通SOCIAL capabilityへハードコードしない。

## D-141: Weekly Planは承認済みSNS Goalと目的別の企画方針を型付きで受け取る

- 日付: 2026-10-01
- 状態: Accepted（D-140のWeekly Plan接続）
- Weekly Plannerへ承認済みStrategyのGoalを明示的に渡し、SOCIAL capability内の純粋な変換で、週全体の重点、題材候補、CTA候補を導出する。認知、来店・予約、問い合わせ、リピート、採用、販売、信頼・専門性は互いに異なる企画方針を持つ。
- Goal変更時はCTAの末尾だけでなく、週間要約、各日の目的、テーマ、切り口を変えるようProvider契約へ明記する。フォロワー、LINE登録、ブログ流入は事業成果へ昇格させず、中間指標または導線として扱う。
- 目的別定義は特定サービス名・OEM名を共通基盤へ直書きせず、SOCIAL capabilityに閉じる。所有権、承認済みStrategy、Bunshin、Serviceの既存境界は維持する。
- 自動テストはGoalと目的別方針がWeekly Planner入力へ届くこと、7つの主要目的で方針が異なることを保証する。実Providerによる生成品質、Daily、投稿本文、写真・動画案、結果評価、次回提案への差は本変更では確認済みとせず、後続の小さな変更と承認済み検証で確認する。

## D-142: Daily Missionと投稿生成は承認済みSNS Goalの企画方針を継承する

- 日付: 2026-10-01
- 状態: Accepted（D-141のDaily・Content接続）
- Daily Planner、投稿本文・写真/動画案Generator、品質Checkerへ、承認済みStrategyのGoalとD-141で定義した型付き企画方針を渡す。Goal差はCTA末尾だけでなく、当日のtopic、angle、reason、本文、視覚案、読者価値へ反映する。
- 投稿の作り直しでも新しいStrategyへ暗黙に差し替えず、元の生成Snapshotが指す承認済みStrategyを読み直し、そのGoalの企画方針を維持する。異なるWorkspace、User、Bunshin、SocialProfileのGoalは共有しない。
- 品質Checkerは、題材や読者価値が別GoalのままCTAだけを変えた候補、または承認済みの具体的なCTA方針と矛盾する候補を`GOAL_MISMATCH`として修正対象にする。
- 自動テストは型付きGoal方針がDaily・Content・Qualityへ届くことと、Goalだけを認知から採用へ変えたとき企画方針が変わることを保証する。実Provider出力の品質優位性、結果のGoal別評価、次回提案への学習は未確認であり、実績として扱わない。

## D-143: SNS成果は生成時Goalへ帰属し、取得できないGoal達成を推測しない

- 日付: 2026-10-01
- 状態: Accepted（Goal別結果評価と次週反映の最小実装）
- 新しく生成するDaily MissionのGeneration Context Snapshotへ、承認済みStrategyのGoalを保存する。通常AI生成と安全フォールバックの双方を対象とし、Goal変更後も過去投稿の成果を新しいGoalへ暗黙に付け替えない。既存Snapshotは書き換えず、Goalを持たない過去記録はGoal別集計から除外する。
- 次週計画へ渡す手入力成果は、同じGoalで生成された投稿だけに限定する。問い合わせは問い合わせ件数、来店・予約は予約・来店件数、販売は注文件数を主要成果として扱い、それ以外の成果項目を当該Goalの成功へ混ぜない。
- 認知、採用、リピート、信頼・専門性等は、現在取得している手入力成果だけでは達成判定できないため`UNAVAILABLE`とする。成果未入力は`NO_DATA`であり失敗と判定しない。投稿との因果関係も推定しない。
- `GOOD`、`NEUTRAL`、`BAD`は投稿内容に対する本人の好み・使いやすさのFeedbackであり、Goal達成の証拠ではない。Weekly Plannerへこの意味と測定制約を型付きで渡し、測定不能な成果を作らせない。
- 本変更はGoal帰属と次週入力の安全化までとする。認知・採用・リピート等のKPI入力UI、外部SNS分析連携、因果推定、本番データ補完は含めない。

## D-144: 目的別成果は生成時Goalに結び付けた自己申告として次週へ渡す

- 日付: 2026-10-01
- 状態: Accepted（D-143で未取得だった目的別成果のV1入力）
- 投稿済みのサービス会員は、今回の目的に対して「目的につながった」「手応えがあった」「変化はなかった」「まだ分からない」を回答できる。`GOOD`・`NEUTRAL`・`BAD`は投稿内容の本人らしさであり、本回答と分離する。
- クライアントからGoalを受け取らず、Daily Mission生成時SnapshotのGoalを正本としてPostRecordの既存`manualMetrics`へ結果と回答時刻を保存する。SnapshotにGoalがない過去Missionには暗黙のGoalを補完せず、入力を止める。DB schemaは追加しない。
- 次週計画は現在のGoalと、生成時Goal・保存時Goalが一致する自己申告だけを参照する。自己申告しかない場合は`SELF_REPORTED`とし、外部KPI達成、投稿との因果関係、採用・認知等の実績として断定しない。問い合わせ・来店予約・販売の既存件数がある場合は`MEASURED`を優先する。
- 本変更はV1の簡易入力と同一Goalへの次週反映までとする。外部SNS分析、予約・応募・売上システム連携、複数Goalの重み付け、因果推定、過去Snapshotの補完は含めない。

## D-146: Feedbackの人手確認UIは暗号化短期handleで既存CASへ接続する

- 日付: 2026-10-03
- 状態: Accepted（ユーザー承認の改善候補確認・却下ゴール）
- 画面GETでは候補を保存しない。明示的な準備POSTと確認/対象外確定POSTを分離し、既存Repositoryの管理者再認可・Evidence再検証・CAS・監査を再利用する。
- 個人由来の根拠hashや内部IDを平文でClientへ渡さない。用途分離鍵によるAES-GCMの10分handleにactor/Service/Workspace/environment/週/根拠/Revisionを固定し、APIは同Origin・strict入力・サイズ制限・no-storeを必須とする。
- 応答喪失後は同operation UUID・同判断で再送する。期限/根拠/権限変更は再読取を必要とし、再発注や判断の自動変更をしない。候補作成後の失敗は未判断OPENが残り得るが、確認成功とは扱わない。
- schema/依存/Provider/本番設定は変更しない。REVIEWEDは修正済みや開発承認を意味せず、STALE再開・自動実装へ接続しない。非互換migrationの本番公開gateは別途維持する。

## D-145: SNS Goal変更は次に作るWeekly Planから有効にする

- 日付: 2026-10-01
- 状態: Accepted（Goal変更時のWeekly・Daily混在防止）
- AI生成Weekly Planは、生成に使用したSocial Profile、Strategy ID、Strategy GoalをSnapshotとして保持する。新しいStrategyを承認して旧Strategyが`SUPERSEDED`になっても、確定済みWeekly Planとその残りのDaily Missionは生成時Strategyで完走する。
- 新しいGoalは、承認後に新しく生成するWeekly Planから有効にする。同じ週の確定済み計画を暗黙に書き換えたり、過去Mission・成果のGoalを付け替えたりしない。画面にも反映時期を明示する。
- Daily Mission生成はWeekly Planに保存されたStrategyを読み、現在の承認済みStrategyと混在させない。保存したStrategyが欠損、別Profile、Goal不一致の場合は生成を停止する。Goalを持たない既存Weekly Planだけは互換性のため現在の承認済みStrategyを使用し、過去データを推測更新しない。
- Workspace、Service、User、Bunshin、Social Profileの既存境界を維持し、Weekly Plan作成時にStrategyの所有範囲・Profile・Goal・承認状態をDBで再検証する。本変更は即時の週途中切替、複数Goal、期間指定、既存Planの一括補完を含めない。

## 2026-10-04: SOCIAL Decision metadataは既存生成Snapshotへ最小・任意・版付きで保存する

- 状態: Accepted（Brief直前接続後の監査可能性）
- 新しいDecision、Analytics、Historyテーブルは作らず、既存 `GenerationContextSnapshot.payload` の任意 `decision` blockを再利用する。旧payloadはblockなしで引き続き有効とし、backfillや現在値からの補完を行わない。
- 保存するのはDecision契約版、Context版、Planner Prompt版、DAILY stage、READY状態、材料充足度、利用可能signal種別、Goal不明・別Goal・観測なしで無視したsignalの種別別件数、missing inputs、既知の制約に限定する。
- Workspace、User、Bunshin、履歴行ID、投稿本文、URL、Memory全文、観測値、自由入力はdecision blockへ複製しない。Plannerが実際に使用したpersonalization source種別と500文字以内の理由は既存personalization blockに保存し、利用可能sourceの部分集合である既存検証を維持する。
- `decision` blockを保存するのは、既存認可・Capability・所有権・Service参加／法的同意precheckを通過し、Decision ContextがREADYとなった対象経路だけ。対象外Serviceとdeterministic fallbackのSnapshot契約は変更しない。
- Daily MissionとGeneration Context Snapshotの既存同一transaction保存を維持する。本文品質repair後のtopic／angle／action変更とreasonの再判断は別PRで扱い、本記録だけで最終本文との意味整合を保証しない。

## 2026-10-04: Decision Context対象はreBriefなしの本文repairを保存前に停止する

- 状態: Accepted（自動reBrief／decision revision導入前の安全guard）
- Decision ContextがREADYとなったDaily Missionでは、初回の本文品質判定がREVISE、または初回本文の検査で直近本文との重複・作成指示の露出を検出した場合、既存の本文だけのrepair／variant retryを行わず `CONTENT_REJECTED` で停止する。
- 現行repairはBriefのtopic、angle、personalization reasonを再判断せず本文だけを変更するため、意味変更を確実に検出できない段階で旧reasonを最終本文へ流用しない。MissionとSnapshotの保存前に停止し、不完全な生成物を公開しない。
- Decision Context対象外のServiceは既存repairを維持する。初回品質PASSかつ意味重複なしの対象生成も変更しない。
- 自動reBriefまたは版付きdecision revisionは本変更へ含めない。Provider呼出し回数、quota、失敗復旧、revision参照の契約を別途レビューしてから追加する。

## 2026-10-04: Decision repairの次動作を版付きpure contractで固定する

- 状態: Accepted（自動reBrief接続前の契約）
- 品質判定と既存本文検査の結果を、`KEEP_DECISION`、`REBRIEF_REQUIRED`、`REJECT_CONTENT` のいずれかへ正規化する。policy versionは `social-decision-repair-v1` とする。
- PASSかつ本文検査issueなしだけ同じ `DAILY` decisionを維持する。REVISEまたは本文検査issueは `REVISED_BRIEF` stageを要求し、REJECTはrevisionを提案せず生成物を拒否する。
- 入力は品質verdict、重複排除したissue code、本文検査issueだけとする。本文、Memory、Workspace／User／Bunshin識別子、Provider Promptは契約へ渡さない。
- 本契約は次動作を決めるだけで、自動reBrief、追加Provider呼出し、quota消費、Snapshot保存、UI表示を行わない。既存fail-closed guardは契約結果を使用する。

## 2026-10-04: reBrief入力は安全境界を再確認し1回だけ許可する

- 状態: Accepted（実Provider接続前の入力契約）
- `REBRIEF_REQUIRED` だけを `REVISED_BRIEF` 入力へ変換し、試行上限は1回とする。REJECTをreBrief可能と読み替えず、2回目以降も拒否する。
- authorization、Capability、ownership、safety/legalはreBrief時点で全てPASSEDを要求する。UNKNOWNをPASSEDで補完しない。
- Goal、Strategy version、Weekly goal/angle、日付、timezone、platform、format、利用可能時間、Campaign、classificationを固定する。変更可能なのはtopic、angle、reason、estimatedMinutes、personalization source/reasonだけとする。
- Providerへ渡せる準備結果からWorkspace／User／Bunshin／Profile／Weekly item等の内部識別子と生成本文を除外する。本変更ではProvider呼出し、quota消費、revision保存を行わない。

## 2026-10-04: reBriefは通常Briefと別の未接続Provider adapterを使う

- 状態: Accepted（本番composition接続前のadapter境界）
- reBriefは通常BriefのPromptへrepair指示を追加せず、`daily-mission-rebrief-v1` の別adapterとstrict schemaを使用する。通常Briefの挙動とPrompt Versionは変更しない。
- adapterはreBrief準備時の固定条件とPlanner Contextを照合し、差分があればProvider呼出し前に拒否する。
- Campaign、Product Pack、Group、Personality等の内部参照とasset URLを明示投影で除外する。前Briefの判断要素は渡すが、生成済み投稿本文は入力型に持たない。
- Provider出力は変更許可済みの6項目だけ受け付け、利用可能時間と提供済みpersonalization sourceを再検証する。本変更ではDaily Mission生成経路への接続、quota消費、Usage記録、revision保存を行わない。

## 2026-10-04: reBrief結果は元Briefへ明示投影して固定参照を復元する

- 状態: Accepted（本番composition接続前のpure finalize境界）
- Provider結果を元Briefへspreadせず、topic、angle、reason、estimatedMinutes、personalization source/reasonの6項目だけを明示コピーする。
- socialProfile、Weekly item、Campaign、trendの内部参照とmission date、format、classificationは元Briefから復元し、Provider出力では変更できない。
- finalize前に準備結果と元Briefを再照合し、別Briefとの取り違え、固定条件の変化、余分なfield、時間超過、不正または重複したpersonalization sourceを拒否する。
- 本変更はpure関数とfixtureだけであり、Provider呼出し、Daily Mission生成経路、quota／Usage、永続化、revision snapshotには接続しない。

## 2026-10-04: reBrief lifecycleは最大1回のversioned state machineで制御する

- 状態: Accepted（Provider接続前のorchestration契約）
- 初回DecisionはPASSなら受理、REJECTならfail-closed、REVISEまたは本文検査issueなら1回だけ `REVISED_BRIEF` へ進める。
- `REVISED_BRIEF` は終端stageとし、再品質検査がPASSかつ本文検査issueなしの場合だけ受理する。REVISE、REJECT、重複等は二度目のreBriefを行わずfail-closedとする。
- stageと試行回数、repair dispositionのstageが一致しない入力を拒否し、最大回数をcallerの慣習に依存させない。
- 既存品質pipelineの未接続guardはこのstate machineが返す `RUN_REBRIEF` を記録して停止する。本変更ではProvider呼出し、quota／Usage、保存、通知を開始しない。

## 2026-10-04: reBriefは既存Daily Mission生成内で1回だけ実行し既存Snapshotへrevisionを保存する

- 状態: Accepted（PR #1119をbaseとする本番生成境界接続）
- READYなDecision Context対象だけ、初回品質結果が `RUN_REBRIEF` の場合に専用reBrief adapterを1回呼ぶ。初回REJECTと、改訂後のREVISE／REJECT／本文検査issueはProviderを再度呼ばずfail-closedとする。
- 初回本文・品質は既存suffix、reBriefは `decision-rebrief:1`、改訂本文・品質は `rebrief:1:*` を使う。同じusage prefix内でquota operation keyとAI Usage idempotency keyを一致させ、段階間の衝突を防ぐ。
- reBrief直前に、最初のtrusted precheckから得たauthorization、Capability、ownership、safety/legalをpure契約で再照合する。UNKNOWNやBLOCKEDをPASSEDへ変換しない。
- 改訂後はMemory選択、personalization、本文入力、品質入力を最終Briefから再構築する。初回Brief向けの選択結果を黙って流用しない。
- 新テーブルは追加せず、既存 `GenerationContextSnapshot.payload.decision.revision` に最大回数、policy版、trigger、初回／改訂Prompt・model、元／改訂decisionのSHA-256参照、最終品質をDaily Missionと同一transactionで保存する。digestは匿名化保証ではなく、原Brief本文や内部IDをSnapshotへ複製しないための同一性参照である。
- 改訂後の最終失敗は `DECISION_REBRIEF_FAILED` として既存Daily Mission Generation失敗状態へ残し、Mission／Snapshotを保存しない。本変更は実AI、実課金API、deploy、自動投稿を実行しない。

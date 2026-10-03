# Hassy Photo First品質の独立読取Adapter

後続更新: 開始経路のnullable記録と工程AI利用の明示参照を追加し、読取定義をv2へ更新した。`PHOTO_STARTED / STANDARD_STARTED`を既存3群と分けて扱う。以下のv1監査・検証履歴は保存し、現在との差分・限界・migrationは[記録補完報告](PHOTO_FIRST_OBSERVATION_PROVENANCE_IMPLEMENTATION.md)を参照する。全Photo First成功率のUNKNOWNは維持する。

基準SHA: `ecf80a3ab143681e6f76d8c807897001517e3517`（PR #1083 merge）。2026-10-03 JST。読み取り実装とfake契約検証まで。本番稼働/E2Eの保証ではない。

## 実装範囲

- SOCIAL: `HASSY_PHOTO_QUALITY_DEFINITION`、`projectHassyPhotoQuality`、`summarizeHassyPhotoQuality`。
- database: `PrismaHassyPhotoQualityImprovementAdapter.readObservations/summarize`。共通`CollectImprovementObservations`を再利用。公開exportsを通す。
- 既存`listQualityAudits`（本人Mission認可・100件上限）は変更しない。別の管理者読取queryでWorkspace/Service/本人/分身境界を確認する。
- HTTP/UI/定期Jobへのcompositionは未接続。新schema/migration/依存/設定/課金APIは不要。既存品質検査や生成処理の修正・新規実生成を行わない。

## 確認できた記録と限界

`MissionContentVariantGeneration`にはstatus、最終verdict/score、全品質検査attemptからの重複除去issueCodes（最大20）、repairCount（0〜1）、createdAt/updatedAtとpromptVersionがある。成功時の`complete`は専用Photo First MetadataをVariantと同一Transactionで保存する。失敗時の`fail`は実行済み品質attemptの記録を保存する。

ただし生成claim前の失敗はgenerationが残らず、claim後・品質検査前の失敗には開始経路の明示識別がない。失敗更新自体の失敗や原本削除も復元できない。Photo First解析のAiUsageEventへ本文やidempotency key分解で結び付けない。

根拠: `packages/database/src/mission-content-variant-repository.ts` のclaim/complete/fail/listQualityAudits、`packages/capability-social/src/mission-quality.ts` のmissionContentVariantQualityAudit、`apps/web/src/services/mission-content-variant-generation.ts` の失敗処理、`mission-content-variant-ai-runtime.ts` のusage呼出。

## 認可・Privacy

trusted compositionが解決した固定tenant/Workspace/Service/Package/Adapter/環境とリクエストを照合する。ACTIVE SERVICE_OWNER/SERVICE_ADMIN、ACTIVE User/Service/Workspaceを同一RepeatableRead Transactionで再認可。拒否後はgenerationを読まない。Platform Admin/他OEMへの権限拡大なし。

queryはWorkspace、生成createdAtの半開期間、DailyMission→Bunshin.groupId（内部Service ID）、指定時のownerUserId/Bunshin IDで限定する。返却でもgeneration/Mission/Bunshin/Variant/Photo MetadataのWorkspace/分身/Mission/所有者を照合する。原写真やBunshinMemory、本文、解析/企画JSON、顧客情報、Token、URL、idempotencyKey、モデルraw payloadは取得しない。Photo MetadataはIDと所有境界だけを選択する。

issueCodesは自由文を許す既存型なのでそのまま返さない。`PHOTO_FIRST_UNCONFIRMED_FACT`のbooleanと、未知codeの件数のみ。未知prompt文字列も返さない。個票userRef/bunshinRef/sourceは内部用で匿名化ではない。集計は個人参照を返さないが少数セル表示抑止は未実装。公開前にPrivacy方針が必要。

## 帰属と母集団

| bucket             | 意味                                          | 限界                                                                 |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------------- |
| PHOTO_METADATA     | 成功Variantに専用Metadataの明示Relationあり   | 成功側へ偏る。全試行の分母ではない                                   |
| PHOTO_ISSUE_SIGNAL | 専用Relationなし、既知Photo First品質codeあり | 品質signalであって開始経路の証明ではない                             |
| UNATTRIBUTED       | 上の2つ以外                                   | 通常生成・旧記録・検査前失敗等を区別できない。通常生成と決めつけない |

source subtypeは`CONTENT_VARIANT_QUALITY`。未知記録を確定Photo Firstとして共通Engineへ渡さない。全Serviceの同期間Variant generationを読み、成功/既知issueだけをqueryで事前選別しない。

`photoFirstPopulationPassRate=null`、`photoFirstPopulationCoverage=UNKNOWN`を常に返す。帰属不明行が0でも、claim前の失敗や削除済み原本を確認できないため「全Photo First試行を捕捉」と主張しない。

## 指標 v1

- cohortは`fromInclusive <= generation.createdAt < toExclusive`。各groupのobservedは支援人数や写真枚数ではなくgeneration行数。
- checkedはPASS/REPAIRED_PASS/FINAL_REVISE/FINAL_REJECTの件数。unchecked/pending/invalid/afterCutoffはchecked分母から除外し、metric.coverageをPARTIALとして率を保留する。
- 修正後PASSは最終PASSかつrepairCount=1。過去の問題codeはattempt間の合併で、修正後も残る。最終不合格と混同しない。
- generationFailedはstatus FAILEDの観測件数。品質PASSでもその後の保存失敗等でFAILEDになり得る。品質合格率と生成成功率は別。
- updatedAtが締切以降ならAFTER_CUTOFF。過去の品質状態は復元せず、その行の現在issueを期間内問題件数にも加えない。updatedAtは品質完了時刻そのものではない。
- issueObserved/unconfirmedFactObservedはchecked状態の行だけで数える。unchecked等を品質不良数として数えない。unknown issueの具体文面や回数を推測しない。
- observedCheckedPassRateは完全に取得でき、未検査/不正/期間後更新のない**その帰属groupの観測済み監査行**に対してだけ `(PASS+REPAIRED_PASS)/checked`。全Photo First試行の成功率/品質不良率や因果効果ではない。
- limit+1、最大1,000件/90日、createdAt+IDで安定ソート。打切りPARTIAL/missingCount=null/truncated=trueの場合は全groupの率null。cursor/全件集計は未実装。
- 上位coverageはquery打切りの有無、metric.coverageは監査欠損も含む。COMPLETEは記録されなかった試行や削除前原本の完全性を意味しない。
- 推定/確定原価・未確定原価件数は本queryで取得しないのでnull。0円と推定しない。source revisionはupdatedAt、release SHAは未取得のためnull。

## 版の扱い

runtimeのusage()は解析→文章→品質→修正文→再品質のたびにusageState.promptVersionを更新する。そのためgeneration.promptVersionは**記録された最後の工程版**で、必ずしも文章生成版ではない。

現行コードで確認したcontent v18、quality v13、photo analysis v3と旧fixture variant v1をcodeへ射影し、それ以外はUNAVAILABLE。groupごとにrecordedVersionCountsを返す。未知値を既知版へ補完しない。任意Provider依存を共通domainへ入れない。

品質rule/全工程model/prompt履歴/障害日除外は未取得。複数版や未知版を含む率を修正前後比較へ無条件に使わない。次の相関不足調査で既存AiUsageEventの明示参照・必要な最小補完を検討する。今回の生成元キー文字列分解による結合は行わない。

## 検証・未確認・切り戻し

新規testは`packages/database/test/hassy-improvement-photo-quality-adapter.test.ts`と`packages/capability-social/test/improvement-photo-quality.test.ts`。架空Prismaで実Adapterとquery/projection/集計を呼び、別tenant/Workspace/Service/User/Bunshin、旧/帰属不明、修正後PASS、最終不合格、未検査、100件相当のlimit+1、時刻境界、未知code、秘密・写真非取得を固定する。既存本人品質照会の拒否テストも維持する。

検証（2026-10-03 JST、既存Node v24.21.0）:

- database全体: `pnpm --filter @bunshin/database test`、178ファイル726件成功。新Adapter24件と既存の本人品質照会2件を含む。
- SOCIAL全体: `pnpm --filter @bunshin/capability-social test`、24ファイル209件成功。新projection16件を含む。
- 初回の対象試験: database2ファイル26件、projection14件成功。その後にPrompt版/監査不整合の2ケースと期間後issue除外を追加し、上記全体試験で確認。
- database/SOCIAL型チェック・対象ESLint・対象Prettier・両packageのbuild・architecture:check・test:architecture（10件）・git diff --check成功。初回lintはfixtureの不要cast1件で失敗し、castを除去して再実行後に成功。全体の最終headは通常PR CIで確認する。

実DB/PostgreSQLの新query、本番権限/保持期限/データ分布、実Provider/Storage/LINE、実端末E2Eは未実行。通常CIの隔離DB検証を本番E2Eとは扱わない。APIへの公開前に実query・少数セル・scope正本解決の確認が必要。

既存生成/品質/所有者照会は変更しない。切り戻しは新Adapterの呼出しを外すだけで記録の修復や削除は不要。本番変更・課金・生成・送信・merge・deployは実施しない。

## 次の最小タスク

順序3の相関不足監査。Photo First開始→claim→解析→品質→保存の明示参照を一覧化し、帰属不明を減らす最小案を提案する。schema/生成経路の変更が必要なら別PRとして範囲・移行・rollbackを確定する。検知/候補承認画面/共通Feedback/修正後比較を本PRへ混ぜない。

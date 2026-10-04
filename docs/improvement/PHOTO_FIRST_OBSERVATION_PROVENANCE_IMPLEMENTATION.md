# Photo First観測の開始経路・工程参照補完

## ゴールと結論

2026-10-03 JST。基準main: `e1aaa8be8a8b62f3e5ba91de939ed51f96930493`（PR #1084 merge）。未帰属の原因調査・最小記録補完・所有境界/障害回帰を一つの作業単位とする。管理UI、Feedback、検知、Candidateは別タスク。

新規の投稿別案Generationはclaim時に開始経路を残す。Photo First解析前・品質検査前の失敗も、新規のclaimが保存されていれば`PHOTO_FIRST`と識別できる。工程ごとの既存AI利用イベントへ明示FKを渡し、時刻やキー文字列を解析せず追跡できる。ただし全試行の捕捉・全工程原価・本番品質は保証しない。

## 調査した不足と接続

| 経路                                      | 従来の記録                                               | 今回の最小補完                                                      |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| 権限/原Mission/Context Snapshot検証→claim | 失敗はGenerationなし                                     | 変更なし。母集団外・件数未確認                                      |
| claim→Context/写真Storage/解析            | Generationはあるが開始経路なし                           | `MissionContentVariantGeneration.initiatingSource`をclaim時に保存   |
| 写真解析→文章→品質→修正文章→再品質        | AiUsageEventの各model/promptはあるがGenerationへのFKなし | `AiUsageEvent.contentVariantGenerationId`、同一Generationへの任意FK |
| 完成→Variant/Photo Metadata保存           | 成功Metadataの明示Relation                               | 既存Transactionを維持                                               |
| claim後の失敗                             | FAILED/品質Auditとpipeline failure利用イベント           | 既存失敗イベントにもGeneration FKを渡す                             |

根拠シンボル: `MissionContentVariantGenerationService.executeInternal`、`generateMissionContentVariantWithAi`の`usage`、`PrismaMissionContentVariantRepository.claim/complete/fail`、`PrismaAiUsageEventRepository.record`。初回Daily Mission生成全体、写真のアップロード、別Provider、動画発注の記録を新しく統合するものではない。

## 保存・認可・互換性

- sourceは`STANDARD / PHOTO_FIRST / null`。STANDARDは通常の投稿別案経路であり、ワタシワークス全体の通常生成分類ではない。確認回答からのPhoto First再生成もPHOTO_FIRST。旧行とsource未指定の旧呼出しはnull。既存行のUPDATE/backfillなし。
- claimは既存Mission認可・advisory lockを維持。同じkeyを別Missionや別の既知sourceで再利用するとCONFLICT。旧null行は推定でラベル付けせず、既存claimとして返す。再発注しない既存成功再読込の挙動を維持。
- AI利用の任意参照はapplication入力でUUID/Bunshin有無を検証。DB Repositoryは既存ACTIVE membershipに加え、GenerationのWorkspace/Bunshin/actorとMissionのBunshin所有権を照合する。Serviceは本人のみ。個人Workspaceは既存claimの明示OWNER/ADMIN管理権限も維持し、一般MEMBERの他所有者操作を許可しない。参照Generationのactorは常に入力actorと一致させる。同一keyの既存イベントは上書きせず、参照/Bunshin/工程が異なる場合CONFLICT。旧イベントへ後付けしない。
- FKはGeneration実体の存在をDBで保証する。Workspace/Bunshin/ownerの整合はRepositoryが確認し、**直接SQL書込に対する複合scope制約ではない**。信頼済みのRepository経路を使うこと。DBの広い資格情報を顧客へ渡さない。
- Generation削除時は参照だけSET NULL。AI利用イベント・費用は連鎖削除しない。参照を失ったイベントから帰属を復元しない。既存の利用イベントの保持/削除方針は変更しない。
- 原写真・解析JSON・本文・会話・個人メモリー・URL・秘密情報を新しい観測へ追加しない。共通層にHassy固有の生成判断を実装しない。

## 読取 v2と原価の注意

`hassy-photo-quality-v2`は`PHOTO_STARTED / STANDARD_STARTED`群を追加。旧`PHOTO_METADATA / PHOTO_ISSUE_SIGNAL / UNATTRIBUTED`はそのまま残す。明示sourceがあればそちらを優先し、未検査失敗をchecked分母や品質不良へ含めない。旧群と新群を合算して時系列の改善率としない。

全Photo First母集団の成功率は引き続きnull/UNKNOWN。claim前の失敗、失敗更新の失敗、削除、query打切りは未捕捉。API/UI/定期読取へのcompositionと少数セルのPrivacy方針は未実装。

工程model/prompt/tokens/costは**既存AiUsageEventの個別行**を明示参照で確認する。Generation.promptVersionは最後の工程版であり、全工程の版ではない。今回の品質集計はAI利用額を取得しないため原価欄はnullのまま。

重要: `MISSION_CONTENT_VARIANT_PIPELINE`のFAILED行は既存の累積サマリーである。成功済み各工程イベントとこれを足すと二重計上する。今回その既存原価契約は変更しない。後続の原価読取では工程行とpipelineサマリーを別扱いし、実測/見積/未確定/集計完全性を定義する必要がある。Provider例外で利用情報が返らない工程は未確定であり、0円にしない。

`recordAiUsageSafely`は従来どおりbest effort。記録失敗でProviderを再実行しないが、利用イベントの欠測は起こり得る。実Providerの発注IDや確定請求額を今回追加取得したものではない。

## 検証

Node v24.21.0、既存pnpm環境。実生成・実Storage・LINE送信は使用しない。

- DB fake契約: claim時保存、旧null維持、別Mission/sourceのkey衝突、参照の所有境界、利用keyの付け替え拒否、既存原価欄のnull/BigInt維持。
- 実サービス＋fake境界: Context取得失敗（品質検査前）でも開始経路をclaimへ渡し、failure利用と失敗Auditへ同じGenerationを渡す。新しいserviceインスタンスによる成功再読込でProviderを呼ばない。
- 実runtime＋fake Provider/use-case/quota/利用保存: 解析/文章/品質/修正/再品質の5工程が同じGenerationへ結び付き、各prompt版と工程keyを保つ。解析・品質例外で架空の成功記録を作らない。fetchは未注入通信を即失敗させ終了後復元。
- 品質Adapter/projection: Metadataなし・verdictなしの明示Photo開始失敗を観測し、率は保留。母集団UNKNOWNを維持。既存所有境界テストも実行。
- 隔離DB用integration: 実Repository/Prismaでsourceと利用FK保存、idempotent再記録、ACTIVE同Workspace他所有者/他Workspace拒否、FAILED後の原価保持、Generation削除後のSET NULLと原価保持、source CHECK拒否を確認する。ローカル本番DBでは実行せず通常PR CIの隔離PostgreSQLで実行する。

再実行コマンド:

```powershell
pnpm db:generate
pnpm --filter @bunshin/database test
pnpm --filter @bunshin/capability-social test
pnpm --filter @bunshin/application exec vitest run test/ai-usage.test.ts
pnpm --filter web exec vitest run test/mission-content-variant-usage-provenance.test.ts test/mission-content-variant-claim-provenance.test.ts test/mission-content-variant-generation.test.ts test/point-funded-mission-content-variant.test.ts test/mission-content-variant-http.test.ts test/mission-content-variant-ai-runtime-boundary.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
git diff --check
```

実行結果（2026-10-03 JST）:

- DB全体: 179ファイル739件成功（外部通信/実DBなし）。再実行は`pnpm --filter @bunshin/database exec vitest run --exclude '**/*.integration.test.ts' --maxWorkers 2`。初回はschema全体整形による無関係な差分、migration準備チェック更新漏れ、RLS検査の時間切れで7件失敗。対象外整形を元に戻し準備チェックを更新し、期待値/timeout/skipは変更せず並列数のみ減らして再実行した。
- SOCIAL全体: 24ファイル210件成功。application AI利用: 1ファイル3件成功。web関連: 6ファイル29件成功。architecture:checkとtest:architecture（10件）、web単独型チェック、git diff --check成功。
- 初回serviceテストはmockに既存application exportが不足して起動失敗。partial mockへ修正し、上記web関連再実行で成功した。
- 初回head `302c677596ca13bed8eb6115feefa3b2aff430c3`の[CI](https://github.com/team478a/bunshin-platform/actions/runs/37078169176)では隔離PostgreSQLのmigration・準備確認・integration 51件成功。verifyはテストファイル1件のPrettier整形で停止した。該当整形を修正し、最新headのverify/databaseは改めて確認する（古いheadの成功を流用しない）。
- head `3bce72f914812305c4d164214a9c92a7fbf2a74f`はformat/typecheckとDB CIが成功し、lintでテストhelperの未型付け戻り値/不要asyncが検出された。helperへ型付けとPromise返却を追加し、期待値やCI条件は変更せず再検証する。完了監査では個人Workspaceの明示ADMIN操作の記録互換性も補完し、Serviceで他所有者を許可しない隔離DB試験を追加した。
- 全体型チェック/lint/format/buildの最終状態はPRの最新head CIと最終報告で確定する。失敗を安全対策完了や本番障害と混同しない。ローカル本番DBと実Provider/Storage/LINE/実端末E2Eは未実行。

## Migration・切り戻し・次タスク

`20261003000000_photo_first_observation_provenance`はnullable2列、source CHECK、参照index、SET NULL FKのみ。依存/lockfile/CI/本番設定の変更なし。新しい生成コードと読取を配備する前にmigrationが必要だが、本作業では本番へ適用しない。

切り戻しは旧コードへ戻し、追加列/FKを残す。不要な列削除や履歴消去をロールバック手順に含めない。旧コードは追加nullable列を使わない。再配備時も旧null行を新sourceへ推測補完しない。

次のまとまりは共通「困った」Feedbackの本人scope契約・保存・スマートフォン入力・二重送信/権限回帰。検知・Candidate・承認UIはその後。現行費用の完全性・release SHA・claim前イベントは別の不足として残す。

本番変更、実API課金、画像/動画/音声生成、実送信、merge、deployは行わない。PR共有のみ。

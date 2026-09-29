# 本番反映準備: サービス分離・AI安定化・研修運用

日付: 2026-09-29（Asia/Tokyo）。状態: Draft / 本番未反映。

## 1. 調査した内容と固定対象

- 現行Production branch: `cc30b69a413282ed7ac3b6e856d643d422a193ce`。GitHub Deployment `6704721593`はsuccess（2026-09-28）。公開ドメインでの厳密な実行SHA検証とは区別する。
- リリース対象main: `3e57e72bdbc2e6f4db07ec6197e38d852f6d5c11`（#1010まで）。以後のmain更新を自動追加しないよう、このSHAから`codex/release-service-isolation-20260929`を作成した。
- productionの既存merge履歴を通常mergeで取り込み、strictな保護ブランチの最新base条件を満たす。Applicationのtreeは固定mainのまま、固定SHAとの差分は本報告書1件だけであることを再確認する。productionが後で更新された場合は再監査が必要。
- 実装・テスト・文書の未反映差分: 237ファイル、17,586行追加、562行削除。追加する本報告書はこの数に含まない。productionと共通祖先`f79a5fec`のtreeは一致し、production固有コミットによる未確認の実装差分はない。
- マージ済み21件のPRと、SQL migration、Productionの実行停止条件、フラグ、Cron、Deployment/DB運用文書、CIを確認した。
- 正式ドメインのliveは`ok`、readyは`ready`、configuration/authentication/databaseは`ok`、databaseSchemaは`current`だった。これは現行稼働版の健全性であり、新migration適用の証拠ではない。

## 2. 反映する既存変更と変更ファイル

| 区分                     | 対象PR                                                                                 | 主な内容                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証・LINEのサービス分離 | #1005 / #1006 / #1010                                                                  | 認証後に元サービスへ復帰、共通業種登録の混在防止、試行別ログイン復帰、専用LINEの試行Cookie分離と非公開の既存参加者対応                                        |
| AI障害・占い             | #989 / #990 / #1007 / #1008                                                            | Provider応答/timeout分類、恒久的失敗の再試行停止、中断生成の標準結果への復旧、非同期占いJobと原子的な重複投入防止                                             |
| ハッシーSNS支援          | #991                                                                                   | 追加質問の見送りと再表示休止、本人回答編集の維持                                                                                                              |
| AI研修                   | #992 / #993 / #995 / #996 / #997 / #998 / #999 / #1000 / #1001 / #1002 / #1004 / #1009 | 本人Export/明示削除、保持期限Preview/停止中の実行口、管理者Lifecycleと終了案内、評価自由文の非公開、期間ガード/表示、停止中の期限バッチ、過去終了日の個別確定 |
| OEM                      | #1003                                                                                  | 決済CSVの日本時間受付期間指定、10,000件超過時の部分出力拒否                                                                                                   |

新規Application修正や機能追加は行わない。既存mainのApplicationを固定したrelease branchに、本報告書だけを追加する。個別実装の仕様・テストは各PRと機能別実装報告を参照する。

## 3. Migrationと主要な運用判断

| Migration                                           | SQL内容                                                                                       | 既存データへの影響/互換性                                                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260928120000_add_onboarding_refinement_deferral` | 初回回答にJSONB見送り状態（既定`{}`）とnullableな提示再開日時を追加                           | カラム追加。回答本文の変更・削除なし。ALTERのtable lockと実データ量による実行時間は本番未検証                                                                      |
| `20260928200000_add_training_retention_state`       | 受講Scope付き保持期限状態テーブル、FK/index、RLS、将来の受講status変更を記録するTriggerを追加 | 過去終了日の一括補完や学習情報削除なし。今後AI研修の終了遷移で終了日を記録し、ACTIVE再開では期限処理印をリセットする。旧Applicationへのコード復帰後もTriggerは残る |
| `20260929070000_auth_return_attempts`               | 認証試行用enum/table、整合CHECK、期限index、RLSを追加                                         | 既存User/Sessionの移行・削除なし。新方式の開始は別の明示フラグで制御する                                                                                           |

3件とも加算型のDDLであり、DROP、既存行のDELETE、過去日時の推定補完は含まない。新テーブルのRLSを有効化し、browserから直接使用せず既存server repository経由で扱う。空DBでのCI成功を本番のbackupやlock時間の保証と扱わない。

### 自動的に変わる処理と停止を維持する処理

- **占い中断生成の復旧Cronは本番反映で新規登録される。** 5分ごと、最終更新から10分以上経過した未削除`GENERATING`を最大100件確認する。有効な待機/lease/retry Jobは優先し、保存済み標準結果が揃う場合は`READY_BASIC`、欠ける場合は`FAILED`へCASで移す。既存滞留にも作用する。カード再抽選・AI再呼出・LINE再送はしない。
- AI研修の自動期限終了APIと保持期限のexecuteはproductionでは503停止を維持する。研修用の期限/消去Cronは登録しない。保持期限Previewは読み取り専用で利用できる。
- 本人の明示削除と管理者Lifecycle/終了日確定は、本人/Service/確認Revision/排他/監査付きの手動機能として追加される。自動保持期限の停止と、これら手動機能の利用可否を混同しない。手動削除後のデータ復元をコードrollbackで保証しない。
- `AUTH_RETURN_ATTEMPTS_ENABLED`と`FORTUNE_ASYNC_GENERATION_ENABLED`はコードの初期値がfalse。**本番変数の実値は未確認**であり、設定未変更だけを根拠に無効と断言しない。merge前にfalse/未設定を運用者が確認する。有効化は別途外部設定・端末/Worker検証と承認が必要。
- Providerの応答契約と再試行分類は既存Jobにも新コードで適用される。DEAD Jobの一括再投入、参照切れPillarの自動置換、過去181件の失敗記録消去はしない。
- 今回の承認はrelease PRの準備まで。本番merge、Vercel手動Deploy、DB commandの実行、設定変更、実Provider/LINE操作は行わない。backupと運用条件の確認前にDraftを解除しない。

## 4. 実行した検証

- 固定mainのCI [36550733445](https://github.com/team478a/bunshin-platform/actions/runs/36550733445): verify/databaseとも成功。format/typecheck/lint/test/build、migration/readiness、DB integrationを含む。
- 本準備でのWeb重点10ファイル176件、DB重点5ファイル80件が成功。LINE/認証復帰・業種登録分離・研修のproduction execute停止/期限バッチ停止・終了日確認・占い復旧/Queue・OEM期間CSV・追加質問を確認した。外部ProviderとDBはUnit testのMockであり、本番を操作した結果ではない。
- 本報告書のformatと`git diff --check`を確認し、release PRにもverify/database CIを実行する。releaseのHEADのCIはbase mainの証跡と分けて確認する。
- 本番のmigration、バックアップ作成/復元、Cronの手動実行、認証/通知/生成/削除操作は未実施。

## 5. 未解決事項・Draft解除前の確認

- [ ] 本番DBの直近backupの日時、保持期間、復旧方法と担当者の証跡を運用者が確認する。確認のためにSecretや回答本文をPRへ記載しない。
- [ ] 占い復旧Cronの対象/変更内容と、自動保持期限は停止・手動削除は利用可能という公開範囲を運営者が確認する。
- [ ] 新規2フラグの本番値がfalse/未設定であることを確認する。trueなら外部設定/端末/Workerの有効化Gateを別途確認するまで公開しない。
- [ ] release HEADのverify/database成功、対象SHA/差分固定、production更新による追加差分/競合がないことを確認する。
- [ ] リリース/監視/rollback担当者と確認可能な時間帯を決める。Supabaseのrestore rehearsal・Vercel build logの保持状況は今回直接確認していない。

### Rollback / forward-fix

問題発生時は運用者の承認後、Applicationを旧成功Deploymentへ戻すか、production向け修正PRでforward-fixする。適用済み3件のmigrationを自動逆実行せず、新table/column/Triggerは残す。既存schemaを読む旧Applicationとの前方互換性はSQL構造上確認したが、旧版の本番復帰実験は未実施である。Cron登録/実行の停止と復帰後の動作も個別確認する。書込済み状態、本人が明示削除した情報、Triggerの記録をコードrollbackで巻き戻せるとは扱わない。

## 6. 本番反映と次の確認へ進む条件

上記の未確認事項を満たしてrelease PRのレビューを完了した後、運用者がDraftを解除しproductionへmergeする。mergeは本番DB migrationと公開の開始操作なので、準備完了とは区別する。

1. Vercel Productionのmigration、schema readiness、Web buildとDeployment successを確認し、GitHub Deployment/SHAを記録する。
2. live/readyとリリース後のProduction Health Smokeを確認する。schema readiness失敗なら画面検証へ進まず、migration障害を調査する。
3. 千ノ国のLINE再連携で共通業種質問が挟まらず、SNS支援の必要な業種設定が維持されることを確認する。同一端末で2サービスを開始して片方を取消しても他方が完了できること、非公開サービスの既存参加者/非所属/他人のBunshinの境界を確認する。
4. 占いCronの集計だけで対象数/復旧/失敗とエラーを監視する。AIの新しい期間の最終Job状態と成功率を観測し、過去失敗を消して改善とみなさない。
5. 研修の期間表示/終了案内、OEMの期間CSV、追加質問の見送りを検証用アカウントで確認する。LINE再送、本人削除、管理者Lifecycleの本番操作は別途明示した対象と承認で実施する。

一般公開や無人運用への拡大ではなく、既存の自社限定CONDITIONAL GOの範囲を維持する。

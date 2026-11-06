# ワタシワークス全サービス横断 機能台帳

調査基準日: 2026-11-06 JST

基準: `main` = `d884d7c6f57a5f882cca32b91dce3e0d67b3c706`、`production` = `9473b4294f0b6f36c339d659aca0e397637009f9`

## エグゼクティブサマリー

| 指標                                         | 件数・結論                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 調査したサービス領域                         | 8（7サービス群 + 共通基盤）                                                                    |
| 台帳化した機能                               | 112                                                                                            |
| A                                            | 8                                                                                              |
| B                                            | 64                                                                                             |
| C                                            | 31                                                                                             |
| D                                            | 3                                                                                              |
| E                                            | 2                                                                                              |
| 要確認                                       | 4                                                                                              |
| 本番でサービス全体の利用完了を確認できたもの | 0                                                                                              |
| 本番で一部成功を確認できたもの               | ハッシーの公開入口、メール認証、初期設定、専用LINE接続、SNSプロフィール/テーマ保存。共通health |
| 本番利用に問題があるもの                     | ハッシー（AI原価未確定で配信開始停止）。その他6サービス群は完走証拠不足のため販売Goにできない  |

全112行の正本は[フィルター可能なCSV](20261106_FUNCTION_INVENTORY.csv)。Markdownでは判断基準と横断結論だけを保持し、画面・API・コード・Migration・PR・テスト・本番証拠の詳細はCSVを参照する。

## 重要な結論

1. コード量は「未実装」より「実装済みだが利用成功未確認」が支配的である。176 page、388 API route、276 Prisma migration、1,076 test fileを確認した。新機能追加より既存導線の実証が先である。
2. `production`は`main`の単純な祖先ではない。分岐はproduction側のみ2 commit、main側のみ36 commitで、tree差分は95 file・6,454 insertions・322 deletions。mainへのmergeを本番反映とみなしていない。
3. 2026-11-06の公開Production Health Smokeはlive、ready、configuration、authentication、database、databaseSchema=current、`/s/hassy`表示を確認して成功した。ただしこれは機能利用成功の証拠ではない。
4. ハッシーの本番操作では2026-11-06 07:44 JSTに戦略生成が`PROVIDER_COST_UNKNOWN`でHTTP 409となり、LINE配信開始まで進まなかった。失敗・tokenなし記録を0円精算できる修正#1481と管理画面簡素化#1482はmainにあるが、productionブランチにはない。
5. マナベルスタイルは固定教材と動的学習の両方にコードがある。固定教材はProgram/Assignment中心、動的学習はLearning Request/Goal/Plan revision/Definition approval/AI相談中心であり、提供状態を混同しない。どちらも本番完走証拠は見つからなかった。
6. 副業、占い、物販、メディア/OEMは共通基盤を相当再利用している。専用Service設定・実利用・外部接続の証拠が不足し、コードの存在だけでは販売可能と判定できない。

## 判定基準

| 判定   | この監査で要求した証拠                                               |
| ------ | -------------------------------------------------------------------- |
| A      | 本番で利用者操作の成功、または対象機能そのものの実結果を確認済み     |
| B      | productionブランチまたは本番相当環境に実装があるが、利用成功は未確認 |
| C      | mainにコード・DB・テストがあるが、production反映を確認できない       |
| D      | 主要部品だけ、または利用者導線/設定/公開Serviceが欠ける              |
| E      | 実装を確認できない、構想のみ                                         |
| 要確認 | 証拠が相反・不足し、A〜Eを確定すると推測になる                       |

`A`はサービス全体ではなく機能単位。たとえばハッシーのメールログインがAでも、投稿案生成・LINE配信をAに引き上げていない。

## サービス別集計

| サービス               | 機能数 | 主な到達点                                                                  | 主な停止点                                                  |
| ---------------------- | -----: | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ハッシー               |     22 | 公開入口、認証、初期設定、専用LINE接続、プロフィール/テーマ保存は実利用確認 | AI原価未確定により戦略生成409、配信開始・投稿完了ループ未達 |
| マナベルスタイル       |     16 | 固定教材・動的学習・評価・再開・LINE・原価管理のコードあり                  | 本番完走なし。動的学習の本番Gate/実AI/実端末証拠不足        |
| マナベルスタイル副業版 |      9 | ヒアリング、候補、90日計画、振り返り、revision実装                          | 専用Service/Programの本番実体と利用証拠なし                 |
| 占い                   |      8 | Package、カード、標準知識、個別化、履歴、評価、LINE実装                     | 公開Service、承認済み知識版、実利用証拠が不明               |
| AI物販                 |      9 | 7日/90日policy、Action、商品、オファー、決済部品あり                        | 公開Service、決済、7日/90日完走証拠なし                     |
| メディア・アンバサダー |     12 | Campaign、商品素材、投稿支援、成果、紹介、point/badgeを実装                 | 千ノ国を含む本番通し・外部成果照合の証拠なし                |
| OEM・ホワイトラベル    |     16 | テナント、brand、feature、契約、課金、請求、利用量を実装                    | 1社の登録から請求までの通し証拠なし。顧客移管は未実装       |
| 共通基盤               |     20 | 認証、scope、Provider、Job、監査、法務、healthまで広範                      | 管理面が肥大化。機能別成功と本番RLS/role証拠は別途必要      |

## main / production / 公開環境の扱い

- `git rev-list --left-right --count origin/production...origin/main`は`2 36`。release mergeを含むためcommit件数を機能数へ換算していない。
- `origin/production..origin/main`にはInstagram公式接続・承認付き公開、サービス別login、AI原価診断/0円精算/管理画面簡素化が含まれる。
- GitHub Deploymentの`environment=production`にはアプリdeployだけでなくMigration History Probeやmigration workflowも含まれる。`success`だけで公開アプリSHAと断定しない。
- 2026-11-06の公開health成功を「基盤稼働B/Aの一部証拠」とし、ログイン後の業務成功へ流用しない。
- 本番設定・データ・Feature Flag・外部APIは今回変更していない。有料AI、LINE送信、SNS投稿、決済を実行していない。

## 調査した証拠

- ソース: `apps/web/app`、`apps/web/src`、`packages/*/src`
- API/UI: Next.js page 176、route 388
- DB: `packages/database/prisma/schema.prisma`、migration 276
- 自動テスト: 1,076 test/spec file（web 579、database 241、application 155、training 39、social 34ほか）
- 履歴: `git log`、`git diff origin/production..origin/main`、GitHub PR/Actions/Deployments
- 本番証跡: `docs/hassy/HASSY_PRODUCTION_OPERATION_AUDIT_2026-11-05.md`、マナベルread-only audit/launch runbook、2026-11-06 Production Health Smoke log

READMEや実装報告は索引として用い、最終判定は現行コード・route・schema・test・branch差分と矛盾しない場合だけ採用した。過去文書の「実装済み」は本番利用成功へ読み替えていない。

## 未解決事項

- 公開アプリの厳密なcommit SHAと`production`ブランチの対応
- 各Serviceの現行Feature/Program/Product/LINE/AI設定のread-only一覧
- マナベル固定教材/動的学習の本番受講開始・完走件数
- 千ノ国、占い、物販、副業版の公開slug・有効参加者・最終成功時刻
- Stripeの本番/テストmode、webhook最終成功、返金・失効実績
- Cron/Jobごとの最終成功、滞留、dead-letter相当状態

これらは推測で埋めず、[実運用導線報告](20261106_SERVICE_OPERATION_READINESS.md)のsmoke項目として残す。

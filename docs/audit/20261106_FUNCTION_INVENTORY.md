# ワタシワークス全サービス横断 機能台帳

調査基準日: 2026-11-06 JST

基準:

- `main`: `d884d7c6f57a5f882cca32b91dce3e0d67b3c706`
- `production` branch: `9473b4294f0b6f36c339d659aca0e397637009f9`
- 公開Vercel deployment: `dpl_J2gYTWu8YsoQPZSBzSCpMsj5XZRb`
- 公開deployment metadata SHA: `1d09ba058e75674c6dd34f9dd99b2e46825edaef`

## 最終集計

| 指標                                     |                  件数・結論 |
| ---------------------------------------- | --------------------------: |
| サービス領域                             | 8（7サービス群 + 共通基盤） |
| 機能                                     |                         112 |
| A                                        |                           8 |
| B                                        |                          95 |
| C                                        |                           0 |
| D                                        |                           3 |
| E                                        |                           2 |
| 要確認                                   |                           4 |
| コード実装 完了 / 部分 / 未実装          |                 106 / 4 / 2 |
| 実利用検証 成功 / 失敗 / 未実施 / 未確認 |              8 / 3 / 7 / 94 |
| サービス全体の一般販売GO                 |                           0 |

全112行の正本は[CSV](20261106_FUNCTION_INVENTORY.csv)。CSVではコード実装、本番反映、実利用検証、販売判断を独立列にした。A〜Eは機能の総合到達度であり、販売判断の代用ではない。

実利用検証の「失敗」3件（H-07、O-13、C-11）は、別々の3障害ではなく、ハッシーの`PROVIDER_COST_UNKNOWN`事象を、発信戦略生成・AI原価管理・共通AI実行の各機能行へ反映したものである。

## 監査前後で変わった点

| 項目        | 監査前         | 再監査後           | 根拠                                                                                                          |
| ----------- | -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| C判定       | 31             | 0                  | 公開deploymentをread-onlyで同定。Instagram、side-hustle、fortune、resale、AI原価等のrouteをbuild outputで確認 |
| B判定       | 64             | 95                 | main実装のみとみなしていた31件を「公開反映済み・実利用未確認」のBへ変更                                       |
| #1481/#1482 | 本番未反映扱い | 公開反映済み       | 公開SHAは#1482 head `1d09ba05`。#1481 headを祖先に含み、main merge `d884d7c6`とGit treeが同じ                 |
| Hassy権限   | P0前提         | 実利用失敗は未確認 | 設定上の未付与記録はあるが、一般参加者が権限不足で失敗した操作証跡はない                                      |

Vercel metadataには`gitDirty=1`があるため、公開artifactがcommit treeとbyte単位で同一とは断定しない。一方、優先機能のrouteは公開build outputで個別に確認した。`production` branchが古いことと、公開Vercelへコードが反映済みであることを分けて記録する。

## サービス別 A〜E・要確認

| サービス               |     A |      B |     C |     D |     E | 要確認 |      計 |
| ---------------------- | ----: | -----: | ----: | ----: | ----: | -----: | ------: |
| ハッシー               |     6 |     13 |     0 |     1 |     1 |      1 |      22 |
| マナベルスタイル       |     0 |     16 |     0 |     0 |     0 |      0 |      16 |
| マナベルスタイル副業版 |     0 |      8 |     0 |     1 |     0 |      0 |       9 |
| 占い                   |     0 |      7 |     0 |     0 |     0 |      1 |       8 |
| AI物販                 |     0 |      8 |     0 |     1 |     0 |      0 |       9 |
| メディア・アンバサダー |     0 |     11 |     0 |     0 |     0 |      1 |      12 |
| OEM・ホワイトラベル    |     0 |     14 |     0 |     0 |     1 |      1 |      16 |
| 共通基盤               |     2 |     18 |     0 |     0 |     0 |      0 |      20 |
| **合計**               | **8** | **95** | **0** | **3** | **2** |  **4** | **112** |

## 独立4軸

| 軸           | 値                                   | 解釈                                                   |
| ------------ | ------------------------------------ | ------------------------------------------------------ |
| コード実装   | 完了・部分実装・未実装               | 現行source/API/UI/DBが揃うか                           |
| 公開本番反映 | 確認済み・部分確認・対象なし・未確認 | branch名ではなく公開artifact/build output/schemaを確認 |
| 実利用検証   | 成功・失敗・未実施・未確認           | 実利用がないことと利用不能を区別                       |
| 販売判断     | GO・条件付きGO・NO-GO・未判定        | 説明/デモ/先行テスト/一般販売の条件を分離              |

コードが公開済みでも実操作がなければBであり、Aや一般販売GOにはしない。実利用証拠がないだけでコードを未完成とはしない。

## 判定基準

| 判定   | 証拠                                                          |
| ------ | ------------------------------------------------------------- |
| A      | 本番で対象機能の利用成功を確認                                |
| B      | 公開本番へコード/DBが反映済みだが、対象機能の利用成功は未確認 |
| C      | main実装済みだが公開本番反映を確認できない                    |
| D      | 主要部品のみ、または利用者導線/設定/公開Serviceが欠ける       |
| E      | 未実装・構想                                                  |
| 要確認 | 証拠不足・相反により確定不能                                  |

## main / production / 公開環境

- `origin/production...origin/main`はproduction側2 commit、main側36 commit。単純なfast-forward関係ではない。
- 公開Vercelは2026-11-06 09:52:57 JSTにREADYとなった`1d09ba05`を示す。`production` branch headとは異なる。
- `1d09ba05`は#1481を含み、#1482のhead。Git treeはmain `d884d7c6`と同一。
- 公開build output 1,144 pathから、Instagram接続/投稿、side-hustle、fortune、resale、AI原価精算、custom-domain等のrouteを確認した。
- `/api/health/live`は`ok`、`/api/health/ready`は`ready`。configuration/authentication/databaseは`ok`、databaseSchemaは`current`。
- schema readiness正本は`20261104020000_social_publication_intents`。healthは機能別の成功や本番設定の妥当性を保証しない。

## P0/P1の証拠強化

CSVのH-05、H-07、H-09、H-10、H-13、H-14、H-19、H-20、M-01〜M-11、O-01/O-02/O-06/O-07/O-09〜O-14、C-11/C-15/C-20には、具体的なAPI、source、table/migration、PR、test file、結果を記載した。

主な実運用証拠:

- Hassy: 2026-11-06 07:44 JST、戦略生成が`PROVIDER_COST_UNKNOWN`でHTTP 409。成功4件はtokenあり、失敗8件はtokenなしでProvider送信前停止。
- #1481: 失敗かつtokenなしだけ0円精算可能、成功/tokenありはDB拒否。対象22 test成功。
- #1482: 月額上限中心の表示、原価記録のgroup化・一括入力。web 7 test + 用語2 test成功。
- PR #1483 CI: `verify`と`database`が成功。これは実利用成功の代替ではない。

## 未解決事項

- Hassyの本番実データ精算、戦略生成再実行、配信開始、LINE受信、投稿完了。
- 一般参加者の契約資格、Service Membership、Group Feature、Capability、Member Assignmentのread-only照合。
- マナベル固定/動的の開始・評価・完走件数。
- 副業、占い、物販、千ノ国の有効Service設定と利用実績。
- Stripe、請求、Cron/Jobの機能別最終成功。
- Vercel `gitDirty=1`の変更内容。公開routeの存在は確認したが、artifact全体のbyte一致は未確認。

本監査では本番設定、データ、Feature Flagを変更せず、有料AI、LINE送信、SNS投稿、決済を実行していない。

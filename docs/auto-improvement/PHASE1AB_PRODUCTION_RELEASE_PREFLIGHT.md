# Feedback統合 1-A + 1-B 限定本番リリース

## 対象・判断

2026-10-12 JST、#1259の人間マージを確認し、小さな機能単位で本番反映する方針に沿ってrelease候補を準備した。自動マージ、productionへの直接push、手動Deployは行わない。production向けPRの人間マージ後、Git連携Deploymentを確認する。

- main: `ad6fff672ad3e0ecc14e067aa607310a9f744468`。
- production / rollback基準: `e7415ad33cc1a6b17ff38c7e86028255cfe77aca`。
- #1259: MERGED、verify/database SUCCESS。[CI](https://github.com/team478a/bunshin-platform/actions/runs/38235005744)。#1258のverify/databaseも成功確認済み。
- release branch: `codex/release-feedback-overview-20261012`。コードtip: `96f555bd`（本報告追加前）。元checkoutの未解決変更は操作していない。

## 取り込み一覧

| 元commit   | release commit | 内容                                                         |
| ---------- | -------------- | ------------------------------------------------------------ |
| `93f9b3b8` | `dc64ab90`     | #1258 既存原本のscope限定読取、少数・欠測抑制、公開Reader    |
| `eddfcef9` | `a6c3d75e`     | #1258 完了課題のテストfixtureを既存DB制約へ合わせる          |
| `86343fd1` | `96f555bd`     | #1259 管理者の固定週GET・件数範囲表示、ログ、ナビ、login復帰 |

production基点へ上記3件を`cherry-pick -x`し、競合なし。本人向けAI生成、課金、OEM運用操作、自動修正を起動しない。少人数を0件へ補完せず、採用と実投稿、評価処理完了と本人能力を区別する。

main全体は取り込まない。#1254の通常登録による少数テスト変更と#1257の監査文書一式は今回対象外。既存本番の登録方式を変更するreleaseではない。監査文書はmain上の設計根拠として参照し、production上にその文書があると仮定しない。

## 保持・安全条件

- productionとの差分にPrisma schema、SQL Migration、lockfile、CI、Vercel設定、Migration runnerの変更なし。取り込む原本読取/投影コードはmainと一致する。
- production固有のMigration SQL、実行上限、Vercel `--force` build、Git deployment制限と既存Cronを維持する。
- 新DB table/column、設定・secret、外部サービス、AI呼出し、実送信、課金、登録、Pilot開始、モデル変更を追加・実行しない。
- Migrationファイル差分なしは実DBのchecksum/RLS/全writer/backup検証の代わりではない。既存Vercel buildのmigration/schema gateを省略せず、失敗時は公開・再試行を止める。未確認条件をPASSで埋めない。
- 認可は既存サービス管理者resolverと各Adapterの再認可。公開healthだけでは管理者操作、OEM分離、ログ保存、原本の捕捉率や負荷を実証しない。

## 現行本番と検証

GitHub Deployment `7009019403`、上記production SHA、status success、2026-10-12 07:45:57 UTCを確認。[配備先](https://bunshin-platform-8jdydzveu-team478as-projects.vercel.app)。正式ドメイン`www.watashi-works.com`への読取でlive/readyともHTTP 200、readyはconfiguration/authentication/database OK、databaseSchema current。正式aliasの厳密な実行SHAや新版の操作成功をhealthだけで証明したとは扱わない。

release候補の関連unitはApplication 28件・Database 26件・Web 177件成功、境界検査も成功。合成スマートフォンE2Eは既存+追加18件成功、run `01a12fc1-b106-719d-8885-3b6658aa5833`、failed/flaky/skipは0。実Card/CSSと合成APIであり、認証済み本番フローではない。全体型検査の結果はPRにも記録し、全体format/lint/test/build、隔離PostgreSQL統合はrelease PRの最新head CIで別途確認する。開発PRのCI成功をrelease候補のCI成功へ転記しない。

## Merge前・反映後

1. release PRの差分、最新headのverify/database、production基点が変わっていないことを再確認し、人間がproductionへマージする。
2. Vercelの対象SHA、migration → schema gate → Web buildの成功、正式aliasとDeployment Readyを確認する。変更した本番SHAと日時を記録する。
3. live/ready、既存サービスの通常動線、ログイン後の戻り先を確認する。
4. 許可されたサービス管理者が新画面を開き、固定週の明示読取、少人数/欠測の保留、失敗時の消去、他サービスの拒否を確認する。顧客本文を取得・外部送信しない。認証済み本番操作は未実施。
5. 読取ログの保存/保持・処理時間・負荷を確認する。利用データが不足なら未判定のままにする。成功率/原価/学習成果や因果効果はこの画面の判定対象外。

## 切戻し・次の条件

問題時は新画面/API/navをrevertする修正PR、または人間承認で上記rollback基準の既存成功DeploymentへApplicationを戻す。今回新Migrationなし。DBや原本を削除・巻戻ししない。ログや公開後の本人操作をコード切戻しで戻せるとは扱わない。切戻し後もhealth/通常動線を確認する。

今回未実施: 本番Merge/Deploy、設定・Migration変更、AI/LINE実送信、実課金、参加者登録、Pilot開始、認証済み本番E2E、ログ保持/負荷測定。release成功後の次候補は1-C技術ログ相関/本番観測準備。外部AI分析や修正PR生成は別承認。

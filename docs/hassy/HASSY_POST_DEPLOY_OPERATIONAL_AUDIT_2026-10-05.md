# Hassy 本番反映後運用監査 2026-10-05

## 1. 調査した内容

対象はPR #1124を反映したProduction Deployment
`dpl_2JrRCmSnE5x4erBURfmuUxkzj7me`、実行SHA
`87a4261cfff1c91458ac9b6a9e32bebdf95f33c8`である。Deployment作成時刻は
2026-10-04 22:38:27 JST（2026-10-04T13:38:27Z）。監査は
2026-10-05 02:00 JSTまでの約3時間22分を対象にした。

- Vercel Deploymentの状態、正式ドメインのreadiness、Production runtime logを読み取り専用で確認した。
- Decision Context停止分類、reBrief失敗、Photo First品質分類、Generation観測更新失敗を完全一致で検索した。
- Cronの`/api/internal/jobs/schedule`と`/api/internal/jobs/run`は直近各50件のHTTP状態を確認した。
- 投稿本文、写真、解析JSON、確認質問・回答、User ID、Bunshin ID、request IDは取得・記録していない。
- 本番DB集計を試みる前に、Vercelから取得したOIDC用環境ファイルでは`DATABASE_URL`と`DIRECT_URL`が空であることを確認した。Prismaは接続初期化前に停止し、SQLは実行されていない。

## 2. 変更したファイル

- `docs/hassy/HASSY_POST_DEPLOY_OPERATIONAL_AUDIT_2026-10-05.md`

Application、API、UI、DB schema、migration、Cron、Provider設定は変更しない。一時監査スクリプト、Vercel link情報、OIDC環境ファイルは削除済みである。

## 3. 主要な判断

### 確認できた状態

- Deploymentは`Ready`で、正式ドメインの`/api/health/ready`はHTTP 200相当の`ready`を返した。
- readiness内のconfiguration、authentication、databaseは`ok`、databaseSchemaは`current`だった。
- Cronは直近50件ずつ、schedule/runともHTTP 200だった。
- デプロイ直後の手動疎通期間に、schedule/runの401が各3件、合計6件あった。いずれも2026-10-04T13:52Zの`UNAUTHENTICATED`で、その後の直近各50件は200である。過去の401を消去したり、最初から正常だったとは扱わない。

### ログ検索で0件だった分類

- `DECISION_CONTEXT_REVIEW_REQUIRED`
- `DECISION_CONTEXT_BLOCKED`
- `DECISION_REBRIEF_FAILED`
- `PHOTO_FIRST_UNCONFIRMED_FACT`
- `CONTENT_REJECTED`
- `OBSERVATION_UPDATE_FAILED`

これは対象期間のProduction runtime logに該当文字列がなかったという結果である。DBのGeneration記録が0件、該当機能が実行された、または安全条件がPASSEDだったという証拠ではない。

### 確定しない状態

- HassyのDaily Mission生成総数、成功数、停止分類別件数。
- Photo First開始件数、未確認事実検出件数、1回修復後PASS件数、最終不合格件数。
- Prompt Version別の品質傾向。
- 約3時間22分の観測だけによる長期安定性。

未知の安全条件、母集団、品質率を0またはPASSEDへ補完しない。既存のfail-closed動作を維持する。

## 4. 実行した検証

- `git fetch origin --prune`とPR #1125のmerge SHA確認。
- `vercel inspect dpl_2JrRCmSnE5x4erBURfmuUxkzj7me`。
- 正式ドメイン`/api/health/ready`のreadiness確認。
- Vercel Production logをDeployment作成時刻から検索。
- schedule/runの直近各50件をHTTP状態で集計。
- 本番環境変数は値を表示せず、必要な接続変数の長さだけを確認。
- DB接続は空URLのPrisma初期化エラーで停止。SQL実行なし。
- 一時スクリプトと環境ファイルの削除、作業ツリーcleanを確認。

## 5. 未解決事項

- Production runtimeでOIDCにより解決されるDB接続を、ローカル監査へ安全に委譲する既存経路がない。
- 既存`PrismaHassyPhotoQualityImprovementAdapter`はService管理者再認可と集計契約を持つが、HTTP/UI/定期Jobには接続されていない。
- ログだけでは、ログ出力前に永続化されたGeneration分類やPhoto First品質の母集団を完全には復元できない。
- 少数セルの再識別防止、監査期間、閲覧主体を決めずに管理画面や公開APIを追加しない。

## 6. 次へ進める条件

1. まずDeployment後24〜72時間、readiness、Cronの非200、上記エラー分類を継続観測する。
2. 実利用が発生したことを確認できるまで、ログ0件を成功率100%と扱わない。
3. DB集計が必要なら、既存Service運用権限の再認可を使い、集計値だけを返す一時的または内部限定の読取経路を別PRで設計する。本文、写真、回答、個票IDは返さない。
4. 新しいAnalyticsテーブル、管理UI、定期収集、実Provider品質評価、課金APIはこの監査の範囲に含めない。

現時点の判定は「Production基盤とCronは観測範囲で正常、Hassy固有の発生率・品質率はデータ不足で未判定」である。

# マナベルスタイル — 学習設計レビューUIの限定リリース準備

2026-10-10 JST。branch `codex/release-definition-review-admin-ui`。この文書を含むPRのheadをrelease候補SHAとする。

## 固定基準と範囲

- 基準production: `0534b663a103dbb310801dad55325e8092ad429d`（#1210）。
- Source: mainへマージ済みの#1211、merge commit `0ca1e5d5c96c8b2d81edbf679bfbc436b5ab0a78`。
- Source commits: `b2dd9c4d1d60a3ed8fc9a6c48b5f1988c926468e`、`5ab7598cd4fbb45e547b82c4020df17e9e979cd0`。
- Source PR CI: run `38010463854` のverify/databaseが成功。限定release CIの代替にはしない。
- production基点のcherry-pick commits: `5f4bb2c2`、`6538c3df`。

1件ずつ既存Definitionと承認状態を読み、人間が7項目・公開SHA・非公開証跡キー・最終確認を入力して既存APPROVE APIへ送る最小管理画面だけを追加する。画面GETは保存せず、Workspace/Service/actorはサーバーで解決する。詳細は[実装報告](MANABERU_STYLE_DEFINITION_REVIEW_UI_IMPLEMENTATION.md)と[ADR](ADR_LEARNING_DEFINITION_REVIEW_UI.md)を参照。

DB schema、Migration、API、Provider、モデル、価格、Enrollment、Goal/Plan/Router、LINE、Vercel設定、root package/lockfileは変更しない。main全体およびmain固有の別変更は取り込まない。

## 分離結果

#1211の14ファイルをproduction基点へ取り込んだ。13ファイルはsource head `5ab7598c` と完全一致する。Runbookだけがproduction固有の直近記録と競合したため、production内容を維持し、#1211が追加した承認UI節だけを採用した。main側に既に存在した別PR由来の教育方針承認節は取り込んでいない。

認証復帰先は `/s/{serviceSlug}/manage/programs/learning-definition-review` の完全一致bare pathだけを許可する。query、子パス、fragment、percent-encoding別名、外部URLは拒否する。表示判定後も既存の管理権限、DB再認可、停止、CAS、監査を維持する。

## 検証と停止条件

production基点で関連UI/page/認証回帰、スマートフォン幅390×844の合成E2E、format、typecheck、lint、test、buildを確認する。GitHub CIではverifyと隔離PostgreSQLのdatabase jobが両方成功することを確認する。合成テストやCIを実認証・実DB・実スマートフォン・本番APPROVEの証拠にしない。

ローカルでは関連Vitest 5ファイル147件、スマートフォン幅390×844の合成E2E 3ファイル13件、対象format、Web/learning UI typecheck、対象lint、`git diff --check` が成功した。Web buildは日本語を含むWindows checkoutでTurbopackが文字境界エラーになったためwebpackへ切り替え、終了コード0を確認した。page data収集中には共有pnpm配置に起因するWindows向けPrisma query engine探索警告が出たため、Linux上の限定release CIを最終判定とする。

main merge commit `0ca1e5d5` のpost-merge CI run `38011254741` はverify/databaseとも成功した。これは限定release branchのCI成功を代替しない。

PR baseは `production`、Draftで作成する。**productionへのmergeはGit連携deployを開始し得るため、CI成功を本番反映の承認としない。この準備ではmerge / deployしない。**

本番DB接続・書込、Migration、設定変更、Definition管理flag変更、APPROVE登録、参加者登録、Pilot START / STOP、実Provider呼出し、実課金は実施しない。未確認の安全条件をPASSで埋めない。

## 公開前確認とRollback

別途本番反映承認後、production tip・実公開SHA/alias、schema readiness、Pilot停止状態、Definition管理flag既定無効、CI、rollback対象を再確認してからDraft解除・mergeを判断する。基準productionが動いていれば再分離・再検証する。

問題時は管理flagを閉じ、Pilotを開始せず、既知正常な基準production deploymentへApplication rollbackする。本releaseにDB変更はないためDB rollbackは不要。既存承認・監査・Enrollmentを削除しない。

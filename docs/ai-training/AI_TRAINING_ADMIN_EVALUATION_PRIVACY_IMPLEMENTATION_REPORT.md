# AI研修 管理集計の評価自由文除外 実装報告

## 1. 調査

main `2a818ef1`（#998）を基準とする。管理画面は回答本文を取得しない一方、READY回答のevaluation JSON全体を取得し、weaknessesの最初の自由文を参加者別の弱点欄へ表示していた。管理者一覧で個人の評価本文を取得・公開しないPrivacy方針との差分を修正する。

## 2. 変更ファイル

- database/src/training-admin-evaluation-metrics.ts、公開index: DB射影・認可付きの指標取得。
- 管理training/page.tsx、ai-training-admin-dashboard.ts: 評価全文取得とweaknesses表示の除去。
- DB単体・実PostgreSQL統合・Web実Page・Dashboardテスト。
- D-137、ロードマップ、本報告。

## 3. 設計判断

PostgreSQL内でPASS/REVIEWの許可値と既知6技能の0〜100のJSON数値のみを抽出する。文字列、オブジェクト、範囲外スコア、未知キー、不正resultは返さない。自由文をWebで受け取ってから捨てる方式は採らない。SQLは値を全てパラメータ化する。

同一SQLでACTIVEなSERVICE_OWNER/ADMIN、User/Workspace/Group有効状態、Service/Enrollment/AI研修Program、Participant所属と回答Userの一致を再検証する。受講本人・CONTENT_EDITOR・別Scopeからは空結果。DB障害は成功に置き換えない。

個人の復習支援ラベルは既存ProfileのneedsReview/recentFailuresからの固定文言等を使用する。PASS/REVIEW件数・再回答・技能改善の集計と本人の評価閲覧を維持する。

## 4. 検証

DB単体テストは空対象・パラメータ化とScope/Role条件・DB障害伝播を確認。Webテストは実Pageを呼び、指標取得への認証済みScope伝播、通常Answer Queryがstatusだけを取得すること、PASS件数維持、権限なしで取得しないことを確認。Dashboard/Pilot既存テストで固定支援ラベルと集計を確認する。

実PostgreSQL統合テストは評価内に私的文字列と不正スコアを保存し、返却結果に含まれないことを確認する。一般参加者・CONTENT_EDITOR・停止管理者・別Workspace/Group・空対象・PENDING回答の拒否、不正result/配列skillsの安全な扱いを確認する。全体format/typecheck/lint/test/build、Migration・DB integration結果は対象PRのCIに記録する。

## 5. 未解決事項

Schema/Migration変更なし。本番操作、Provider呼出、通知送信、削除の有効化は行わない。現在の研修管理画面全体を匿名集計化する変更ではなく、既存の本人氏名・進捗・課題表示は維持する。個別回答閲覧のSupport権限は追加しない。

## 6. 次へ進める条件

人間レビューと全CI成功後にマージ可能。本番反映と管理者・本人の実アカウント表示確認は別途必要。

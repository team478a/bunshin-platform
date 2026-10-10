# マナベルスタイル 学習設計レビュー・承認登録UI

## 基準と範囲

基準main: `970bf64403fd4565e647ac1ca3abc0f498e8ef81`。
branch: `codex/definition-review-admin-ui`。commit/PRは本報告を含むPRの最終headを参照。
確認済み本番SHA: `0534b663a103dbb310801dad55325e8092ad429d`（#1210）。main/productionは別release系統。本PRのmain mergeを本番公開とせず、production基点への限定releaseは別承認とする。

人間の「3件とも学習設計を承認」は受領済み。本番の7項目確認・版/digest/revision照合・APPROVE登録は未実施。[ADR](ADR_LEARNING_DEFINITION_REVIEW_UI.md)を参照。

## 変更ファイル

- `apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/{page.tsx,card.tsx,client.ts}`
- `apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/page.tsx`（管理者リンクのみ）
- `apps/web/test/learning-definition-review-{ui,page}.test.tsx`
- `scripts/test/learning-ui/{main.tsx,e2e.config.ts,definition-review.e2e.ts}`（既存合成ハーネス）
- 本報告、ADR、Wave 0 Runbook追記

## 操作と認可

画面: `/s/{serviceSlug}/manage/programs/learning-definition-review`。準備ページの管理者リンクから入る。

1. 認証なしは同画面へ復帰するLogin、別Service/非管理者は不存在。未知のDB/認証障害を隠さない。
2. 「現在の定義と承認状態を確認」で既存GETを呼ぶ。mount/ページGETで自動HTTP読取・書込なし。
3. 固定3件から1件を選び、目的・前提・要点・安全・間違い・練習・既存課題と評価/Skill/版/進級条件を確認。
4. 7項目は全て未選択。公開対象の40桁SHA、最大80文字の非公開証跡キー、1件・版の最終確認を本人が入力。
5. 既存 `POST /api/services/{serviceSlug}/ai-training/definition-approvals` にAPPROVEだけを1件送る。Workspace/Service/actorはクライアント入力せずサーバーで解決。既存scope、DB再認可、停止、CAS、UUID冪等性、監査を変更しない。
6. receiptはoperationId/APPROVED/承認日時/actor形式を検証するが現在状態とは断定せず、別GETで承認済みを確認。上書き/撤回操作なし。

対象変更/GETで確認・SHA・証跡をリセット。409/4xxは再取得・再レビュー。通信切断/5xx/不正receiptは結果不明とし、他の操作を閉じ同一bodyだけ明示再送する。raw errorは非表示。ページ離脱後の新UUID再登録は、現状態/監査の照合前に行わない。

## 学習・安全・Privacy

構造/背景は同じPROMPT_BASIC課題・Objectiveを再利用し焦点だけを変える。背景専用教材/評価と称しない。条件も背景を評価する。進級は本人回答/評価の版・Plan一致、PASS、COMPLETED、understanding>=60、評価した全Skill>=60を必要とする。UNKNOWNを合格にせず、Plan完了と実務能力習得/Enrollment終了を区別する。

Definition管理flag既定無効を維持。既存Preparation Accessを再利用しProductionではserver-owned単一authority一致と両実行flag停止が必要。表示判定を通ってもDB停止/認可チェックで拒否できる。flag不足/authority不一致は操作なしの案内だけ。

相談/回答/成果物/Provider response/secretは保存しない。承認者IDを表示projectionから除外。長期Chat、localStorage、新Analyticsなし。V1、LINE、Provider Admission、Pricing、モデル、課金、Enrollment、Goal/Plan/Router変更なし。新API/DB/schema/migrationなし。

## 検証

- 新規UI client/page、承認API、準備Gate/内部準備: 70件成功。
- 既存Pilot HTTP/UI、Admission/Provider worker、参加者、LINE隔離: 90件成功。
- capability-training全体: 465件成功。DB承認command単体: 3件成功。
- 合成mobile e2e（390×844）: 13件成功、failed/flaky/skipped 0。新承認UI3件と既存学習/内部準備10件。7項目未確認拒否、1件登録後GET、対象変更reset、409再レビュー、結果不明の同一body再送を検証。模擬HTTP・合成データだけで、実DB/本番/Provider/agentモデルなし。
- 新UI/pageとService管理者境界の追加回帰: 29件成功（上記新UIテストの再実行を含むため合計へ重複加算しない）。
- architecture check、Web typecheck、learning-ui typecheck、変更WebファイルESLint、learning-ui lint、diff check成功。初回Web型検査は旧checkoutの生成済み型で失敗し、最新mainのPrisma/Next型再生成後に成功。負例テストの意図的な余分fieldは型検査用castを明示して修正。
- Web build / 最終format check成功。最終変更後の新UI/page単体22件も再実行成功。buildはローカルPrisma generate + next buildのみで、migration/deployを実行しない。

実認証・実DB統合の本UI操作、実スマートフォン、本番設定/承認・監査、START/STOP、課金E2Eは未検証/未実施。合成PASSを本番承認完了としない。最終headのCIも確認する。

## 次のGateとrollback

PRレビュー後、最新production基点へこの変更だけを分離しCI/schema互換/公開SHAを確認。本番設定変更・期間限定Definition管理flag・実承認登録は別承認。停止/実権限確認、GET、各7項目/版/SHA/証跡レビュー、1件ずつAPPROVE、GET/監査で保存確認、その後準備flagを閉じる。Pilot開始/費用同意/実E2Eはさらに別Gate。

rollbackは画面/リンクrevertまたは別承認で管理flagを閉じる。承認/監査を削除しない。コードrevertは承認撤回ではなく、撤回が必要なら既存APIの別明示操作。

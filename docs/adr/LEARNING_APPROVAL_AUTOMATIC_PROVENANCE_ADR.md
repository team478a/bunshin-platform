# 学習設計承認の来歴を自動記録する

日付：2026-11-03。対象：管理運用簡素化 PR-2B。状態：実装判断（レビュー待ち）。

## 判断

旧 `ADR_LEARNING_DEFINITION_REVIEW_UI.md` の手動GET、SHA・証跡キー・最終確認チェックの入力、成功後の手動GETを、この画面では置き換える。7項目の内容確認は本人が行い、「この1件の承認を登録」が最終確認になる。ページ表示と確定応答後に現在状態を自動取得する。人間の確認を自動trueにしない。

既存 `VERCEL_GIT_COMMIT_SHA` をサーバーで検証してGETへ付加し、新UIはそれを同じ操作へ固定する。新操作の保存時はサーバーの現在SHAと照合する。値が欠落・不正なら承認不可とし、仮SHAやGitHubの最新mainを代用しない。このSHAは稼働コードの来歴であり、教材内容の同一性は既存reviewDigest、不変版、revisionで別途照合する。SHAだけを本番公開・教育品質の証明にしない。

証跡キーは既存operationIdからサーバー生成し、既存ProgramAuditLogへ自動来歴の区分も保存する。DB schema・tableの追加は不要。旧API入力は従来の人間申告として維持し、自動検証済みと偽らない。新モードへ手動証跡キーを混ぜる入力は拒否する。

冪等性照合は現在SHA照合より先に行う。登録応答を失った後にdeployが変わっても、同一actor/scope/ID/bodyの再送には過去のreceiptを返す。新規操作の旧SHAは拒否する。権限・停止・準備対象の再確認は再送でも維持する。receiptを現在状態として表示せず、GETが失敗した場合は「登録応答あり・現在状態未確認」を明示し、POSTを再実行しない。

## 維持する境界

既存DB再認可、Serializable transaction、revision/digestのCAS、atomicな監査、同一IDの別内容拒否を維持する。学習内容の承認はPilot開始、AI・予算、参加者登録、通知、公開の承認ではない。それらを呼ばず、既存flag・authorityも変更しない。本番設定・migration・deployment・送信は実行しない。

## 検証

新旧API、SHA欠落・不正・変更、監査保存、冪等再送、別scope/actor、競合・失効・監査rollbackを確認する。PC/スマートフォンで入力欄0、初回自動GET、承認POST1回、成功後自動GET、読取失敗と結果不明の分離を確認する。

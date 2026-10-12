# 自由希望の個別研修: 第1分割・現在の計画を維持する

2026-10-12。基準main `ad6fff672ad3e0ecc14e067aa607310a9f744468`、production `4c7928a66586ca77f22b77916a8c3cabf5c8e5f1`。開始時および修正後にremoteを照合。基準mainのverify/database CIは成功。mainとproductionは別系統として扱い、今回Deployはしない。

## 調査と今回の変更

現行`savePlan`は新DRAFTを作るだけでCONFIRMED版をSUPERSEDEDへ変更し、Router・評価前Gate・実践記録も最新行だけを参照していた。学習中のAssignmentとPENDING Answerを残したまま、再訪時の表示や評価認可が止まり得る。

既存のEnrollment lock、Serializable transaction、Goal/Plan/Assignment/Answer、本人・Workspace・Service認可とDefinition承認を再利用する。

- DRAFT保存では既存CONFIRMED版を失効させない。
- `isCurrent`は現在の確定版、未確定しかなければ最新DRAFT。追加の`isLatestProposal`は最新DRAFTだけ。COMPLETED版も未確認の提案に置き換えない。
- Router、評価前Gate、実践記録は同じ確定版選択を使う。所属・受講資格・Pilot停止・人間承認・版照合は削除しない。
- 最新提案を明示確認するtransactionで期待版と未完了Assignmentを再確認し、可能な場合だけ旧CONFIRMEDをSUPERSEDEDにする。
- 旧writerで確定版が既にSUPERSEDEDになっていた場合も、未完了Assignmentを無視して提案を確定しない。その旧状態の自動修復・復活はしない。
- 既存の再送receiptと履歴を維持する。再訪GETからAIや課題Routerを実行しない。

主要ファイルは`packages/application/src/personal-learning-revisions.ts`、`personal-learning-persistence.ts`、Databaseの同名Repository、`personal-learning-router.ts`、`personal-learning-assessment-gate.ts`、`guided-practice.ts`。DB schema、migration、Provider、課金、LINE、教材生成、画面構成は変更しない。

## 検証

専用の使い捨てPostgreSQL16、run `a9d1d8400c289492`、loopback `127.0.0.1:18998`を使用。完全container ID、task label、port、DB名を照合後に既存241 migrationを空DBへ適用。DB名/commentのread-only preflightをfixture書込み前に実施。本番・顧客DB、実ユーザー、AI API、Storage、LINEを使わない。

- Application全138ファイル・944件成功（版選択3件を含む）。
- Personal Learning DB関連86件成功、他106件は選択実行のため未実行。その後DB全192件を実行し成功。
- HTTP/Focusの21件成功。新しい提案を先頭に返す場合も確定版で再訪し、相談・保存・Routerを呼ばないことを確認。
- WebのPersonal Learning関連全20ファイル・202件成功。既存スマホ幅390×844の合成E2E全18件成功（`.e2e/report.json`のselected/executed/passedはいずれも18、failed/flaky/skippedは0）。新しい自由希望・画像・実認証のE2Eではない。
- DRAFT後の実践・PENDING評価認可・同じAssignment/Answerでの再開、未完了中の切替拒否、完了後の明示切替と旧証拠保持を確認。
- 追加の切替/課題提示競合を含むDB全193件の再実行は192件成功・1件失敗。既存Migrationの20秒期限試験で`EXITED`ではなく`DEADLINE_EXCEEDED`となった。新規競合テストは成功。重い型検査等との同時実行の影響が疑われるが、原因を断定せず、単独再確認の結果を追記する。期限やassertionは変更しない。
- その失敗した既存試験を同じ期限・同じassertionで対象単独実行し成功（1件成功、対象外192件）。build処理は同時進行していたため完全な負荷隔離とは扱わない。最後に旧writer状態の否定テストを追加したDB全194件を再実行し、全194件成功（148.28秒）。過去の失敗を隠さず、現行headのCIでも再確認する。
- 全体`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、architecture境界・`git diff --check`成功。lintは無関係な既存`apps/web/app/consent/page.tsx`のunused eslint-disable警告1件を残す（エラー0）。最後の旧writer否定Guard追加後はDBの`tsc --noEmit`と変更2ファイルのeslintも成功。リポジトリ全unit testの`pnpm test`はローカル未実行で、GitHub CIを別途確認する。

初版buildはcompile、TypeScript、静的ページ生成、全13task完了の表示まで確認したが、完了付近の停止入力とともにprocess exit 1が返った。またそのcompile後に旧writer状態の否定Guardを追加したため、最終版のbuild成功とは扱わない。最終版の`pnpm build`を再実行し、全13task成功、exit 0を確認（6分26.69秒）。一時DBと合成Auth設定、build用`APP_ENV=staging`、空のAPIキー・Pilot無効で実行しており、実stagingのAI接続確認ではない。

初回の全体typecheck/lintはDB統合試験との同時実行中に、WindowsのPrisma DLL置換がEPERMで失敗。型エラーの診断ではない。試験終了後に直列で再実行し成功。未完了の検証をPASSとして記録しない。

検証用の合成DBは完了後に完全container IDとtask labelを再照合し、当該containerだけを停止・破棄する。既存アプリ・他container・元checkoutの未解決変更は触らない。再現には新しい一時DBを作成する。

## 未完了・次の作業

これは自由希望機能全体の完成PRではない。現在の3固定Definition経路の安全性を直す前提作業であり、ホームページ等の自由希望が利用可能になったとは報告しない。

次は既存受講資格・通常登録を維持して、本人のProfile初期化、元の希望と環境、サーバー保存の教材候補、同一版の本人確認、動的課題固有の評価へ接続する。続けて途中支援・1枚画像・保持/削除・回答版・次課題・LINE再開・費用制限を接続する。テーマ別コードや個別手動承認待ちは作らない。旧6技能を新テーマへ転用しない。

ホームページ/別の希望、スマホの新画面、画像、実LINE送信、実AI通し確認、AI利用量/実測原価、実受講者の学習効果、人手対応時間は未実装または未検証。既存AI接続の再利用承認後、元checkoutのキー設定と既存のローカル認証・DB再構築手順を特定した。環境準備と403の接続診断は `MANABERU_LOCAL_VERIFICATION_ENVIRONMENT.md` を参照。実生成成功の証拠ではない。キーの作成・表示・転記、本番設定・Migration適用・課金・通知・Pilot開始は実施していない。

切り戻しはこのコード差分を戻す。新schemaやデータ移行はないが、旧挙動ではDRAFTが実行版を止める問題が再発する。既にあるデータを修復・SUPERSEDEDから再承認する処理は含まず、その必要性は別途対象を確認する。

# Feedback人手確認: 非本番ブラウザ検証

## 結論

2026-10-03 Asia/Tokyo。PR #1097のマージを確認し、最新main `126e12772677e041f027329ad774fae402576e0e` を基点に、実際の `FeedbackReviewControl` をChrome・390×844 viewportで操作した。再現可能な9シナリオは成功。ただし終了後も無効ボタンが「同じ内容で再送」と表示されるUX不整合を再現した。安全化完了、本番公開可能、完全なE2Eとは判定しない。

本番ソース・schema・migration・依存・lockfile・CI/CD・設定は変更しない。テスト専用画面、実行シナリオ、この報告書のみ。別サービスへの横展開や実装承認・自動修正は含めない。

## 構成と証明範囲

- Windows / Node24.21.0 / pnpm10.10.0 / Chrome。既存Vitest依存からViteを解決し、追加インストールせずloopback `127.0.0.1:18997` だけで起動。configFile・envDirを無効にし、Nextアプリ/本番資格情報/DB/Providerを起動しない。
- `apps/web/test/browser/feedback-review/main.tsx` は本番のReactコンポーネントをimportし、実useState/useRef・イベント・disabled・選択・チェック・fetch bodyを検証する。本番ロジックをテストへ複製しない。
- fetchはsynthetic endpointへのPOSTだけをfakeで処理し、別の呼出しは例外にしてネットワークへ渡さない。HTML CSPも同Originへ限定。ViteのJS/React moduleとHMRだけはloopbackで取得する。
- fixtureのwrites/state/receiptは合成の応答モデル。writes=1は**実Repositoryの一件性の新しい証拠ではない**。原本削除なしの説明もUI/commandの確認であり、実DB消去試験ではない。
- 409・403は注入応答。現在認可・失効・CASを実DBで発生させていない。実HTTP route、Next/RSC、cookie/認証、DBをつないだE2Eではない。実スマートフォン/Safari/touchは未確認。
- `scenarios.mjs` はCuaの既存Browser Tab Playwright APIへ実クリック・選択・チェックを行い、表示・enabled・fixture台帳へassertionを置く。通常のVitest/CIではブラウザシナリオを自動起動しない。sleep/偶然の並行性には依存せず、保留応答は明示barrierで解放する。

## 今回の実行結果

| ケース                   | 順序・観測                                                                                                  | 判定の範囲                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| normal                   | PREPARE→確認チェック→MARK_REVIEWED。チェック前は確定disabled。2呼出し/fixture1記録                          | UI契約PASS                                       |
| already-reviewed         | 別の実コンポーネントからPREPARE、REVIEWED応答。判断欄なし/操作disabled。累計3呼出し/fixture1記録            | 終端応答のUI処理PASS、実競合未確認               |
| dismiss/OUT_OF_SCOPE     | 選択/確認→DISMISS・OUT_OF_SCOPE                                                                             | 理由/command接続PASS                             |
| dismiss/DUPLICATE_REVIEW | 選択/確認→DISMISS・DUPLICATE_REVIEW                                                                         | 理由/command接続PASS                             |
| lost-prepare             | 最初の準備応答を喪失。判断欄を出さず同じPREPARE bodyを再送。2呼出し/fixture0判断記録                        | UI再送PASS。候補作成Transactionは対象外          |
| lost-final               | fixture保存後にTypeError。成功表示せず選択/チェックをロック。再送bodyは直前と完全一致。3呼出し/fixture1記録 | 同一handle/判断/理由の保持PASS。DB一件性は対象外 |
| conflict409              | 準備→確定へ409注入。成功とせず更新を案内、操作disabled。2呼出し/fixture0記録                                | UI停止PASS、実CAS競合未確認                      |
| denied403                | 準備へ403注入、判断欄なし/操作disabled。1呼出し/fixture0記録                                                | UI停止PASS、実認可未確認                         |
| busy-double-click        | 準備応答を保留してdblclick。1呼出し/操作disabled。barrier解放後もチェック前は確定disabled                   | UI送信重複抑止PASS                               |

初回の自動シナリオはReact描画完了前のstatus検査で失敗した。固定sleepを入れず、期待する表示の `waitFor` を追加した。次の実行は操作Bのheadingとaria-labelを取り違えたlocatorで失敗し、実DOMの `aria-label=操作B` に修正。assertionの削除/skip/期待失敗指定はしていない。最終9ケースは全件成功。

## 発見した不整合と後続の最小タスク

REVIEWED/DISMISSEDの成功後と409/403の停止後にも、buttonはdisabledだが文言が「同じ内容で再送」のまま。通常成功を含む7終端観測すべてで再現。原因は `done` になってもbutton labelが `uncertain` を優先すること。今回は本番コンポーネントを変更しない。

次は**終端状態をボタン文言へ明示し、再送可能/記録済み/更新が必要を区別する最小UI修正PR**。今回のcharacterizationを安全な望ましい仕様として固定せず、修正後は終端文言の期待assertionへ移行する。送信command、operation、CAS、DBを変更しない。失効/別サービス/同時操作のDB統合回帰と実セッションE2Eは別の未確認項目として残す。

## 再実行

リポジトリルート、既存Node24/pnpm10で:

```text
node scripts/test/feedback-review-browser-server.mjs
```

専用ブラウザタブで `http://127.0.0.1:18997/` を開き、viewport 390×844にする。Cua Browser Tabを取得後、cua_replからローカル `scripts/test/feedback-review-browser-scenarios.mjs` をfile URLでimportし、`verifyFeedbackReviewBrowser(tab)` をawaitする（本番タブ/URLでは開始前に拒否）。または画面のケース選択→操作Aの準備→必要な選択とチェック→確定→台帳/状態を観測。lost系は同じ内容で再送、busyは保留応答を返す。

終了後はタブを閉じviewportをresetし、サーバーをCtrl+Cで停止する。今回はすべて実施済み。fixturesはプロセス/ページ内だけで、本番原本や顧客データは一切使用しない。

ローカル証跡（非リポジトリ）:

- `C:/Users/Owner/.codex/visualizations/2026/10/03/feedback-review/results.json`
- `C:/Users/Owner/.codex/visualizations/2026/10/03/feedback-review/lost-final-replayed.png`

画面全体のスクリーンショットはcapture timeoutとなり、通常viewportの取得で保存した。合成handleだけを含む。画面幅の確認は実viewport overrideであり、実端末認証/本番E2Eの代替ではない。

## 回帰とリリース境界

今回のローカル実行: Web既存関連6ファイル78件成功、Web typecheck成功。変更TSXのlint、2つのMJSの `node --check`、変更ファイルformat、architecture check、diff check成功。Web配下のMJSは現行の型付きlint設定と合わなかったため、既存Nodeテストスクリプトと同じ `scripts/test` へ配置し、lint/CI設定は変えない。fixtureのbodyをStringで強制変換するlint違反も、string以外を拒否する型検査へ修正。最終ファイルのbrowser9ケースを再実行して全件成功。最新head全体CIの結果はPRへ記録する。browser9ケースの手動実行結果と、CIの自動テストを混同しない。

関連回帰の実行コマンド:

```text
pnpm --filter web exec vitest run test/improvement-feedback-review-handle.test.ts test/improvement-feedback-review-http.test.ts test/improvement-feedback-review-service.test.ts test/improvement-feedback-review-control.test.tsx test/improvement-feedback-admin-page.test.tsx test/improvement-feedback-admin-preview.test.tsx
pnpm --filter web typecheck
node node_modules/eslint/bin/eslint.js apps/web/test/browser/feedback-review/main.tsx
node --check scripts/test/feedback-review-browser-server.mjs
node --check scripts/test/feedback-review-browser-scenarios.mjs
pnpm architecture:check
git diff --check
```

本番変更・課金・実生成・Storage/LINE送信・merge/deployなし。Feedback maintenanceの旧worker停止/drain/復元gateを維持する。この検証で本番NO-GOを解除しない。切り戻しは追加テスト専用フォルダ/報告書を除くのみで、本番データへの操作は不要。

## 追記: 終端ボタン表示の限定修正

2026-10-03 Asia/Tokyo、PR #1098 merge後main `24ba81648a62857a4b6a14ef58f48f2f710c8d3e` を基準とする。上記は修正前の調査証跡として維持する。

`FeedbackReviewControl` の従来boolean終端フラグを `RECORDED / RELOAD_REQUIRED / null` へ区別し、文言だけを純粋関数 `feedbackReviewButtonLabel` で選択する。成功・既に確認済み/対象外の応答は「記録済み」、400/401/403/404/409の操作停止は「画面更新が必要」。終端表示をbusy/uncertainより優先し、両者ともdisabledのまま。未終端の通信待ちは「確認中…」、応答不明は「同じ内容で再送」、準備済みは「判断を確定」、初期は「確認を始める」を維持する。

送信command/handle/operation保持、fetch、HTTP/API、CAS、Repository、DB、認可、期限、利用枠、原本/履歴を変更しない。成功メッセージの「修正完了・開発承認ではない」説明も維持する。開発承認・自動修正・本番公開へ拡張しない。

既存ブラウザシナリオの終端label観測を期待assertionへ移行した。正常/既に確認済み/却下2理由/応答喪失再送後の5観測は「記録済み」、409/403の2観測は「画面更新が必要」をassertする。確認チェック、disabled、同一body再送、二重クリック等の既存assertionは削除しない。今回Chrome 390×844で9件すべて成功。これは実React/fake応答の回帰であり実認証・実DB E2Eではない。

CI向けの純粋表示テストを9件追加し、既存SSR/関連回帰と合わせてWeb6ファイル87件成功。純粋テストだけでReact stateの接続を保証せず、今回のブラウザ実操作と区別する。型/lint/format/architecture/diffと最新head全体CIの結果はPRへ記録する。

修正後のローカル証跡:

- `C:/Users/Owner/.codex/visualizations/2026/10/03/feedback-review/terminal-label-results.json`
- `C:/Users/Owner/.codex/visualizations/2026/10/03/feedback-review/terminal-recorded.png`

スクリーンショット初回は終端描画前の古いframeを取得したため、証跡として採用せず「記録済み」の可視状態をwaitForした後に取得・保存し直した。固定sleep、skip、assertionの弱体化はしない。テスト用サーバー停止、viewport復元、作成タブclose済み。

残る最小検証は、隔離された非本番の実HTTP/認証/DBをつなぐE2Eの実行条件を確定すること。実セッション失効、他Service/同時更新、実端末/Safariは引き続き未確認。本番停止・drain・復元gateは未解除。切り戻しはUI文言変更のみを戻せるが、再送を示す旧表示が再発する。DB・履歴は操作しない。

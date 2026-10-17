# マナベル PR-D-3 実装報告：本人像の確認とAIへの受け渡し

状態：Draft PR。田中の確認待ち。マージ、本番migration適用、本番反映、`multiTopic`変更は行っていない。

## 1. 調査した内容

- D-1で本人像の保存Repositoryと受講者スコープ（Workspace・Service・Membership・User）が追加済みであること、D-2でテーマごとの希望・実践・相談が分離済みであることを確認した。
- `multiTopic`がOFFのときはD系テーブルにアクセスせず、ONの動的研修だけがD系Repositoryを利用する既存ゲートを維持した。
- 本人像の根拠は最初の希望、相談イベント、実践回答の3種類。リンク先は同じ受講・本人・Workspace・Service内の根拠に限り、根拠が存在しない・範囲外の場合はリンクを出さない。
- 保存済みの本人像について、AIへの受け渡しは本PRから接続する。D-1にはProvider接続がなく、本人用画面/APIとAI接続を同一PR・同一リリースにまとめた。`multiTopic`既定OFFのため、既定状態でAI入力に追加情報は渡らない。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/persona/page.tsx`、`persona-card.tsx`: 本人像の一覧、推測ラベル、根拠リンク、確認・修正・「違う」・削除操作を追加。未確認項目は明確に「AIによる推測」と表示する。
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/personal-learning/persona/route.ts`、`apps/web/src/http/personal-learning-persona.ts`: 認証・同一オリジン検証・入力検証を行う本人用GET/PATCH/DELETE APIを追加。解決した本人のWorkspace/Service/Enrollment/Membership scope以外の項目は操作できない。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`、`learning-request/card.tsx`: 受講画面から本人像画面へ移動できるリンクと、根拠リンクの学習記録内アンカーを追加。
- `packages/database/src/personal-learning-d.ts`: AI向け取得を`CONFIRMED`優先、各状態内で更新が新しい順にし、20件上限を維持。`REJECTED`は取得対象外。
- `apps/web/src/services/personal-learning-lesson-candidate.ts`、`personal-learning-conversation.ts`、`apps/web/src/providers/openai-learning-lesson.ts`、`openai-learning-conversation.ts`、`learning-proposal-policy.ts`: 最初の提案・相談の各呼出し直前にscope付きRepositoryから取得し、確認済み／未確認の区別を含めてAI入力へ渡す。Providerへ渡すデータには記録IDやtenant IDを含めない。
- `packages/database/test/personal-learning-d.integration-cases.ts`: 20件上限、確認済み優先と新しい順、「違う」または削除の直後に行う次回AI向け取得から対象が消えること、他ユーザー・他Service・他Workspace境界を統合テストで確認。
- `apps/web/test/openai-learning-lesson.test.ts`、`openai-learning-conversation.test.ts`、`personal-learning-persona-ui.test.tsx`: AI入力の状態ラベルと画面操作・根拠リンク・削除方針表示を検査。

## 3. 主要な設計判断

- 本人像は同じユーザー・同じWorkspace・同じService（`workspaceId` + `groupId` + `userId`）に限定し、BunshinMemoryや他の受講/Serviceとは共有しない。根拠検索も同じ受講者・受講範囲で照合する。
- 未確認項目も入力候補に含めるが、AIには「未確認の推測」と明示し、本人の現在の発言と矛盾する場合は本人の発言を優先する。本人が確認した項目はその状態を付ける。拒否・削除済みの項目は次の呼出しへ渡さない。
- 各AI呼出しの直前に最大20件を再取得するため、本人の拒否・削除後に作られる次の提案/相談リクエストに変更が反映される。確認済みを先にし、その後は新しい更新日時順、同時刻は根拠日時とIDで決定的に並べる。Admissionのrequest byte上限を超える場合は、優先順位の低い項目からのみ外し、拒否・削除の内容や本人の希望を切り詰めない。
- **削除後の再推測は未決定。** 画面に案A（今の項目だけ削除し、将来の新記録による再推測は許容）と案B（削除属性の抑止記録を残し、本人が許可するまで再推測しない）を並べた。Codex案としてプライバシーと本人の意思を優先する案Bを推奨するが、選択UI・抑止保存・再推測可否の挙動はまだ実装していない。現在の削除は行を完全削除し、直後の次回AI取得から除外する。
- `multiTopic`の既定OFFは変更していない。API/pageとRepositoryの双方が動的研修・有効受講・該当flagを確認する。OFF状態では本人像ページを利用できず、新テーブルを読まない。
- D-3にschema/migration差分はない。本番反映も行っていない。

## 4. 実行した検証

- `pnpm --filter @bunshin/database typecheck`: 成功。
- `pnpm --filter web typecheck`: 成功。
- Web対象テスト（Provider、提案評価セット、本人像UI、request access、byte上限）: 5 files / 28 tests 成功。
- Database D-1境界単体テスト: 1 file / 6 tests 成功。
- `pnpm db:validate`: 成功。
- `pnpm db:migrate:vercel`、`pnpm db:assert-ready`: 使い捨てローカルPostgreSQLで成功。
- `pnpm test:integration`: 使い捨てローカルPostgreSQLで1 file / 240 tests 成功。本人像の拒否・削除の次回取得反映、確認済み優先・新しい順を含む。
- 対象ファイルのESLint: 成功。対象ファイルのPrettier check: 成功。
- GitHub Actions run `39035069979`（修正後のHEAD `2a6fed96`）: `verify` 成功、`database` 成功。`verify`内のformat check / typecheck / lint / 全test / learning-ui / buildが成功し、`database`内のdb:validate / migrate:vercel / assert-ready / integration testが成功。
- 先行run `39034457825` は、既存Provider service testのDB mock未更新とLINE auth return許可リスト漏れで失敗。両方を修正し、該当3ファイル・116 testsを個別に再確認後、上記の修正版runで全CIが成功。
- ローカル統合テストDBは使い捨てPostgreSQLコンテナで、検証後に停止・削除した。本番DBには接続・変更していない。

## 5. 未解決事項

- 削除項目を将来再推測してよいか、案A/Bの最終決定。
- PR #1333はDraftのまま確認待ち。
- 本番migration適用・反映・`multiTopic`変更は行っていない。田中の承認前に実施しない。

## 6. 次Phaseへ進める条件

- 田中が画面、API境界、削除後の再推測案A/Bを確認し、必要な修正または方針を決める。
- Draft PRで`verify`および`database`が成功する。
- 承認後に次のD-4へ進む。本番変更は別途明示承認が必要。

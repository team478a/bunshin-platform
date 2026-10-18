# マナベルスタイル 利用者向け文言・ホーム・最初の入力 改善報告

作成日：2026-10-19  
状態：Draft PR。田中の確認前にマージせず、本番反映・設定変更もしない。

## 1. 調査した内容と文言の変更

対象画面、AI研修の同意版管理、学習カード、LINE学習返信を調査した。変更する表示はManaberu Style（`serviceSlug=manaberu-style`）の`DYNAMIC_V1`経路に限定している。

| 場所                      | 現在の表示・確認した表現                                             | 変更後                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/training`・参加準備待ち | 「研修Enrollment」「あなたのEnrollmentに内部テスター枠」「AI処理」   | 「研修への参加手続きと参加枠」「参加枠が準備できるまで、AIを使った学習は始まりません」                                               |
| 研修プログラム画面        | 「限定Pilot」「限定学習Pilot」                                       | 「先行研修」                                                                                                                         |
| 研修プログラム画面        | 「自由な学習希望を保存（検証中）」                                   | 「学びたいことを伝える」                                                                                                             |
| 学習希望画面              | 「希望を元のまま保存」「未回答の経験や能力は推測しません」などの説明 | 「書いてくれた希望をもとに、あなたに合った小さな練習を一緒に考えます。今進めている練習は、新しい練習を始めるまでそのまま残ります。」 |
| 学習希望画面              | 「前回保存した希望（版 {revision}）」                                | 「前回の希望：…」                                                                                                                    |
| 最初の実践・相談          | 「教材版」「本人確認後」「独力再現」など                             | 利用者向け表示では版番号を隠し、「この練習の内容を確認してください」「あなたが報告してくれた内容です」等に変更                       |
| AIによる相談              | 「達成・合格・独力再現の評価ではありません」                         | 「学習を手伝うための返答です。達成や合格を決めるものではありません。」                                                               |
| 最初の入力                | 端末・ツール・経験・現在位置の項目が常時表示                         | 「実現したいこと」を主欄にし、4項目は「くわしく伝える（任意）」内へ移動。保存済みの値は維持                                          |
| LINE返信                  | AIの返答とホームリンク、Webへの案内を確認                            | 固定返信に開発用語はなく、追加の文言変更は不要と判断。返信処理・AI指示は変更していない                                               |

### AI利用同意の文言について（判断待ち）

`/training`には「この研修Enrollmentでの外部AI利用に同意します」と、同意説明文中の「この研修Enrollmentに対するものです」が残っている。これらを自然な日本語へ変更する場合、現行の同意版`AI_TRAINING_EXTERNAL_AI_V1`と記録済みの同意内容との整合を取る必要がある。

変更後の版を新設すると既存同意が最新ではなくなり、参加者に再同意を求める結果になる。既存同意を維持して表示だけ自然化するか、同意版を上げて再同意を求めるか、田中の判断を待つ。判断前に同意文言・版・記録方法は変更しない。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/home/page.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-navigation-sections.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-overview-sections.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/candidate-card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/practice-card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/conversation-card.tsx`
- `apps/web/app/s/[serviceSlug]/training/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/manaberu-dynamic-ui.test.tsx`
- `apps/web/test/service-home-module-boundary.test.ts`
- `docs/MANABERU_FLOW_COPY_UX_IMPLEMENTATION_REPORT.md`

## 3. 主な設計判断

- ホームの「学習を始められる」判定は既存の`personalLearningPathHref`を使い、新しい認可・準備判定は作らない。
- ホームは準備中には現行の準備表示を保ち、主ボタンを出さない。開始可能だが学習先がまだ解決しない場合は`/training`へ進む一つの主ボタン、開始可能な場合は学習画面へ進む一つの主ボタンにする。受講状況・学習記録・ヘルプは小さいリンクにする。
- Manaberu Styleかつ`DYNAMIC_V1`の場合のみ新しい学習入力・文言を表示する。ほかのServiceと固定経路の画面・動作は従来のまま。
- 入力欄と保存API、会話・候補作成の機能、AIプロンプト、DB、同意の保存方法、保持期間は変更しない。

## 4. 検証

- 描画テスト：ホーム3状態（準備中／開始前／学習可能）で主ボタンの数とリンクを検証。準備中は0、ほかの2状態はそれぞれ1つ。
- 描画テスト：動的経路では任意入力が閉じた`details`内に表示され、保存済み4項目も残り、版番号は表示されない。入力値は従来どおり保存リクエストに含まれる実装を維持。固定経路では従来の開いた入力と表示を維持。
- 会話接続は従来どおりconversation機能フラグに従い、未入力項目を確認する既存の会話経路を変更していない。
- 描画テスト：他Service・固定経路の表示が従来のままであることを検証。
- 対象Vitest：`manaberu-dynamic-ui.test.tsx`、`service-home-module-boundary.test.ts` — 14件成功。
- `pnpm format:check`：成功（変更を含む全リポジトリ）。
- `pnpm typecheck`：成功（25/25 tasks、4分27秒）。
- 変更した画面・テストファイルのESLint：成功。
- CI `verify` / `database`：Draft PR作成後に結果とrun番号を追記する。
- 画面比較：利用者向け画面コンポーネントを`renderToStaticMarkup`で描画して受け入れ条件を検証。別途撮影した本番画面の画像はない。

## 5. 未解決事項

- 同意チェック文言の自然化と、既存同意者への再同意要否。田中の判断を待つ。
- ローカル全体formatの最終結果とCI `verify` / `database`の最終結果。
- 本番環境での画面確認。今回のPRでは本番反映しない。

## 6. 次へ進める条件

1. 同意文の再同意方針を決定する。
2. ローカル検証とCI `verify` / `database`を成功させる。
3. Draft PRと本報告を田中が確認する。

上記を満たしても、この作業ではマージ・本番反映・機能設定変更を自動では行わない。

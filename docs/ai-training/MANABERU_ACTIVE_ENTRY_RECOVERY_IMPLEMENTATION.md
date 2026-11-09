# マナベルスタイル ACTIVE研修入口の復旧

## 1. 調査した内容

2026-11-10 JST、本番Vercelログでマナベルスタイルの対象Program URLに対する最終`404`を確認した。対象は正しい受講URLであり、旧URLやLINEリンク切れではない。

原因は、停止中Program専用の本人Profile準備フラグが本番に残る状況で、参加者ページがProgram状態を確認せず準備処理へ入っていたこと。準備処理はACTIVE Programを安全に拒否するため、結果として404になった。前回の動的許可判定だけでは、ACTIVE Programを停止中専用処理から完全に分離できていなかった。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/src/services/personal-learning-profile-preparation-entry.ts`
- `apps/web/test/personal-learning-profile-preparation-ui.test.tsx`
- `apps/web/test/ai-training-ended-participant.test.tsx`
- 本報告書

## 3. 主要な設計判断

本人Profile準備画面の入口は、環境フラグに加えてProgramが`SUSPENDED`である場合だけ許可する。`ACTIVE` Programは学習方式や許可リストの状態にかかわらず停止中専用処理へ入れず、既存の同意再検証と研修経路へ進める。

判定を純粋関数へ分離し、環境フラグが残っていてもACTIVE Programでは常にfalseになることを直接テストする。Workspace、Service、Membership、Enrollment、Seat、同意の既存scope検証は変更しない。

## 4. 実行した検証

- 関連Vitest 4ファイル・38件成功
- 対象ファイルのESLint成功
- `pnpm --filter web typecheck`成功
- `pnpm --filter web build`成功（静的ページ39/39を含む）
- 本番ログで修正前の対象Program URLが404になる事実を確認

## 5. 未解決事項

本番反映後、LINE内ブラウザの既存利用者セッションで「研修を続ける」から404にならず研修画面へ進むことを実機確認する必要がある。

## 6. 次Phaseへ進める条件

CI成功、productionへのマージ、Vercel本番デプロイ成功、Production Health Smoke成功、LINE実機で対象受講URLの200または正常redirectを確認すること。

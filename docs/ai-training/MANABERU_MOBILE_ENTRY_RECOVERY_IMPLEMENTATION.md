# マナベルスタイル モバイル入口・サービス復帰導線修正

## 1. 調査した内容

- LINE内ブラウザーの参加画面で「研修を続ける」を押すと、サービス配下のProgram画面が404になることを利用者提供の画面で確認した。
- Productionでは準備用の`PERSONAL_LEARNING_PROFILE_PREPARATION`が有効なまま、対象の動的Programが開始済みだった。
- Program入口は準備用フラグを動的Programの実行状態より先に評価し、開始済みProgramを準備画面のaccess gateへ渡していた。準備画面は停止中Program専用のため、安全側に`notFound()`となっていた。
- service segmentに専用not-found境界がなく、404後の「トップへ戻る」と「ログイン画面を開く」が共通`/`と`/login`を指していた。そのため、マナベルスタイルのservice slugと復帰先が失われていた。

利用者の画像、URL中の識別子、認証情報はリポジトリへ保存していない。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/not-found.tsx`
- `apps/web/app/s/[serviceSlug]/service-not-found-card.tsx`
- `apps/web/test/personal-learning-profile-preparation-ui.test.tsx`
- `apps/web/test/service-not-found-ui.test.tsx`
- `scripts/test/learning-ui/e2e.config.ts`
- `scripts/test/learning-ui/main.tsx`
- `scripts/test/learning-ui/service-not-found.e2e.ts`
- `docs/ai-training/MANABERU_MOBILE_ENTRY_RECOVERY_IMPLEMENTATION.md`

## 3. 主要な設計判断

- `DYNAMIC_V1`かつ対象Enrollmentの実行が許可済みの場合、準備用フラグが残っていても準備画面へ入れず、現行の同意再検証後に学習画面へ進める。
- 停止中の準備対象では既存のProfile準備導線を維持する。準備機能を一般化せず、開始済みProgramとの誤った組合せだけを回避する。
- service配下の404はservice slugを保持し、`/s/{serviceSlug}/home`と、同じURLを`returnTo`に持つログイン画面を表示する。グローバル404と他サービスの共通入口は変更しない。
- 404カードを純粋な表示コンポーネントへ分離し、サーバーデータや認証情報なしにモバイルe2eでリンクとレイアウトを検証する。

## 4. 実行した検証

- 関連Vitest: 4ファイル、23件成功。
- 学習UI e2e: 21ファイル、105件成功。追加した390×844 viewportのservice 404テストを含む。
- `web` TypeScript typecheck成功。
- 学習UI TypeScript typecheck成功。
- 変更ファイルのESLint成功。
- Prettierと`git diff --check`成功。

## 5. 未解決事項

- 修正はまだProductionへ反映していない。PRのレビュー、merge、Production deployment確認が必要。
- Productionの準備用フラグは開始前に無効化する運用が正本である。コード修正後も、不要になった準備フラグを次の安全なdeploymentで無効化し、全instanceへの反映を確認する。
- LINE内ブラウザーの実端末確認はProduction反映後に再実施する。

## 6. 次Phaseへ進める条件

- CIのverify / databaseが成功し、変更がProductionへ反映される。
- LINE内ブラウザーで「研修を続ける」から選択中テーマの学習画面へ進める。
- service配下の404で「サービスホームへ戻る」がマナベルスタイルへ戻り、未ログイン時のログイン後も同じservice homeへ復帰する。
- 実端末確認後、画像付きAI助言のrequest byte上限修正を別PRとしてレビューする。

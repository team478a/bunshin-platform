# Daily Mission別案 ワタシポイント交換 実装報告

## 1. 調査した内容

- 版管理されたポイント交換カタログと、予約、確定、解放、返却の既存Use Caseを確認した。
- 画像生成でのポイント予約処理と、別案生成に必要なAI・品質・安全審査・保存の完了境界を確認した。
- 個人画面とService参加者画面で、利用者本人のWorkspace・User範囲から交換カタログを取得できることを確認した。

## 2. 変更したファイル

- `apps/web/src/services/point-funded-mission-content-variant.ts`: 別案生成とポイント予約を連携する処理
- `apps/web/src/http/daily-missions.ts`: 個人向け生成APIの了承価格検証
- `apps/web/src/http/service-daily-missions.ts`: Service向け生成APIの了承価格検証
- 個人・ServiceのDaily Mission画面: 必要WP表示、交換確認、残高画面への動線
- ポイント画面: 指定された本人所属Workspaceの残高表示
- `apps/web/test/point-funded-mission-content-variant.test.ts`: 予約、確定、解放、再試行境界のテスト

## 3. 主要な設計判断

- 30 WPを画面や生成処理へ固定せず、有効な交換カタログの現在価格を正とする。
- 利用者が画面で確認した価格と現在価格が一致した場合だけポイントを予約する。
- 生成開始前に予約し、派生案の保存成功後だけ確定する。生成失敗時は全額解放する。
- 生成保存後に確定だけが失敗した場合は解放せず、再試行で確定できる予約を維持する。
- 交換対象IDへMission IDと生成冪等キーを含め、二重消費と失敗後の再生成競合を防ぐ。
- 残高リンクへ実際に交換するWorkspace IDを含め、複数Workspace所属時も別の残高を表示しない。

## 4. 実行した検証

- 表示価格とカタログ価格の一致検証
- 予約後の生成成功で確定されること
- AI・品質・安全・保存の失敗時に予約が解放されること
- 保存後の確定障害で誤って解放されないこと
- Lint、型検査、全テスト、Production build

## 5. 未解決事項

- 本番Databaseへ既存の別案Migrationが適用された後の実端末確認
- 実アカウントで30 WPの減算、失敗時返却、履歴表示を確認するProduction Gate証跡

## 6. 次Phaseへ進める条件

- 本番で十分な残高と不足残高の両方を確認する。
- 個人・Service画面で了承前に消費されず、成功時だけ30 WP減り、失敗時に元の残高へ戻ることを確認する。

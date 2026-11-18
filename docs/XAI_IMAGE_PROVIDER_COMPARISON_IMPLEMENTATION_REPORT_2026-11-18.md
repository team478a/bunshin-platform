# xAI画像Provider比較・運用管理 実装報告（PR-03）

更新日: 2026-11-18

## 1. 実装した機能

- 美容院、飲食店、EC商品、サービス紹介を各5題材、合計20題材とする版付き合成fixtureを追加した。
- OpenAI / xAIの各観測を、画像品質、日本語文字の読みやすさ、商品・ブランド整合性、人物一貫性、成功率、処理時間、生成単価、再生成率の8項目で集計するApplication Policyを追加した。
- 既存画像管理画面から開けるProvider比較画面を追加した。
- 全業種または業種別5題材へ絞り込み、集計と題材別結果を確認できるようにした。
- 停止状態、接続設定、必要機能、費用上限、品質基準、成功率基準で候補を除外し、品質、成功率、再生成率、費用、時間、Provider keyの固定順で選ぶ決定的ルールを追加した。
- 比較画面では既存AI Provider設定の有効状態、接続確認、model、見込原価を参照し、既存設定画面へ戻れるようにした。
- AIによるProvider判断、自動再生成、無制限な切替は追加していない。

## 2. 再利用した既存機能

- `AiProviderConfiguration` のmodel、見込原価、月額上限、有効状態、接続確認、緊急停止
- 既存 `/admin/images` 画像試験運用画面
- 既存 `/admin/ai` Provider管理画面
- 既存管理画面の `settings-card`、`table-scroll`、notice等の表示部品
- PR-02のOpenAI / xAI Provider用途分離と画像生成Request snapshot

新しいProvider設定画面、監査台帳、予算管理、DBテーブルは追加していない。

## 3. 追加・変更した主なファイル

- `packages/application/src/social-image-provider-comparison.ts`
- `packages/application/test/social-image-provider-comparison.test.ts`
- `packages/application/src/index.ts`
- `apps/web/app/(app)/admin/images/comparison/page.tsx`
- `apps/web/app/(app)/admin/images/page.tsx`
- `apps/web/test/image-provider-comparison-page.test.ts`
- `apps/web/test/browser/image-provider-comparison/*`
- `scripts/test/image-provider-comparison-browser-server.mjs`
- `docs/adr/SOCIAL_IMAGE_PROVIDER_COMPARISON_ADR.md`

共有公開入口 `packages/application/src/index.ts` は、新規Application Policyをpackage exportsから公開するため追加のみで変更した。

## 4. DB・API・管理画面への影響

### DB

DB schema、migration、既存データへの変更はない。合成fixtureを本番観測値として保存しない。

### API

新しいHTTP API、外部API呼出し、副作用のある操作は追加していない。比較画面は管理者だけが閲覧できるread-only画面である。

### 管理画面

- `/admin/images/comparison` を追加した。
- `/admin/images` へ比較画面の入口を追加した。
- model、料金、上限、停止の変更は引き続き `/admin/ai` だけで行う。

## 5. 主要な設計判断

- fixtureは `SOCIAL_IMAGE_PROVIDER_COMPARISON_SYNTHETIC_V1` として版を固定した。
- fixture値は実API結果、実料金、品質保証、本番採用根拠ではないことを画面上部へ明示した。
- Provider選択規則をProvider AdapterやSOCIAL Domainへ入れず、純粋なApplication Policyとした。
- 実測未承認のfixtureをProduction routingへ接続しない。今回の選択結果は管理者向けプレビューだけである。
- RuntimeのAUTO modeは、承認済み実API比較結果を得た後の別変更とする。

詳細は `docs/adr/SOCIAL_IMAGE_PROVIDER_COMPARISON_ADR.md` に記録した。

## 6. テスト実施結果

- 比較Application Unit: 4/4成功
- 比較画面Unit: 4/4成功
- Application全体: 156 files / 1,246 tests成功
- `pnpm typecheck`: 25/25 tasks + Learning UI成功
- `pnpm lint`: 25/25 tasks + Learning UI成功。既存4 warnings、error 0
- `pnpm build`: 13/13 tasks、Next.js production build成功。新規route `/admin/images/comparison` を確認
- `git diff --check`: 成功
- PR CI: `verify`、`database` ともに成功（format / typecheck / lint / test / external-read PoC / Learning UI / build / DB integration / release検証を含む）

全体 `pnpm test` の高負荷並列実行では、既存3ファイルが5秒timeoutした。

- `packages/database/test/apply-release-20261020.test.ts`: 1件
- `apps/web/test/ai-evolution-baseline.test.ts`: 1件
- `apps/web/test/daily-missions.test.ts`: 2件

単独再実行では3 files / 47 testsが全件成功した。変更した比較テストの失敗はない。

`pnpm format:check` は変更外の既存 `.github/workflows/production-line-go-no-go.yml` を警告し、ignoredローカルキャッシュの長時間走査を続けたため中断した。変更ファイルはPrettier適用済みである。

スマートフォン確認用に390px幅の合成ブラウザfixtureと横スクロール境界を追加した。Computer UseはChromeの現在URLを安全に特定できず自動停止したため、実ブラウザでの目視確認は未検証である。

## 7. 本番で利用できる範囲

コード実装済み、Unit / Type / Lint / Build検証済みである。

実API比較済み、本番自動選択済み、本番反映済み、実運用確認済みではない。PRをマージしても、既存PilotのProviderは従来どおり明示設定されたProviderを使用する。

## 8. 未実装・未検証項目

- OpenAI / xAI実APIによる20題材の生成
- 人による実画像評価と評価結果の承認
- 実処理時間、実単価、実成功率、実再生成率の収集
- 承認済み実測値を使ったRuntime AUTO mode
- スマートフォン実ブラウザでの目視確認
- Production設定・DB・デプロイ・実運用確認

## 9. 残るリスク

- 合成fixtureを実品質の証拠と誤認しないこと。画面とADRで明示したが、運用資料でも区別が必要である。
- Provider価格、model、機能対応は変更され得る。実比較開始前に公式仕様と既存Provider設定を再確認する。
- 人物一貫性はモデル機能の保証ではなく評価項目である。実画像による人間評価が必要である。
- ローカルの高負荷並列実行では既存の短いtest timeoutが再現した。単独再実行とPR CIでは成功したが、ローカル実行環境の負荷により再発する可能性がある。

## 10. 次のPR

PR-04でxAI動画生成Providerを既存 `VideoSceneGenerationProviderPort` と非同期Jobへ接続する。公式仕様、外部request ID、状態照会、重複生成防止、URL取得制限、原価管理を実装し、実APIは費用承認まで呼び出さない。

PR URL: https://github.com/team478a/bunshin-platform/pull/1530

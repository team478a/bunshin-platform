# Production OpenAI管理設定限定 実装報告

## 1. 調査した内容

main `67cc66ab`（PR #1222）を基準に、共有OpenAI Runtimeの設定解決と本番read-only監査を確認した。管理Provider設定には接続検証、停止、固定原価、日次・月次予算、当月原価UNKNOWNのGateがある。一方、active設定が存在しない場合の旧`OPENAI_API_KEY` fallbackには共有予算Admissionがなく、productionで管理境界を迂回できる余地が残っていた。

最後に確認済みのproduction環境inventoryでは`OPENAI_API_KEY`／`OPENAI_MODEL`はNOT_SET、DB管理設定経路ありと記録されている。ただし値・全instance反映・現在状態を再確認したものではなく、本変更で安全条件をPASSへ変更しない。

## 2. 変更したファイル

- `apps/web/src/ai/runtime-provider-configuration.ts`
- `apps/web/test/ai-runtime-provider-configuration.test.ts`
- `docs/ENVIRONMENT_CONFIGURATION.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

`APP_ENV=production`では、activeな管理OpenAI設定が見つからない場合に旧環境変数のkeyと固定原価が存在してもfallbackしない。元の`active provider configuration required`を返し、Providerへ到達しない。

development／stagingでは移行互換性のためfallbackを維持し、正の固定原価とtask/model互換性を引き続き必須にする。active設定が存在するが停止中、未検証、予算超過、原価UNKNOWN、model不適合の場合にfallbackしない既存挙動は変えない。

schema、migration、Provider Adapter、鍵、価格、予算、本番設定は変更しない。

## 4. 実行した検証

- OpenAI Runtime関連テスト: 1 file / 17 tests成功
- Web全体テスト: 467 files / 3,274 tests成功、2 files / 2 tests skipped
- Web型検査、変更ファイルlint成功
- 全体lint成功（変更対象外の既存warning 1件）
- 全package build成功（Next.js compile、TypeScript、34 static pages生成を含む）
- 変更ファイルのPrettierと`git diff --check`成功

## 5. 未解決事項

- 共有Providerの同時呼出には原子的な費用予約がなく、並行処理による予算超過余地が残る。
- 管理画面の接続テスト費用、Provider側budget、請求照合、外部通知は別課題。
- productionの現在の設定値、公開deploymentへの反映、全instance状態は今回確認・変更しない。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。production release前にactive管理設定、正しい価格、予算、既存UNKNOWN、停止影響をread-onlyで確認し、releaseと設定変更を別々に承認する。Provider送信、実課金、Pilot STARTも別承認とする。

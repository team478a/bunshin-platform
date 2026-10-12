# Trend Provider原子的費用予約 実装報告

## 1. 調査した内容

main `3c6fbb2c`（PR #1224）を基準に、共有Provider Runtime、AiUsageEvent、週次Trend調査、Personal Learning Pilotの既存Admissionを確認した。共有Runtimeは次回固定原価を予算へ含めるが、判定と送信の間に永続予約がなく、並行する2処理が同じ残予算を通過できた。

OpenAIは複数の実送信境界と複数callを持つため、resolverで一律予約するとread-only確認やキュー投入を誤って費用扱いにする。最初の適用対象は実送信境界が単一の週次Trend調査とし、Grok／Exa／Firecrawlで汎用台帳を実証する。

## 2. 変更したファイル

- Application: Provider Call Admission契約、reserve／settle use case、純粋Gateの共有
- Database: Provider・環境単位lock、実績＋open予約集計、予約／確定Repository、Prisma model、additive migration、単体／実DB競合テスト
- Web: Trend Runtime予約、厳格な利用実績保存、週次Trend送信境界への接続、回帰テスト
- `docs/DECISION_LOG.md`、`docs/IMPLEMENTATION_ROADMAP.md`、`docs/DEPLOYMENT_GUIDE.md`、本報告

## 3. 主要な設計判断

`ai_provider_call_admissions`はProvider設定version、環境、Provider、operation keyのSHA-256 digest、固定予約原価、予約／確定時刻だけを保持する。相談、query、Evidence、Provider response、Workspace/User/Bunshin ID、API keyは保存しない。RLSを有効化しpublic policyは作らない。

予約TransactionはDB時計とProvider・環境単位advisory lockを使用する。UTC日次／月次AiUsageEvent実績に同期間の未確定予約を足し、UNKNOWN、停止、未検証、原価不明、次回原価込み予算超過を同じTransaction内で拒否してから予約を作る。同じoperation digestの再予約も拒否する。

Provider試行後はAiUsageEventをstrictに保存してから、同じProvider lock内で予約を確定する。記録または確定に失敗した場合は予約をopenのまま残す。Providerを試行しなかった既知の失敗は原価0を記録してから確定する。自動TTL、失敗refund、推測復旧は作らない。

今回Trend以外のRuntime resolverは変更しない。OpenAI、Creatomate、FAL、Runwayの原子的予約、Provider側budget、請求照合、外部通知を完了扱いにしない。

## 4. 実行した検証

- Application Provider Runtime関連: 1 file / 14 tests成功
- Database Provider Repository関連: 1 file / 4 tests成功
- Web Runtime Provider関連: 1 file / 19 tests成功
- 隔離PostgreSQL 16へ全235 migrations適用、Database統合: 1 file / 184 tests成功
- 実DBで同じ残予算に対する並行2予約のうち1件だけ成功し、open予約1件を確認
- 全体test: 25 tasks成功（Database 197 files / 955 tests、Web 467 files / 3,278 tests成功、live 2 tests skip）
- 全体lint成功（既存のunused eslint-disable warning 1件、error 0）
- 全体typecheck: 25 tasks成功
- 全体build: 13 tasks成功（Next.js production buildを含む）
- Prisma schema validate、変更対象Prettier check、`git diff --check`成功

隔離DBはrun専用container／DB／commentを確認して使用し、完了後に対象containerだけを停止・自動削除した。本番DB、実Provider、利用者データは使用していない。

## 5. 未解決事項

- OpenAI等の複数送信境界は未接続で、共有Provider全体の競合解消とはしない。
- open予約の復旧操作は未実装。利用実績やProvider終了を確認せず解放してはならない。
- Provider側budget、請求照合、税・為替、外部通知は別課題。
- 本番Migration、RLS role、既存実績／UNKNOWN、active設定、全instance更新は未確認。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。Migrationとコードを同じ限定releaseへ含める場合はTrend停止、全instanceの旧経路停止、migration、release、台帳確認、設定再開を個別に承認・検証する。OpenAI展開は実送信境界ごとのoperation keyと利用実績確定をレビューして別PRで行う。

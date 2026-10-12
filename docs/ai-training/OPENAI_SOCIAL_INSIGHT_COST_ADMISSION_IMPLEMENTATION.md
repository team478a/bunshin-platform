# OpenAI SNSインサイト画像読取 費用予約実装報告

## 1. 調査した内容

main `2139a00d`（PR #1226）を基準に、未接続のOpenAI Runtime呼出元と実送信境界を確認した。SNSインサイト画像読取は、本人が生成するUUIDから安定したoperation keyを構成し、1回のHTTP操作につき単一のResponses API callと一意な利用実績を持つため、第2の限定対象とした。

既存経路はRuntime解決と利用実績記録を行うが、予算の原子的予約はなく、実績保存もbest-effortだった。PR #1225のProvider Admission台帳とPR #1226のOpenAI予約付きRuntime解決を再利用する。

## 2. 変更したファイル

- `apps/web/src/http/service-social-insights.ts`: 送信前予約、厳格な利用実績保存、予約確定
- `apps/web/test/service-social-insights-http.test.ts`: scope、原価、確定順序、失敗時fail-closed、legacy fallback回帰
- `docs/DECISION_LOG.md`、`docs/IMPLEMENTATION_ROADMAP.md`、本報告

## 3. 主要な設計判断

本人認証、同一Serviceの参加同意、Bunshin所有、機能有効化、画像Data URL形式とサイズを確認した後にだけ予約する。operation keyは既存利用実績と同じ`social-insight:<idempotencyKey>`を使用し、予約台帳へ画像内容やscope識別子を保存しない。

Provider adapterの`extract`呼出直前をProvider試行開始とする。試行後は成功・失敗とも管理設定の固定リクエスト原価を記録する。Admissionがある場合は利用実績をstrictに保存してから予約を確定し、保存または確定が失敗した場合はopen予約を残す。非本番legacy fallbackは従来どおり予約なし・best-effort記録とする。

## 4. 実行した検証

- Service SNSインサイトHTTP test: 29 tests成功
- 全体test: 25 / 25 tasks成功（Web: 467 files成功、2 files skip、3,289 tests成功、2 tests skip）
- 全体lint: 25 / 25 tasks成功（既存warning 1件、error 0件）
- 全体typecheck: 25 / 25 tasks成功
- 全体build: 13 / 13 tasks成功
- 変更対象のPrettier確認、`git diff --check`成功

実Provider、本番DB、利用者データは使用していない。

## 5. 未解決事項

- OpenAIの他の文章生成、画像生成、音声、研修評価は未接続。
- SNS画像読取モデルの互換性allowlistは未整備で、既存挙動を変更していない。
- open予約の復旧、Provider請求照合、外部通知は未実装。
- 本番Migration適用、既存UNKNOWN、active設定、価格、予算、RLS roleは未確認。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。次のOpenAI経路は、単一送信境界、安定したoperation key、Provider試行判定、成功・失敗の一意な利用実績を確認できるものを別PRで追加する。本番release、設定変更、Provider送信、実課金は個別承認とする。

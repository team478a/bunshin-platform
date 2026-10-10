# OpenAI週次投稿計画 費用予約実装報告

## 1. 調査した内容

main `50f0a01a`（PR #1225）を基準に、OpenAI Runtimeの呼出元と実送信境界を確認した。OpenAIは文章、画像、音声を含む多数の経路と複数callを持つため、一括接続せず、安定したoperation keyと単一Responses API callを持つ週次投稿計画を最初の対象とした。

週次投稿計画は既存の利用実績に固定原価がなく、原価UNKNOWNを新規発生させる経路でもあった。既存のProvider Admission台帳を再利用し、予算競合とUNKNOWN発生を同じ小さな変更で止める。

## 2. 変更したファイル

- `apps/web/src/ai/runtime-provider-configuration.ts`: OpenAI予約付きRuntime解決、非本番legacy fallback、予約後のローカル失敗時確定
- `apps/web/src/services/weekly-plan-generation.ts`: 週次計画の送信直前予約、厳格な利用実績保存、予約確定
- 関連Web test、`docs/DECISION_LOG.md`、`docs/IMPLEMENTATION_ROADMAP.md`、本報告

## 3. 主要な設計判断

Capability、既存計画、Pillar、Profile、承認済みStrategy、Timezone、Bunshin、Knowledge、Campaign、直近実績を確認した後にだけ予約する。組織quota内の生成callbackへ入った時点をProvider試行とし、quota拒否は0円の失敗実績を保存して予約を確定する。

Provider試行後は成功・失敗とも管理設定の固定リクエスト原価を記録する。Admissionがある場合は利用実績をstrictに保存してから予約を確定し、保存または確定が失敗した場合はopen予約を残す。非本番legacy fallbackは従来どおりbest-effort記録とし、productionでは使用しない。

予約対象が見つからなかった後に管理設定を再検索しない。これにより設定切替競合で予約なしの管理設定を返す経路を作らない。予約後のmodel互換性確認・秘密値復号に失敗した場合はProvider未使用として予約を確定する。

## 4. 実行した検証

- OpenAI Runtime、週次計画、Goal伝播関連: 3 files / 46 tests成功
- 全体test: 25 / 25 tasks成功（Web: 467 files成功、2 files skip、3,286 tests成功、2 tests skip）
- 全体lint: 25 / 25 tasks成功（既存warning 1件、error 0件）
- 全体typecheck: 25 / 25 tasks成功
- 全体build: 13 / 13 tasks成功
- 変更対象のPrettier確認、`git diff --check`成功

実Provider、本番DB、利用者データは使用していない。

## 5. 未解決事項

- OpenAIの他の文章生成、画像、音声、研修評価は未接続。
- 1回の業務処理から複数Provider callを行う経路は、callごとのoperation keyと原価を別途設計する必要がある。
- open予約の復旧、Provider請求照合、外部通知は未実装。
- 本番Migration適用、既存UNKNOWN、active設定、価格、予算、RLS roleは未確認。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。次のOpenAI経路は、単一送信境界、安定したoperation key、Provider試行判定、成功・失敗の一意な利用実績を確認できるものを別PRで追加する。本番release、設定変更、Provider送信、実課金は個別承認とする。

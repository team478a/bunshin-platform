# Feedback候補の管理者確認・却下 UI

2026-10-03 Asia/Tokyo。基準main: `058ccc16edd80d21c95a891f7e698ba776473362`。
ブランチ: `codex/improvement-feedback-review-ui`。Windows / Node24.21.0 / pnpm10.10.0。

## 結論と境界

既存Service管理画面から、人手確認候補を「確認済み」「対象外」「確認重複」と記録する二段階導線を追加する。既存Repository、Review Use Case、CAS・操作監査、保持/削除/失効を再利用し、schema・migration・依存・CI・本番設定は変更しない。開発承認、Issue化、Codex指示案、自動修正、STALE再開は含めない。

## 接続

1. GETは現行OWNER/ADMIN・SOCIALの開示条件で週集計だけ読む。完了JST週12窓・読取1000件・全bucket5人以上・完全性・版を維持し、候補を作成しない。
2. 要確認bucketにAES-256-GCMの短期selection handleを付ける。SESSION_SECRETから用途分離した鍵、ランダムIV、認証タグを使用。actor/Workspace/Service/environment/週/根拠Revisionを暗号化し、個票や本文を含めない。平文hash/内部IDをHTML・Client props・API応答へ渡さない。handleはURLやログへ置かない。
3. 「確認を始める」の同Origin・認証済みPOSTで既存`createCandidate`を呼ぶ。DBで管理者・現在Evidence・少数セル・期限を再確認。現在根拠と表示根拠が違えば確定せず409。候補作成と最終判断は別Transactionなので、作成後409/応答喪失なら未判断のOPEN候補が残り得る。確認成功とは扱わない。
4. OPENだけ固定candidate revision・サーバー発行operation UUIDを持つaction handleを返す。元表示から10分の期限を延長しない。既にREVIEWED/DISMISSEDなら状態のみ返し再判断しない。
5. 利用者が理由を選び確認チェックを入れてPOST。`ReviewImprovementFeedbackCandidate`→実Repository Transactionで現在権限・Evidence・期限・CAS・監査を検証。クライアントからID/hash/権限/scopeを受け取らない。
6. 通信/5xx/応答不正は成功とせず、同command/action handleを保持して判断をロック。再送は同operation UUIDで、同内容は既存receipt、異内容/失効/他scopeは拒否。期限切れ・409等は再読取を案内し無条件に別判断しない。画面更新後は再準備で現状確認する。

API: `POST /api/services/[serviceSlug]/improvement-feedback/review`。strict JSON、4096 byte上限、同Origin、認証、Service管理権限、private/no-store、汎用エラー。未知action・理由・余剰scope入力・GET書込は不可。最終確認は人手記録であり原本消去や解決完了ではない。

既存UIの表示条件を満たさない、不完全・小母数・判定保留のbucketには操作を出さない。サービス名を共通基盤へ直書きせず、各ServiceのSOCIAL範囲で利用する。Platform Adminの横断特権は付与しない。

## 検証

対象コマンド（外部通信なし、ダミー鍵/架空データのみ）:

```text
pnpm --filter web exec vitest run test/improvement-feedback-review-handle.test.ts test/improvement-feedback-review-http.test.ts test/improvement-feedback-review-service.test.ts test/improvement-feedback-review-control.test.tsx test/improvement-feedback-admin-page.test.tsx test/improvement-feedback-admin-preview.test.tsx
pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-triage.test.ts test/improvement-feedback-review-evidence.test.ts
pnpm --filter web typecheck
pnpm architecture:check
git diff --check
```

handle暗号化/改ざん/別鍵/期限、HTTP認可/Origin/サイズ/strict入力/エラー非露出、server compositionのscope・根拠固定・同operation再送、SSR初期表示と既存集計回帰を検証。compositionのUse Case spyは入力接続試験であり、DB監査一件性の証明ではない。既存ApplicationテストとCI隔離PostgreSQL統合試験を区別する。

初回回帰はAPI endpointの存在をSSR HTMLで検査する新assertionで1件失敗。endpointはClient propsでありHTML属性ではない。実React treeのprops検査へ変更し、原本情報のHTML非露出assertionは維持。React要素の直接JSON化も循環参照で失敗し、型付きtree走査へ修正。skipしない。最終実行結果とCI URLはPRへ記録する。

ローカル最終結果: Web 6ファイル78件、Application 2ファイル80件、計158件成功。Web型チェック、変更TS/TSXのlint、整形検査、architecture check、git diff --checkも成功。全体format/typecheck/lint/test/buildと隔離DB統合試験は最新PR headの通常CIで確認し、過去mainの成功を流用しない。ローカル実DB・全体build・ブラウザクリックE2Eは未実行。ViteのconfigLoader将来互換warningは残る。

## 公開条件・切り戻し・残り

本番は未公開8 migrationとFeedback maintenance非互換移行を含む。[Release Runbook](IMPROVEMENT_MAINTENANCE_RELEASE_RUNBOOK.md)の停止・drain・preflight・復元gateを省略しない。merge/CI成功は本番GOではない。本番DB・資格情報・Storage・Provider・実生成・LINE・merge・deployは本作業では使用しない。

切り戻しは新POST route・review control・handle発行を外し、読み取り専用集計へ戻す。候補・監査を削除せず、保持/失効trigger・purgeを維持。鍵ローテーションでは旧handleが拒否され再読取が必要。

未確認: 実スマートフォンでの確定/応答喪失/RSC・Network検査、実セッション失効、実Supabaseロール、本番負荷・旧URL到達制御。SSRはクリックE2Eではない。候補操作はOPENの一回だけで、原本変化によるSTALEの再審査は別設計。

次の最小タスクは、非本番合成データで二段階操作・競合・応答喪失のスマートフォン通し検証。実装承認や自動開発へ拡張する前に、人手確認フローを検証する。

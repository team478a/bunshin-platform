# OpenAI会員商品投稿案 費用予約実装報告

## 1. 調査した内容

main `d7e61c79`（PR #1227）を基準に、未接続のOpenAI Runtime呼出元を再確認した。研修評価はPersonal Learning専用AdmissionとProvider費用予約が重なるため対象外とし、単一Provider call、既存operation key、一意な利用実績を持つ会員の商品投稿案生成を第3経路とした。

既存処理はOpenAI Runtimeを業務Preconditionと並列解決していたため、承認済みリンクや公式商品情報の不足でも設定解決を行っていた。全Precondition後へ移動し、PR #1225のProvider Admission台帳とPR #1226の予約付きRuntime解決を再利用する。

## 2. 変更したファイル

- `apps/web/src/http/member-product-suggestions.ts`: Precondition後の予約、Provider試行判定、厳格な利用実績保存、予約確定
- `apps/web/test/member-product-http.test.ts`: scope、原価、quota拒否、確定順序、fail-closed、legacy fallback回帰
- `apps/web/test/member-product-content-ui.test.ts`: Runtime予約境界の回帰確認
- `docs/DECISION_LOG.md`、`docs/IMPLEMENTATION_ROADMAP.md`、本報告

## 3. 主要な設計判断

本人認証、Service参加、Bunshin所有、商品Profile、承認済み外部リンク、公式商品情報を確認した後にだけ予約する。operation keyは既存の`<requestId>:member-product-suggestions`を予約・組織quota・利用実績・Activityで共通利用する。

組織quotaが生成callbackを実行する直前をProvider試行開始とする。quota拒否は0円、Provider試行後または投稿案のローカル安全検査失敗は固定リクエスト原価を記録する。Admission利用時は利用実績をstrictに保存してから予約を確定し、保存または確定が失敗した場合はopen予約を残す。非本番legacy fallbackは予約なし・best-effort記録を維持する。

## 4. 実行した検証

- Member Product HTTP / content UI test: 2 files、92 tests成功
- 全体test: 25/25 tasks成功、Web 467 files成功・2 files skip、3,291 tests成功・2 tests skip
- 全体lint: 25/25 tasks成功。既存の`apps/web/app/consent/page.tsx`にunused eslint-disable warning 1件、error 0
- 全体typecheck: 25/25 tasks成功、Learning UI typecheck成功
- 全体build: 13/13 tasks成功、Next.js production build成功
- Prettier check、`git diff --check`成功

全体testの初回はcontent UIの旧Runtime resolver文字列期待を新しい予約APIへ更新した。再実行では負荷時にDaily Mission test 2件が5秒timeoutとなったが、同ファイル単独10/10成功、全体再々実行も成功し、再現しなかった。

実Provider、本番DB、利用者データは使用していない。

## 5. 未解決事項

- OpenAIの他の文章生成、画像生成、音声、研修評価は未接続。
- 研修評価はPersonal Learning専用Admissionとの二重予約を避ける統合設計が必要。
- open予約の復旧、Provider請求照合、外部通知は未実装。
- 本番Migration適用、既存UNKNOWN、active設定、価格、予算、RLS roleは未確認。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。次は残る単一call経路を同じ条件で別PRにするか、研修評価の二重Admission統合を先に設計する。本番release、設定変更、Provider送信、実課金は個別承認とする。

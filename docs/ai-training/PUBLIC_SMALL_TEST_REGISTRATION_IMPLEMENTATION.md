# ハッシー・マナベル 通常登録による少数テスト実装報告

更新日: 2026-10-12
対象: `codex/public-small-test-registration`

## 1. 調査した内容

- ハッシーを含む共通サービス登録には、既に`PUBLIC`、法務同意、Email/LINE認証、参加者上限の仕組みがある。
- 既存のマナベルPersonal Learning Pilotは、内部準備を目的に無料・招待・管理者手動EnrollmentとSeat付与を前提としていた。
- 一方、共通Program販売には、通常のサービス参加者が有料Offeringを選び、Stripe確認後に期限付きACTIVE Enrollmentを作る経路が既にある。

このため、新しい招待機能や専用の利用者登録画面は作らず、既存の通常登録と有料Program購入をPersonal Learning Pilotへ安全に接続した。

## 2. 変更内容

### ハッシー

コード変更は不要。既存の公開登録を使用する。少数テスト時は本番運用操作として次を設定・確認する。

- Service registration: `PUBLIC`
- invite code: 無効
- `includedMemberLimit`: 承認した少数上限
- 公開期間、法務文書、認証経路、停止手順

### マナベルスタイル

通常の有料申込を次の流れへ接続した。

1. 利用者が`PUBLIC`サービスへ通常登録する。
2. 利用者が有料ProgramのCheckoutを開く。
3. Checkout前に、Service公開・公開期間、公開登録、招待コード無効、サービス人数上限、Pilotの現在Wave上限を検証する。
4. Programをロックし、作成済みSeatと未終了Checkoutを合計して、決済画面を開く前に枠を予約する。
5. Stripeの決済完了を検証してACTIVE Enrollmentを作成する。
6. 同じSerializable transaction内で、本人の`EXTERNAL` Pilot Seatを作成し、Programの実行allowlistへ反映する。
7. Program監査ログへ購入ID、Enrollment ID、Wave、revisionを記録する。相談本文・成果物・決済情報は記録しない。

招待、手動Enrollment、無料Offeringは外部少数テストの登録経路に使用しない。内部Wave 0の安全確認機能は削除していない。

## 3. 安全条件

- Personal Learning専用Program以外の購入にはSeat処理を行わない。
- Pilotが停止中、不正設定、Wave 0、通知隔離不成立なら通常申込を開始しない。
- Serviceの`includedMemberLimit`が未設定、0、または現在Wave上限を超える場合は決済画面を開かない。
- Checkout作成はProgram lock下で直列化し、作成中・Webhookで終了確認されていないCheckoutも枠として数える。Stripe開始失敗は既存どおりPurchaseをFAILEDにし、`checkout.session.expired`でEXPIREDになった後だけ予約を解放する。時刻だけで解放せず、遅延した決済完了との競合を避ける。
- Seat作成時はProgramをロックし、Workspace / Service / Program / Membership / User / Enrollmentを再検証する。
- Seatとallowlistが一致しない場合は自動補完せず停止する。
- 取消済みSeatは自動再利用せず、累計外部枠も戻さない。
- 既存の100人絶対上限と5・20・50・100人の段階上限を維持する。

## 4. 変更ファイル

- `packages/capability-training/src/personal-learning-pilot.ts`
- `packages/database/src/personal-learning-public-registration.ts`
- `apps/web/src/payments/program-purchase-context.ts`
- `apps/web/src/payments/program-purchase-completion.ts`
- 関連export、単体テスト、`docs/DECISION_LOG.md`

DB schemaとMigrationの変更はない。

## 5. 検証

- Pilotの通常登録可能人数をWaveから算出し、停止・通知非隔離を拒否する単体テスト
- 公開登録・招待コード無効・人数上限内だけCheckoutを許すWebテスト
- 有料EnrollmentをEXTERNAL Seatとallowlistへ同期するdatabaseテスト
- Seat projection不一致を自動修復せず拒否するdatabaseテスト
- 既存の直接購入・決済完了テスト
- database / Web TypeScript型検査

本番DB、Stripe、Provider、LINEを使用したテストは実施していない。

## 6. 未解決事項と次へ進む条件

本番利用前に、次を人間が実値で確認し、操作ごとに承認する。

1. 対象ServiceとProgramが正しいこと。
2. マナベルの販売価格、期間、返金・表示文書が承認済みであること。
3. Serviceを`PUBLIC`、招待コード無効にし、人数上限を最初のWave以下へ設定すること。
4. Payment設定とWebhook、停止・返金手順を確認すること。
5. 内部端末で通常登録から学習開始までを1件完走し、その後だけ外部少数募集を開始すること。

本PRのマージは、本番設定変更、Deploy、実登録、実課金、Pilot開始の承認を意味しない。

# マナベルスタイル Learning First 支援mode境界修正

- 作業日: 2026-10-07
- 基準main: `c3e1964509eab1453a6946a9fded9004a0be65a4`
- branch: `codex/training-learning-first-mode-boundary`
- commit: この報告書を含むPRのhead SHAを参照（自己参照SHAは埋め込まない）。
- 対象: AI Training V1の新規選択境界。Production操作は行わない。

## 調査結果と判断

Learning First V2では、成果物を作る主体は受講者本人であり、Platformは教える・質問する・ヒントを出す・評価する役割を持つ。
一方、旧30日V1の公開定義、管理画面、参加登録、支援方針・希望設定、商品設定には `READY_TO_USE` が残っていた。
これを成果物制作の実行経路と断定する根拠は確認していないが、新しいAI研修で完成品提供を選べる表示・入力契約は方針と矛盾する。

公開済みV1定義は採用処理とPilot INITIALIZEの完全一致検証に使われる。
`createAiTrainingV1Definition()` の配列を削除すると既存公開版との互換性を壊すため、定義・保存履歴は維持し、新規操作の許可を `GUIDED` のみに制限する。
これは旧定義の `READY_TO_USE` を新規利用する許可ではない。将来の版更新・旧契約移行は別判断とする。

## 変更範囲

| 境界                 | 対応                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| 公式AI研修作成       | 入力はGUIDEDのみ。公開定義の構造は維持                                          |
| 公開テンプレート採用 | 完全一致したサーバー正本を維持し、選択modeはGUIDEDのみ                          |
| 新規無料参加登録     | サーバー解決したProgram設定からAI研修を判定し、旧OfferingでもREADY_TO_USEを拒否 |
| 支援方針・本人希望   | allowed/default/preferredの新規設定をGUIDEDのみに制限                           |
| 商品設定             | AI研修の新商品・条件更新でGUIDEDのみ許可                                        |
| 新規Checkout         | 旧完成品Offeringも購入作成・復号・Stripe呼出しより前に拒否                      |
| 管理・受講者UI       | AI研修だけ完成品modeを選択肢から除外。旧完成品商品は新規購入一覧から除外        |

純粋なWeb Application helper `apps/web/src/services/training-support-mode.ts` へ新規選択Ruleを集約した。
Runtimeの教え方・評価処理を変更する機能ではないため、Coreや新Packageへ移動していない。
既存Programの判定はサーバー正本の `moduleKey: AI_TRAINING_V1` を利用する。
公開テンプレートのUIはMission capabilityから表示を絞り、実認可は既存の完全一致検証と新しいAPI Ruleで行う。

## 互換性と非変更事項

- 既存Enrollment、Preference、Offering、決済済み購入、公開定義を更新・削除・Backfillしない。
- 決済済み購入の履行処理は変更しない。旧契約の扱いは別途人間レビューが必要。
- Shared enum、SOCIAL等の他Programの `READY_TO_USE` は維持する。
- 30日V1 Runtime、Personal Learning Goal/Plan/Router、Pilot Gate、Provider認可、LINE隔離は変更しない。
- DB/schema/migration、Provider、秘密情報、Production設定は変更しない。
- 新規商品設定・Checkoutの境界変更を除き、課金方式・価格・決済処理を変更しない。実課金を行わない。

## 検証

- 新規作成・採用・登録・方針/希望・Checkoutの拒否、他Program互換、UI表示、Pilot Operations/API、LINE隔離、既存直接購入の回帰を検証。
- 対象10 test file / 122 test成功。
- architecture check成功、architecture test 10件成功。
- Web全体test: 455 file成功、2 file skip / 2,999 test成功、2 test skip。
- typecheck成功。最終編集後の再確認・lint・buildの結果はPR本文に記載する。
- `git diff --check` 成功。
- 実ブラウザ・Production操作は実施していない。UI検証はSSR/unit testであり、本番表示確認とは区別する。

## 残課題・次へ進む条件

1. 人間によるPRレビューとCI成功後にMergeを判断する。
2. Production Deployは今回の完了条件ではない。本番での変更反映確認は別承認後。
3. 既存の完成品mode保存契約は残る。移行・補償・履歴表示の判断を本PRで勝手に行わない。
4. Pilot Program準備、Definition承認、参加者登録、Pilot enable、実Provider利用は別のRunbook Gateと承認を必要とする。

## Rollback

本PRのApplication変更をrevertし、必要なら承認済み手順で前Application版へ戻す。
DB変更・データ変換はないためDB rollbackは不要。
revertすると旧新規選択境界が戻るため、完成品modeを再び選べる点は人間が判断する。

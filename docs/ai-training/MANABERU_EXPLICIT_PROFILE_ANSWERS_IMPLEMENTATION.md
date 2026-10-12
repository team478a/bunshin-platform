# 個別研修の前提修正: 新規受講者の未回答を推測しない

2026-10-12。基準main `52c34e8097aab75ee151b6bfef3a758d00818ad5`、PR #1261のMERGEDを確認して専用ブランチへ追従。productionは別系統で、今回リリースしない。

## 調査と再利用

通常受講者向けのProfile登録は、既存の `saveAiTrainingProfileResponse` → `PrismaTrainingParticipantProfileRepository.save` に存在する。本人のACTIVE Membership・有効なEnrollment・ACTIVE AI_TRAINING_V1 Programを確認する経路を再利用し、別の登録API/利用者DBを追加しない。Pilot準備専用Profile経路は変更しない。

既存の通常画面 `AiTrainingCard` はProfileが未作成でも、職種OTHER、経験BEGINNER、利用実績NOT_YET、端末BOTH、学習時間10分、目標USE_AI_IN_DAILY_WORKを初期選択していた。利用者が回答せず進んでも、未確認の経験・利用環境・希望が本人の回答として扱われ得た。

## 実装

- 新規Profileの各選択は空のUI状態から開始する。未回答を初心者や両端末へ置き換えず、既存Profileがあれば保存済み回答を復元する。
- 段階移動と最終保存に同じ検証を利用する。職種/経験、仕事の説明/端末、AI利用実績/困りごと、テーマ、目標/時間を本人に確認する。
- 職種不明の時点で職種別おすすめを表示しない。仕事の説明の最小長も既存APIに合わせる。
- 空の状態は画面だけで保持し、DBのenumへUNKNOWN等を追加しない。保存APIのvalidation、本人認可、所有境界、受講期間・停止条件、OEM・課金経路は変更しない。

主要ファイルは `ai-training-card.tsx`、`ai-training-setup-card.tsx`、`ai-training-setup-validation.ts`。Decision Logに判断を追加した。

## 検証記録

- Webの新規テスト12件と既存participant UIテスト3件、計15件成功。新規Profileの未選択、既存回答の復元、未回答の保存拒否、明示NOT_YETと未回答の区別、説明の最小長を確認。
- 新しい合成E2E2件成功。390×844で段階移動・端末の明示確認・利用実績の未選択・目標/時間の未回答拒否・送信JSONの本人回答を確認。保存応答は明示503の合成であり、実DB保存成功、実認証、実AI、実端末の受入証拠ではない。
- 初回CLI呼出はconfig未指定でCONFIG_NOT_FOUNDとなり、テスト未実行。config明示後の初回2件はテスト側の `getByRole` 引数指定ミスで失敗。正しい名前パターンに修正し、同じ2件・同じ期待値で再実行して成功。assertion削除/skipで合格させていない。
- 既存分を含む合成E2E全5ファイル20件成功。report.jsonのselected/executed/passedは20、failed/interrupted/flaky/skippedは0、exit 0。
- Web全体の `tsc --noEmit`、変更したWebコード/テストのeslint、全体 `pnpm format:check`、architecture境界検査、`git diff --check`成功。全体のunit/DB統合試験は今回ローカルで再実行していない。
- `pnpm build` はexit 0、13task成功（12cached）、4分17.989秒。合成ローカルDB・合成Auth設定・空のAPIキー・Pilot無効で実行。build用APP_ENV=stagingは実staging配備やAI接続の証拠ではない。
- 実装commit `87e5f5c6c3a38c481b16f62b320c703279b821e5` のPR #1262 database CI成功を確認。verifyは確認時点で進行中。後続の文書更新headのCI成功と混同しない。

E2Eスキルに従い既存の合成UI harnessへ追加し、画面の操作後に未選択状態と送信内容を検査した。AIによるテスト操作や外部モデルへの送信は行わない。

## 未完了と次の作業

これは自由希望研修の完成ではない。通常の登録後、既存固定テーマでProfileを自分で作成する経路の安全性修正である。通常登録の本番設定は変更せず、新しい招待制も導入しない。

自由希望を固定目標に置き換えず正式保存する動的経路、短い確認から実践へ入る画面、本人用教材候補/課題・評価基準の版固定、途中のテキスト/画像支援、証拠別結果、次課題/LINE再開、課題作成前のAI費用予約はまだ未実装。旧固定テーマ/5段階設定は今回置き換えていない。旧6技能を別テーマの能力へ流用しない。過去に初期選択のまま保存されたProfileを自動補正せず、既存回答の真偽をこの修正だけで保証しない。

実AI確認、利用量・実測原価、実受講者の学習効果、人手対応時間、本番反映は未確認。接続診断403の原因は未確定で、前の環境記録を参照する。ローカル認証/DBは継続検証用に残し、本番・顧客情報・元checkoutは変更していない。

切り戻しはこのUI差分を戻す。schema/data変更はない。未回答の推測を避ける改善が失われるため、旧動作の再発を認識して判断する。

## 2026-10-13: #1263マージ後のmain追従・競合解消

main `e9b838aee6e499099f77096688babf049b95a821`を本PRブランチへmerge。Decision Log・ロードマップの両方の記録を残し、合成画面harnessには`training-setup`と`learning-request`の独立した入口を保持、E2E設定には両方のテストを登録した。片方の機能やassertionを削除して競合を回避していない。

- 統合後の390×844合成E2E: 全6ファイル23件成功、run `01a13123-0d8a-7394-9396-729573a1be43`。
- Webのプロフィール・希望保存・認証ルート一覧: 5ファイル126件成功。
- learning-ui型検査・lint、競合4ファイルのformat、`git diff --check`成功。
- 統合後の全体unit/DB結合/buildは今回ローカルで再実行していない。最新コミットのGitHub CIを別途確認する。

#1263で自由希望の正式保存・再訪入口は実装されたため、上記「まだ未実装」は本PR初回実装時点の記録である。希望の保存だけで動的教材生成・支援・評価の完成とは扱わない。詳細は`MANABERU_FREE_INTENT_INTAKE_IMPLEMENTATION.md`を参照。今回、本番設定・Migration・Deploy・実AI・実送信・実課金は行っていない。

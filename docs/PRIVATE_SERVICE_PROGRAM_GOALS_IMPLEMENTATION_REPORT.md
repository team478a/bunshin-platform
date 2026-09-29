# 非公開サービスのProgram目標 権限分離報告

日付: 2026-09-30。基準: main `31817864`（PR #1017マージ後）。参加者API監査の第7作業単位。本番反映とは区別する。

## 1. 調査した内容

- 支援方針/目標候補の管理操作と本人の希望/目標操作の全てが、認証後に公開Service解決を先に実行していた。非公開Serviceでは正しい管理者/参加者でも処理できなかった。
- 本人操作は既存Membership/Enrollment照合と受講ロック後のAI研修期間再確認を持つ。管理操作はADMINISTRATION Resolver、方針版管理/監査とACTIVE Program照合を持つ。
- 既存のSchema parseの例外と壊れたJSONは一般エラー500になり、管理Resolverの既存SERVICE_NOT_FOUNDも500になっていた。
- 正本仕様/設計原則、Program目標Core/UI報告、D-139の研修期間報告、共有Service Resolver、DB公開入口/制約と関連テストを確認した。

## 2. 変更したファイル

- `apps/web/src/http/program-goals.ts`: 管理/本人のResolver分離、Member Scope、入力400と管理不存在404の明示変換。
- `apps/web/test/program-goals-http.test.ts`: 四操作の成功/拒否とService切替、本人/Enrollment/方針/候補、受講ロック/期間条件、版管理/監査の実行テスト。
- `apps/web/test/program-goals-ui-boundary.test.ts`: 公開Resolver不使用とMember Scopeの静的境界を更新。
- D-154、Roadmap、機能不足監査とこの報告。

## 3. 主要な設計判断

- SET_SUPPORT_POLICY/CREATE_GOAL_DEFINITIONは管理Resolverだけ、SAVE_PREFERENCE/SET_MEMBER_GOALはMember Resolverだけを使用する。公開Resolverや権限fallbackは使わない。参加者と管理者が同一Userでも操作の必要権限を変えない。
- サーバー解決したWorkspace/Service/Userを使用し、Bodyに追加されたScopeは従来通り破棄する。許可入力型を広げず、未知キー拒否への互換変更もしない。
- Memberの利用期間とACTIVEなWorkspace/Group/所属を共有Resolverで確認し、既存本人Membership/ACTIVE Enrollment・受講ロック後の再確認を維持する。研修期間条件はAI_TRAINING_V1だけに適用し、他プログラムへ混ぜない。
- 支援方法選択許可、同じProgramの候補、未来期限、本人の過去目標CANCELLED、管理方針SUPERSEDED/版と監査を維持する。新しい排他や再送設計は追加しない。
- 壊れたJSON/Schema不一致は400。既存SERVICE_NOT_FOUNDだけ404へ変換し、未知障害は500のまま一般メッセージで返す。private no-storeは維持する。

## 4. 実行した検証

- 関連Web4ファイル86テスト成功（新規HTTP61件と既存UI/権限/Resolver25件）。認証/Resolver/DBをmockし、実HTTP処理と同一Origin判定を実行する。実DBの期間計算をこのmockテストだけで検証済みとは扱わない。
- Web型検査、変更ファイルのlint/format、アーキテクチャ境界と否定テスト10件、`git diff --check`成功。テスト用認証モックのrequire-await指摘を修正しlintを再実行した。全Webと全package/隔離実DB CIの最終結果はPRと作業報告に記録する。

## 5. 未解決事項

- 参加者画面等に残る公開判定は別監査。全非公開Service対応完了とは報告しない。
- 方針版の同時更新、ロック前取得の方針/候補と管理変更の競合、ロック後のProgram状態/所属変更に新しい排他保証は加えていない。既存DB制約と受講ロックを維持する。
- DB schema/migration、公開登録/画面、設定/本番データ、実AI/LINE/Storage、期限処理の本番有効化は変更していない。本番反映と実端末確認は別作業。

## 6. 次へ進める条件

- 本PRのCI成功・レビュー・マージを確認する。
- 残る画面の公開/参加者/管理者の意図を独立監査する。本番リリースは別途扱う。

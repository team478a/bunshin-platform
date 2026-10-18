# マナベル PR-D-3 実装報告：本人像の確認とAIへの受け渡し

状態：PR #1333 はマージ済み。レビューコメントへの追加対応を別PRで実施中。本番反映・本番migration適用・`multiTopic`変更は行わない。

## 1. 調査した内容

- D-1/D-2/D-3で追加された本人像の保存、テーマ別学習データ、受講者向け画面/API、AI入力、運用フラグを確認した。
- 既存の削除は本人像行を物理削除していたため、同じ属性が後日再登録されるのを止める永続的な印がなかった。
- 本人像の自動推測・保存処理は未実装である。現状の「AIへの受け渡し」は、本人が確認・修正できるよう保存済みの本人像を既存の提案/相談呼び出しへ含める接続であり、学習記録から本人像を新たに作るAI処理ではない。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`、`packages/database/prisma/migrations/20261017140000_personal_learning_persona_suppressions/migration.sql`: 本文や根拠を持たない、ユーザー・Workspace・Service単位の再推測抑止テーブルを追加。
- `packages/database/src/personal-learning-d.ts`: 削除を本人像データの物理削除と抑止印の記録として一体化。抑止属性へのAI保存を拒否し、本人が許可したときだけ印を解除するRepository APIと一覧取得を追加。
- `apps/web/src/http/personal-learning-persona.ts`、`apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/personal-learning/persona/route.ts`: GETで抑止中の属性名を返し、POSTで本人の明示操作による再推測許可を受付。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/persona/page.tsx`、`persona/persona-card.tsx`: 削除前に効果を説明し、削除後は「再推測しない項目」と本人用の許可操作を表示。受講者向け画面から社内向けの決定・レビュー文言を除去。
- `packages/database/test/personal-learning-d.integration-cases.ts`: 削除により本文付き本人像が消え、抑止印だけが残ること、同属性のAI保存が拒否されること、次のAI向け取得から除外されること、本人が許可した後のみ再保存できることを統合テストで確認。
- `apps/web/test/personal-learning-persona-ui.test.tsx`: 受講者向けの削除後表示、再推測許可操作、内部文言が表示されないことを検査。

## 3. 主要な設計判断

- 削除後は案B「本人が許可するまで同じ属性を再推測しない」を実装する。抑止テーブルに残すのは属性キーとスコープ・作成日時などの管理情報だけで、削除した値、根拠ID、推測内容は保持しない。抑止印はAI推測処理では削除できず、本人の画面操作だけで解除する。
- 再推測許可は、抑止印を解除するだけで、削除済みの値を復元したり即時に再生成したりしない。将来の推測処理が導入された後、その属性が新しい学習記録から推測され得る状態に戻る。
- アクセス範囲は既存本人像と同じく同一Membershipを通じたユーザー・Workspace・Serviceに限定し、`multiTopic`と動的研修の既存ゲートを維持する。
- 受講者向け画面では「この内容はAIに渡されず、再び推測されることもありません」と説明する。運営側の判断経緯や未決事項は表示しない。
- `multiTopic`の初期OFFは維持。本番データ、フラグ、DBには触れていない。migrationはコードとして追加しただけで、実DBへ適用していない。
- この追補PRを本番適用する場合は、新しい抑止テーブルのmigrationを先に適用し、準備完了を確認してからプログラムを反映する。今はどちらも行っていない。

## 4. 本人像を作る処理の提案（未実装）

学習記録から本人像を推測して保存する処理は、別の **PR-D-3b（推測生成）** に分ける提案。抑止と本人用画面が先に本番反映される順序にし、推測処理を同じリリースへ混在させない。

- **タイミング案:** 新しい実践回答または相談が保存され、通常のAI応答が成功した後に、対象受講について最大1日1回の小さな抽出ジョブを実行。新規記録のみを対象にし、再試行は冪等キーで重複を防ぐ。拒否/削除抑止を毎回照合し、抑止中の属性は保存しない。
- **費用案:** 専用の追加AI処理なので無料とはみなさない。既存Admission枠の中で明示的な上限を予約し、上限案は1受講あたり1日1回、入力1,000 tokens・出力300 tokensまで。モデルの単価と選定が確定後に上限コストを算定し、日次USD上限も設定する。未設定・上限超過時は処理をスキップし、既定値でAI呼出しを通さない。本人像抽出の費用記録・prompt versionも追加する。
- **推測対象案:** 学習目的、希望する説明形式、学習ペース、本人が明示した達成目標など、研修の進め方に直接関係する属性のみ。根拠記録への参照を必須にし、本人の確認前は「AIによる推測」として扱う。
- **推測しない範囲案:** 健康状態・障害/診断、家族構成・関係、政治・宗教、民族/国籍、性的指向、収入・資産、正確な住所など、学習支援に不要なセンシティブ情報や属性は推測・保存しない。記録中に偶然現れても抽出対象から除外する。
- 上記の実行頻度、token/USD上限、対象属性、同意要件は提案であり、このPRでは推測生成を追加しない。実装前に別途確認する。

## 5. 実行した検証

- `pnpm --filter @bunshin/database db:validate`: 成功。
- Database/Web typecheck: 成功。変更対象のESLintとPrettier check: 成功。
- Database unit test: 208 files / 1,026 tests成功。本人像UI test: 1 file / 1 test成功。
- 使い捨てPostgreSQLで新migration適用と`db:assert-ready`: 成功。本人像の統合テストを絞って実行: 2 tests成功（238件skip）。
- 同DBで全統合テストを実行した際は239/240件成功。失敗した1件は既存の別領域のAI利用枠`personal_learning_call_admissions_settled_check`制約違反で、本人像関連ではない。PR CI run `39038320542` では全体の`verify`・`database`が成功し、統合テストも成功した。
- PR CI `verify`: format check / typecheck / lint / 全test / Learning UI test / build成功。`database`: `db:validate` / migration deploy / readiness gate / integration test成功。
- Database readinessの`LATEST_DATABASE_MIGRATION`を本PRのmigrationに追随させた。migrationは隔離された使い捨てDBにのみ適用。本番には接続していない。
- 本番migration適用・本番へのプログラム反映・フラグ変更は行っていない。

## 6. 未解決事項

- 推測生成の対象・同意・実行頻度と利用上限は提案段階。PR-D-3bに着手する前に確認が必要。
- 本番へ適用する場合も、本番migration適用・プログラム反映・`multiTopic`変更には個別の承認が必要。

## 7. 次へ進める条件

- 追補PRの`verify`および`database`は成功済み。削除/抑止/本人による解除の経路をレビューする。
- 推測生成は本PRに含めず、上記提案を別途確認後に実装判断する。

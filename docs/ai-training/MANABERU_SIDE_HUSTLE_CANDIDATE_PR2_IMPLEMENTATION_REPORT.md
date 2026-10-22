# マナベル副業候補 PR-2 実装報告

状態: 固定カタログからAI候補の出力契約と決定的な安全確認への作り直し、およびPR #1379レビュー指摘の対応を実装。レビュー対応後の標準検証結果を以下に記録する。PRマージ、本番反映、AI呼び出し、外部提供は未実施。

作業ブランチ: `codex/manaberu-side-hustle-catalog-pr2`。作業開始時に`origin/main`へrebaseし、同じPR #1379の専用worktreeで作業した。

## 1. 調査した内容

- `AGENTS.md`、実装仕様、アーキテクチャ原則、ロードマップ、Decision Log、並行作業ルールを確認した。
- 前例`validateLearningLessonProposal`の状態別空欄規則、余分なキーの拒否、fail-closed検証を確認した。
- PR #1379の固定12件カタログ、除外領域、保証表現、条件照合規則、テスト、文書を確認した。
- 本作業にDB、migration、API、画面、LINE、Job、Cron、AI Provider、プロンプト、提供方針の変更は不要であることを確認した。

## 2. 変更したファイル

### 新規

- `packages/capability-training/src/side-hustle-types.ts`: 共通列挙値と型を分離し、カテゴリへ`OTHER`を追加。
- `packages/capability-training/src/side-hustle-safety.ts`: 指定8領域のキーワード検査、全角・半角英字と大小文字の正規化、保証表現検査、固定注意文を追加。
- `packages/capability-training/src/side-hustle-candidate.ts`: `SIDE_HUSTLE_CANDIDATE_V1`の型、厳格な出力検証、候補単位の除外、保証表現の提案全体拒否、深い凍結を追加。
- `packages/capability-training/src/side-hustle-candidate.ts`: 追加で理由文と質問も除外語を検査。理由が除外済み候補名を含む場合も固定文へ置換し、除外質問数を`removedQuestionCount`に記録。質問が全件除外されたNEEDS_CONTEXTは固定文のNO_FITへ変換。
- `packages/capability-training/src/side-hustle-safety.ts`: 保証表現を具体的な収益保証表現へ限定し、投資・ギャンブル除外語の「スロット」を「パチスロ」「スロットマシン」に変更。
- `packages/capability-training/test/side-hustle-safety.test.ts`: 除外語、正規化、正当例、保証表現、誤検出しない文、固定注意文を検証。
- `packages/capability-training/test/side-hustle-candidate.test.ts`: 状態別規則、全階層のキー、境界、根拠、保証表現、候補・質問除外、理由文の置換、凍結を検証。
- `docs/ai-training/MANABERU_SIDE_HUSTLE_CANDIDATE_PR2_IMPLEMENTATION_REPORT.md`: 本報告。

### 作り直し

- `packages/capability-training/src/side-hustle-screening.ts`: カタログではなく検証済みAI候補を受ける`SIDE_HUSTLE_SCREENING_V2`へ変更。候補型を再検証し、並び順と`candidateIndex`を保持する。
- `packages/capability-training/test/side-hustle-screening.test.ts`: 全未回答、費用・時間、働き方、端末、判定優先、決定性、不正入力、空配列、並び順をAI候補で検証するよう作り直した。

### 削除

- `packages/capability-training/src/side-hustle-catalog.ts`: 固定カタログ型、版、検証関数を削除。
- `packages/capability-training/src/side-hustle-catalog-data.ts`: 固定12件の候補データを削除。
- `packages/capability-training/test/side-hustle-catalog.test.ts`: 固定カタログ用テストを削除。
- `docs/ai-training/MANABERU_SIDE_HUSTLE_CATALOG_REVIEW_SHEET.md`: 固定12件の確認シートを削除。

### 改名

- `docs/ai-training/MANABERU_SIDE_HUSTLE_CATALOG_PR2_IMPLEMENTATION_REPORT.md`を削除し、本報告`MANABERU_SIDE_HUSTLE_CANDIDATE_PR2_IMPLEMENTATION_REPORT.md`へ内容を作り直した。

### 共有ファイルの変更

- `packages/capability-training/src/index.ts`: 固定カタログ2ファイルのexportを削除し、新しい型・安全確認・候補契約のexportへ置き換えた。
- `docs/DECISION_LOG.md`: 本PR内で追加した固定カタログの決定を、AI候補と決定的な安全確認の決定へ置き換えた。

`packages/capability-training/package.json`と`pnpm-lock.yaml`の`@bunshin/shared`依存は、`ApplicationError`利用のため前回PR変更を維持し、本修正では変更していない。既存テストは変更していない。

## 3. 主要な設計判断

- 候補一覧をコードにもDBにも保持せず、AIが利用者回答から1〜3件を自由に作る契約だけを定義した。
- 余分なキーと不足キーを全階層で拒否し、保証表現が1か所でもあれば部分採用せず提案全体を拒否する。
- 除外キーワードは候補単位で取り除き、`removedCandidates`に候補名と領域キーだけを残す。全候補が除外された場合は固定文の`NO_FIT`へ変換する。
- 除外キーワードは指示書の一覧だけを使用した。比較時だけUnicode NFKC正規化と英字の小文字化を行い、`FX`、`ＦＸ`、`fx`を同じものとして扱う。
- 費用、許認可、リスクを確認済みと主張できる項目を契約に持たせず、勤務先規定、申告、AI目安の固定注意文をコードで提供する。
- 条件照合は従来の予算・時間・働き方・端末規則を維持し、AI候補の入力順を変えない。

## 4. 実行した検証

Node.js 24.19.0、pnpm 10.10.0で実施した。

- `pnpm format:check`: 成功。
- `pnpm typecheck`: 成功（25/25 tasks、learning UIを含む）。
- `pnpm lint`: 成功（25/25 tasks、architecture checkとlearning UIを含む）。既存Webファイルの未使用eslint-disable警告4件のみ。
- `pnpm test`: 成功（25/25 tasks）。Web 528ファイル・3,721テスト成功、3ファイル・3テストskip。capability-training 36ファイル・579テスト成功。
- `pnpm build`: 成功（13/13 tasks、Next.js production buildを含む）。
- `git diff --check`: このレビュー修正の最終確認で実施。

全体テストの初回実行では、変更対象外の`apps/web/test/personal-learning-practice-support-service.test.ts`の1件が並行実行時に5秒タイムアウトした。対象ファイル単独の8件が成功することを確認し、テスト内容やタイムアウト値を変更せず全体テストを再実行して全件成功を確認した。

## 5. レビュー指摘への対応

- 提案理由と質問にも除外キーワード検査を適用した。理由が除外語または除外済み候補名を含む場合は「条件に合う候補を整理しました。」に置換する。
- 除外質問を取り除き、件数を`removedQuestionCount`へ記録する。NEEDS_CONTEXTの質問が全件除外された場合はNO_FITと「条件に合う候補を安全に提案できませんでした。」へ変換する。
- 保証表現は「絶対に稼げ」「絶対稼げ」「収入を保証」「収益を保証」「成果を保証」「利益を保証」を追加し、単独の「絶対」「保証」を削除した。既存の「必ず稼げ」「確実に稼げ」「誰でも稼げ」「月収」「万円稼」は維持した。
- 投資・ギャンブル領域の「スロット」を「パチスロ」「スロットマシン」へ置き換えた。指定された誤検出例と新しい保証表現のテストを追加した。

## 6. 未解決事項

- 指定された除外キーワードでは、テスト対象の「ハンドメイドの材料を仕入れる」「自己投資として講座を受ける」「ブログで投資の基礎知識を学ぶ」は誤検出しなかった。
- 指定表以外の除外キーワードは追加していない。実運用で不足が判明した場合は、運営レビューと別PRで更新する必要がある。
- 本PRは純粋な型・関数だけであり、AI候補生成、保存、画面表示、同意、LINE連携はまだ存在しない。
- 実装・自動検証は本番反映や外部提供を意味しない。

## 7. 次へ進める条件

- PR #1379で出力契約、除外語、保証表現、固定注意文、照合規則のレビューを完了する。
- PR-3は本PRのマージ後に開始し、`SIDE_HUSTLE_V1`提供方針、ヒアリング保存、AI候補生成、照合結果表示、本人選択を別PRで実装する。
- PR-3では未登録方針を明示エラーにし、除外領域と固定注意文をプロンプトへ必ず渡し、EXCLUDED候補を表示しないことを確認する。

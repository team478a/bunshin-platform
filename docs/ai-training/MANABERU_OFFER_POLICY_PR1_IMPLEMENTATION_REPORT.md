# マナベル提供方針 PR-1 実装報告

状態: 実装済み・ローカル標準検証済み。Draft PRレビュー待ち。本番反映、DB migration、Program設定変更、副業用方針の追加は未実施。

作業開始時の基準: `origin/main` `86e5417ad602bfe451f21fa000a33be2d8e0ab43`。既存のrebase途中の作業ディレクトリには触れず、専用worktreeと`codex/manaberu-offer-policy-pr1`ブランチで作業した。

## 1. 調査した内容

- 教材候補、会話、途中支援、ペルソナ推測、証拠確認Job、声かけCronの全AI経路と、画面・LINEを含む同意の表示・保存・照合経路を確認した。
- 受講者起点の画面・LINE経路は`resolvePersonalLearningRequestActor`を通るため、ここでProgram由来の提供方針を検証する。証拠確認Jobと声かけCronは同関数を通らないため、それぞれEnrollmentに紐づくProgram設定を処理時に再検証する。
- 最上位設定を書き換える既存処理を確認した。`program-feature-flags.ts`、`personal-learning-public-registration.ts`、`personal-learning-participant-admin.ts`、`personal-learning-invitation-admission.ts`、`personal-learning-pilot-operations.ts`、`ai-training-skill-lifecycle-admin.ts`はいずれも既存のsettingsをスプレッドして保持する。`training-personal-data-deletion.ts`は`jsonb_set`による部分更新であり、他の最上位キーを保持する。既存キーを消す処理は見つからなかった。
- `personalLearningPilot`と`learningFeatures`は許可キーを厳格に検査しているため、提供方針はそれらの配下ではなく`settings.learningOfferPolicy`へ置く必要があることを再確認した。

## 2. 変更したファイル

### 共有ファイル

- `packages/capability-training/src/index.ts`: 提供方針パーサの公開入口を追加。

### capability-training

- `packages/capability-training/src/personal-learning-offer-policy.ts`: `AI_SKILL_V1`型・登録値・既定値・fail-closedパーサを追加。
- `packages/capability-training/test/personal-learning-offer-policy.test.ts`: 欠落時の既定値、不正値拒否、Pilot/feature解析との非干渉を追加検証。

### Provider・サービス・入口

- `apps/web/src/providers/personal-learning-offer-policy.ts`: 既存マナベルの指示文とPrompt Versionを`AI_SKILL_V1`方針へ集約。
- `apps/web/src/providers/learning-proposal-policy.ts`と6つのOpenAI learning Provider: 方針から既存文面・版を取得するよう変更。既定値は互換性のため`AI_SKILL_V1`を維持。
- `apps/web/src/services/personal-learning-extended-scope.ts`: Enrollment→Programをサーバー側で照合し、`offerPolicy`と`extendedScope`を一度に返す解決関数を追加。
- 教材候補・会話・途中支援・ペルソナ推測サービス: 解決済み方針をProviderまで明示的に伝播。
- `personal-learning-request-access.ts`: 不正方針を既存の受講不可と同じ`NOT_FOUND`で拒否。
- 証拠確認Job、声かけCron・生成サービス: Program方針を再検証し、不正値ではProviderを呼ばない。Jobは既存のProgram停止・受講不可と同じ`NOT_FOUND`、Cronは既存の`skipped`計数へ合わせた。
- AI利用同意サービス・声かけ設定・Cron・LINE webhook・研修同意画面: 方針に対応する同意版・本文・SHA-256を使用。不正方針では表示・保存・照合・LINE操作を拒否。
- `apps/web/test/personal-learning-offer-policy-access.test.ts`、`personal-learning-offer-policy-provider.test.ts`: 受講者境界の拒否と既存版・文面・ハッシュの固定テストを追加。

### 文書

- `docs/DECISION_LOG.md`: Program最上位の提供方針と、Pilot許可キーを変更しない判断を追記。
- 本報告を追加。

## 3. 主要な設計判断

- 方針名は指示案どおり`PersonalLearningOfferPolicy`、解決関数は`resolvePersonalLearningOfferContext`とした。クライアント入力は受け取らず、EnrollmentとProgramのworkspace/group/membership/module条件から解決する。
- Programにキーがない場合だけ`AI_SKILL_V1`へ既定化する。キーが存在して値が未登録・非文字列・空文字の場合は`null`とし、Providerの互換用既定引数へ流れないよう入口で拒否する。
- `AI_SKILL_V1`の最終メッセージを変えないため、元の文字列をそのまま方針オブジェクトへ移し、連結位置の空白も維持した。共通安全規則は方針外に残した。
- 同意定数名は維持し、方針関数が同じ版・本文を返す。既存同意の再取得は発生しない。
- DB列やmigrationは追加しない。方針設定を書き込む管理操作と副業用方針は後続PRの範囲とした。

## 4. 実行した検証

- `pnpm format:check`: 成功。
- `pnpm typecheck`: 25 tasks成功。
- `pnpm lint`: architecture checkを含む25 tasks成功。
- 指示書5-1の既存Webテスト: 14 files / 103 tests passed。既存テストファイルは変更していない。
- 追加のProvider互換テストを含む関連Webテスト: 成功。
- `pnpm --filter @bunshin/capability-training test`: 33 files / 503 tests passed。
- `pnpm test`: 25 tasks成功。Webは521 files / 3,708 tests passed、live test 3件skip。初回は並列負荷による無関係な5秒timeout 2件と、既存テストmockに新しい公開関数がない互換性失敗2件が出た。mock互換分岐を追加し、該当4件の単独再実行成功後、全体再実行で成功した。
- `pnpm build`: 13 tasks成功。Next.js production build成功。
- `git diff --check`: 成功。
- Providerはモックまたは純粋なbody生成テストであり、外部AI、LINE、本番DBは呼び出していない。

## 5. 未解決事項

- Draft PRのレビューとCI確認は未実施。
- 副業用の方針・指示文・同意文、方針を設定する管理操作は後続PR。
- 本番反映、Program設定変更、Pilot開始、実AI・LINE実機確認は未実施。

## 6. 次へ進める条件

- Draft PRの差分とCIをレビューする。
- PR-1の「既存挙動・プロンプト・同意文が変わらないこと」とfail-closed境界が承認されるまで、副業用方針を追加しない。
- 本番反映やProgram設定変更は、マージとは別に明示承認を受ける。

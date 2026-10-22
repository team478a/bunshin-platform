# マナベル副業方針 PR-3a 実装報告

状態: 実装・標準検証完了。PR-3b、本番設定変更、Pilot有効化、migrationは対象外。

作業ブランチ: `codex/manaberu-side-hustle-policy-pr3a`
作業開始時の`origin/main`: `941f66ac1b969edcf6ffb855610997dce585ba98`（PR #1379 merge commit）

## 1. 調査した内容

- 指示書が基準にした`ca784e4`より新しい状態を確認し、PR #1379のマージ済みmainから専用worktreeを作成した。
- AI_SKILL_V1の各Provider向け指示文・Prompt Version、同意版・本文・画面表示、Program機能設定API/UI、同意の保存・照合経路を確認した。
- Prompt Versionは`personalLearningOperationHash`の材料ではなく、利用記録の冪等identityも操作ID・対象・attempt等で決まる。テキスト操作の`bodyHash`には`promptVersion`が含まれる。AI_SKILL_V1の既存版を維持し、SIDE_HUSTLE_V1の本文ハッシュが異なる操作として記録される。
- 同意照合はEnrollmentに紐づくProgramの有効方針からversionとSHA-256本文ハッシュを算出する。方針を跨いだ同意を流用しない。

## 2. 変更したファイル

### 実装

- `packages/capability-training/src/personal-learning-offer-policy.ts`
- `apps/web/src/providers/personal-learning-offer-policy.ts`
- `apps/web/src/services/ai-training-consent-policy.ts`
- `apps/web/src/services/ai-training-consent.ts`
- `apps/web/src/jobs/personal-learning-evidence-review.ts`
- `apps/web/src/services/personal-learning-nudge-ai.ts`
- `apps/web/src/services/personal-learning-persona-inference.ts`
- `apps/web/src/http/program-feature-flags.ts`
- `apps/web/app/s/[serviceSlug]/training/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/program-feature-flags-card.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/page.tsx`

### テスト

- `apps/web/test/personal-learning-offer-policy-provider.test.ts`
- `apps/web/test/personal-learning-offer-policy-consent.test.ts`
- `apps/web/test/program-feature-flags.test.ts`
- `packages/capability-training/test/personal-learning-offer-policy.test.ts`
- `apps/web/test/openai-learning-lesson.test.ts`
- `apps/web/test/openai-learning-conversation.test.ts`
- `apps/web/test/openai-learning-support.test.ts`
- `apps/web/test/openai-learning-evidence-review.test.ts`
- `apps/web/test/openai-learning-nudge.test.ts`
- `apps/web/test/openai-learning-persona-inference.test.ts`
- `apps/web/test/personal-learning-offer-policy-persona.test.ts`（不正方針をProvider前にSKIPPEDにする境界）
- `apps/web/test/ai-training-consent-flow.test.ts`、`apps/web/test/manaberu-dynamic-ui.test.tsx`（コピーの正本移動に合わせ、同じ既存文言の検査元だけを同意方針へ変更）

既存の提供方針パーサーテストは、SIDE_HUSTLE_V1が有効値になったため、従来の不正値fixtureを`UNKNOWN_POLICY`に差し替えた。AI_SKILLの同意ポリシー期待値には、新しい`copy`契約のチェックを追加した。これは新機能を成立させるための期待値更新であり、既存AI_SKILLの文言・動作は変えていない。

### 共有ファイル・文書

- `docs/DECISION_LOG.md`（追記のみ）
- `docs/ai-training/MANABERU_SIDE_HUSTLE_POLICY_PR3A_IMPLEMENTATION_REPORT.md`（本報告）
- `packages/capability-training/src/index.ts`は変更なし。

## 3. 主要な設計判断

- 未設定キーは引き続き`AI_SKILL_V1`、未知の値はパーサーで`null`。方針解決関数は未知値を`CONFIGURATION_ERROR`で明示拒否する。
- 同意UIはEnrollment単位の方針コピーを表示し、異なる方針が混在する場合は共通見出し「AIを使った支援への参加」とAI_SKILL_V1の状態コピーを使う。Enrollmentがない場合も既存AI_SKILL_V1表示を維持する。
- 管理APIは方針を省略可能とし、省略時は現在値を維持する。停止中かつ受講Enrollmentが0件のProgramだけ方針変更可能。同方針の再送は許可し、AI_SKILL_V1はキーを削除、SIDE_HUSTLE_V1だけを明示保存する。
- enrollment countはSerializable transaction内で確認し、監査ログの前後データに有効方針を記録する。画面側でも受講者がいるProgramの方針selectorを無効化する。
- AI_SKILL_V1の既存Prompt Version、同意version・本文・画面文言を維持。SIDE_HUSTLE_V1の文言は指示書付録A・Bの指定文を使用する。
- DB schema・migration、Provider既定値、PR-3bの候補生成・比較・選択機能は変更していない。

## 4. 実行した検証

依存関係: 専用worktreeで`pnpm install --frozen-lockfile`成功。

標準検証（最終実装後）:

- `pnpm format:check`: 成功。
- `pnpm typecheck`: 成功（workspace 25 taskおよびlearning UI型検査）。
- `pnpm lint`: 成功（architecture check、全package/Web ESLint、learning UI ESLint）。
- `pnpm test`: 成功（528 test files、3,737 tests pass、3 live tests skipped）。
- `pnpm build`: 成功（Next.js production build、全ルート生成まで完了）。
- `git diff --check`: 成功。

## 5. 未解決事項

- 付録A・Bの指定文言について、確認した範囲で未反映箇所はなし。
- 同意画面以外に残る「研修」表記は本PRでは変更していない。`apps/web/app/s/[serviceSlug]`以下の該当ファイルは以下のとおり（同意ページを除く）: `home/service-home-navigation-sections.tsx`、`home/service-home-overview-sections.tsx`、`manage/improvement-overview/card.tsx`、`manage/programs/learning-conversations/page.tsx`、`manage/programs/learning-conversations/[requestId]/page.tsx`、`manage/programs/learning-definition-review/card.tsx`、`manage/programs/personal-learning-preparation/internal-participants-card.tsx`、`manage/programs/personal-learning-preparation/page.tsx`、`manage/programs/program-feature-flags-card.tsx`、`manage/service-management-view-model.ts`、`manage/training/expiry/expiry-summary.tsx`、`manage/training/retention/page.tsx`、`manage/training/retention/retention-summary.tsx`、`manage/training/skills/training-support-skill-admin.tsx`、`manage/training/training-admin-dashboard.tsx`、`manage/training/training-lifecycle-card.tsx`、`programs/[programEnrollmentId]/ai-training-card.tsx`、`programs/[programEnrollmentId]/ai-training-data-deletion-card.tsx`、`programs/[programEnrollmentId]/ai-training-data-export-card.tsx`、`programs/[programEnrollmentId]/ai-training-ended-card.tsx`、`programs/[programEnrollmentId]/ai-training-setup-card.tsx`、`programs/[programEnrollmentId]/examples/page.tsx`、`programs/[programEnrollmentId]/learning-request/nudge-preference-card.tsx`、`programs/[programEnrollmentId]/page.tsx`、`programs/[programEnrollmentId]/persona/persona-card.tsx`、`programs/[programEnrollmentId]/personal-learning-pilot-card.tsx`、`programs/[programEnrollmentId]/personal-learning-profile-preparation-card.tsx`、`programs/[programEnrollmentId]/toolkit/page.tsx`、`programs/[programEnrollmentId]/toolkit/toolkit-list.tsx`。
- 本番Program設定・Pilot・DB migrationは変更していない。

## 6. 次へ進める条件

- レビューで付録文言、AI_SKILL_V1互換性、Enrollment制約、同意境界、監査ログが確認されること。
- PR-3aのマージ後に別指示書でPR-3bの範囲と設計を確定すること。PR-3bの候補提案・選択は本PRでは実装しない。

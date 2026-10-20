# PR-I1 実装報告：AIツール更新情報の登録・審査

- 調査日: 2026-10-20
- 対象: AIツールの新機能を、出典付きで学習テーマ候補へ反映する仕組み
- 状態: Draft PR-I1向け実装完了。外部Provider呼出し・本番変更は未実施。

## 1. 調査した内容

- `docs/ai-training/ADR_MANABERU_AI_EVOLUTION_POLICY.md` の原則7、`docs/IMPLEMENTATION_ROADMAP.md` のPR順序、および本線化指示書v4を確認した。要件は、受講者が使うAIツールに関係する新機能を出典付きで収集し、運営者が確認・承認するまでは学習提案に使わないこと。
- 既存検索Portは `packages/capability-social/src/trend-provider-benchmark.ts` の `TrendResearchProviderPort`。Exa / Firecrawl / GrokのAdapterがある。
- 呼出しサービス `apps/web/src/services/weekly-trend-research.ts` は、SOCIALのBunshin・投稿目的を入力に検索し、SOCIAL用Trend Researchへ保存する。Providerの費用予約、組織quota、AI利用記録、精算もこのサービスに結び付いている。
- Manaberu側には本人の希望に `toolDescription` があり、最初の提案・会話のProviderは既存の研修Admission、費用予約、Enrollment/Topic境界を通る。
- 学習テーマ候補は既存の本人・Service・Enrollment・Topic境界を使用する。BunshinMemoryやSOCIAL用のTrendResearchデータを研修記録として直接流用しない。

## 2. 主要な設計判断

1. `TrendResearchProviderPort` の検索契約とProvider Adapterは再利用候補だが、SOCIAL向けの `WeeklyTrendResearchGenerationService`、Bunshin所有の検索Context、保存RepositoryをそのままManaberuへ接続しない。Providerの費用予約・利用記録を再利用しつつ、研修固有のAdapter/Repositoryと認可境界を設ける。
2. 収集結果は最初から利用可能にせず、出典URL・出典名・取得時刻・公開日・要約・対象ツール・状態を持つ「レビュー待ち候補」として隔離する。出典の検証・承認・却下を監査し、承認済みだけを提案候補にする。
3. 受講者向け候補は、その本人の希望・現在のテーマ・本人が申告したツールに一致するものだけを使う。候補を使う場合も既存のLesson Provider呼出しとAdmissionを再利用し、新しい無制限AI呼出しを追加しない。
4. 公式情報に絞るため、検索結果はツールごとの公式ドメイン許可リストで検証し、非公式記事を承認候補にしない。対象ツールと公式ドメインの追加はコードレビュー対象にする。
5. 収集・表示・提案はProgram単位の機能設定で停止可能にする。初期状態はOFFとし、承認済み情報が存在するだけでは利用開始しない。
6. LINE通知は新設しない。候補を通常の学習提案へ含める場合でも、通知は既存の本人同意・回数制限を通す。

## 3. 今回の変更

- **候補登録**: ChatGPT / Claude / Gemini / Canvaの公式HTTPSドメインに属するURLだけを受け付け、候補は常に `PENDING` で登録する。標準外ポート、認証情報付きURL、フラグメント付きURL、非公式ホストは拒否する。
- **レビュー**: 登録・承認・却下を同一トランザクションで監査記録に保存する。承認・却下はSuper Admin限定、理由必須、レビュー待ち以外の状態遷移と同時レビューを拒否する。承認情報は90日後に期限切れとなる。
- **管理画面/API**: `/admin/ai/tool-features` に一覧・登録・レビュー導線を追加し、APIの一覧は最大200件、各候補の監査履歴表示は最大10件に制限する。
- **データ境界**: 候補はManaberu専用カタログであり、BunshinMemoryやSOCIALのTrendResearchへ書き込まない。受講者向け画面・提案・LINE配信との接続は今回行わないため、候補が承認されても受講者には表示されない。
- 外部検索、定期収集Job、AI呼出し、費用予約、通知は今回含めない。したがって外部AI/API費用やLINE送信は発生しない。
- **PR-I2（後続）**: 承認済み候補を本人の申告ツール・希望・選択中Topicに限定して既存Lesson提案へ接続する。出典表示、期限切れ、重複防止、Topic/API/Export/削除の境界テストを含める。PR-I1の確認後に着手する。

## 4. 後続自動収集の前に決める事項

- 定期収集の頻度、1回あたりの検索数、Provider費用の上限および停止担当
- 受講者への候補提示を追加質問/次回提案のどの時点で行うか、および候補数
- 90日経過後の再審査や、公式情報の更新・誤承認時の運用手順

上記は金額や運用責任に影響するため、コード内に暗黙の自動収集設定を埋め込まない。収集Jobの本番有効化、Provider呼出し、本番設定変更は別途承認を要する。

## 5. 変更ファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261020100000_personal_learning_tool_feature_updates/migration.sql`
- `apps/web/src/http/personal-learning-tool-features-admin.ts`
- `apps/web/app/api/admin/personal-learning-tool-features/route.ts`
- `apps/web/app/(app)/admin/ai/page.tsx`
- `apps/web/app/(app)/admin/ai/tool-features/page.tsx`
- `apps/web/app/(app)/admin/ai/tool-features/tool-features-admin.tsx`
- `apps/web/test/personal-learning-tool-features-admin.test.ts`
- 本報告書

## 6. 検証結果

- `pnpm --filter @bunshin/database db:validate`: 成功（ローカルのダミー接続URLでスキーマ検証のみ。DB接続なし）。
- `pnpm --filter @bunshin/database db:generate`: 成功。
- `pnpm --filter web exec vitest run test/personal-learning-tool-features-admin.test.ts`: 成功（10件。公式URL許可、HTTP/非公式ホスト/認証情報/フラグメント/標準外ポートの拒否、Super Admin制御、競合、監査、管理者認証、一覧上限）。
- `pnpm --filter web typecheck`: 成功。
- 変更TypeScriptファイルのESLint: 成功。
- `git diff --check`: 成功。
- DB統合テストは未実施。今回の変更を含むGitHub Actionsの`verify` / `database` 成功結果も未確認であり、Draft提出前または提出後に確認する。

## 7. 未解決事項・本番への影響

- 定期収集・費用上限・受講者への提案接続は後続PRであり、未実装。
- 本番DB migration適用、Vercel反映、環境変数・Program設定・Feature Flagの変更、LINE送信、Provider呼出しは行っていない。
- スキーマ/migration追加を含むため、本番適用はレビュー承認後にmigrationを先行し、その後プログラムを反映する必要がある。今回は適用しない。

## 8. 次へ進む条件

Draft PRの`verify` / `database` CIとDB統合テストが成功し、田中がPR-I1を確認した後にのみPR-I2へ進む。PR-I2でもAI評価やProvider呼出しを実行する前に予算確認を行い、予算承認前はAIを呼ばない。

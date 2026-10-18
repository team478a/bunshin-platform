# マナベルスタイル 利用者向け文言・ホーム・最初の入力 改善報告

作成日：2026-10-19  
状態：Draft PR。田中の確認前にマージせず、本番反映・設定変更もしない。

## 1. 調査した内容と変更概要

レビューコメントを受け、利用者向け動的学習表示の判定をサービスslugではなくProgram設定の`learningMode = DYNAMIC_V1`に統一した。対象サービスのslugが何であっても動的Programには研修向け表示を使い、同じサービス内の固定Programや他サービスの固定経路は従来表示を維持する。

AI利用同意は`AI_TRAINING_EXTERNAL_AI_V1`から`AI_TRAINING_EXTERNAL_AI_V2`へ更新した。チェック文を「この研修で、外部のAIサービスを使うことに同意します」に変更し、説明文の「Enrollment」を自然な日本語にした。現在版と本文digestの両方を照合する既存ゲートにより、次回学習を開いた際にV1同意だけの受講者は再同意が必要になる。新しい同意は受講単位・版単位で追加保存され、過去のV1同意は削除しない。DBの一意キーは既に版を含むためmigrationは不要。

| 場所                  | 変更                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------ |
| ホーム                | 対象サービスの`DYNAMIC_V1` Program有無をサーバー側で判定し、動的向けホーム表示へ接続 |
| 研修Program・学習希望 | slug条件を除き、Programの`DYNAMIC_V1`設定で動的向け表示を選択                        |
| 研修参加・同意画面    | 受講ごとの動的設定で文言を選択。チェック文と同意版を更新                             |
| 同意サービス          | 参加情報へ動的モードを含め、現行版以外の同意を有効同意として扱わない既存動作を維持   |
| DB統合テスト          | 同一受講にV1とV2の同意記録を共存させ、旧版を残して新版を保存できることを確認         |

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/home/page.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-navigation-sections.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-overview-sections.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/training/page.tsx`
- `apps/web/src/services/ai-training-consent-policy.ts`
- `apps/web/src/services/ai-training-consent.ts`
- `apps/web/test/ai-training-consent-flow.test.ts`
- `apps/web/test/manaberu-dynamic-ui.test.tsx`
- `apps/web/test/service-home-module-boundary.test.ts`
- `packages/database/test/database.integration.test.ts`
- `docs/MANABERU_FLOW_COPY_UX_IMPLEMENTATION_REPORT.md`

## 3. 主な設計判断

- 表示分岐は`DYNAMIC_V1`というProgram設定を基準にし、特定サービス名への依存をなくした。ホームでは対象サービスに動的Programが一つ以上ある場合に動的導線を表示し、Program単位の画面と同意表示は各受講Programの設定に従う。
- 同意版を上げることで旧版同意を無効扱いにし、既存の同意チェック経路で再同意を要求する。受講単位でV2を追加し、V1履歴は保持する。migrationや同意削除処理は追加していない。
- 未同意または参加枠なしでは従来どおりAI処理を行わない。Production環境、Program設定、フラグは変更していない。

## 4. 実行した検証

- 表示テストで、動的表示の判定が`DYNAMIC_V1`ベースであり、サービスslug条件を使わないこと、固定経路の表示が維持されることを確認。
- 同意フローテストでV2の文言・版、旧版を削除せずupsertで版別記録を追加することを確認。
- DB統合テストに、同じ受講者・受講のV1およびV2同意が共存することを確認するケースを追加。
- 修正を含むCI run `39156523591`（commit `a9384418`）：`verify`成功、`database`成功。database job内のDB統合テストも成功。
- 先行run `39156094902`は`database`成功、`verify`が未使用変数で失敗したため、未使用の`service`束縛を除去して再実行した。最終runでは両job成功。
- ローカル：対象Vitest 19件成功、`pnpm format:check`成功、`pnpm typecheck`成功（25/25 tasks）。DB統合テストは隔離DBの安全条件を満たさずローカル実行を拒否されたが、CIの隔離DBで成功。

## 5. 未解決事項

- 本番環境での画面確認（このPRでは本番反映しない）。

## 6. 次へ進める条件

1. 田中がDraft PRと本報告を確認する。

この作業ではマージ、本番反映、migration適用、機能設定変更を行わない。

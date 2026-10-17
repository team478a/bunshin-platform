# マナベル PR-E 実装報告

状態: Draft PRで田中の確認待ち。マージ・本番リリース・DB migration適用・feature flag変更・実AI呼び出しは未実施。

## 1. 調査した内容

- 本線化指示書v4のPR-EとPR-G評価手順、PR-C2の会話契約、初回教材提案・再提案Provider、実践途中支援の画像保存と履歴を確認した。過去版v1〜v3は仕様根拠に使用していない。
- 実践相談画像は静止画像の検査・再符号化、所有Enrollment/Membership/Assignmentとの束縛、本人認可、Provider入力、Export/削除・保持処理に既存接続されている。新しい画像保存経路や公開URLを作る必要はなかった。
- `extendedScope`はPilot Programの機能表示設定で、既定OFF。クライアントから受け取らずEnrollmentとService Programを照合してサーバー側で解決する。

## 2. 変更したファイル

- `apps/web/src/providers/learning-proposal-policy.ts`: 初回提案と再提案で共有するv2/v3提案指示を集約。
- `apps/web/src/providers/openai-learning-lesson.ts`、`openai-learning-conversation.ts`: 共通指示を使い、拡張設定ON時だけツール操作案内・手本/下書き提示を許可。
- `apps/web/src/services/personal-learning-extended-scope.ts`、`personal-learning-lesson-candidate.ts`、`personal-learning-conversation.ts`、`personal-learning-practice-support.ts`、`openai-learning-support.ts`: Enrollment/Program設定をサーバー側で解決し、初回提案・再提案・実践画像相談に適切なPrompt Versionを利用量記録へ保存。設定OFF時は既存の各v2/v1ルールを維持。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/{card,practice-card,conversation-card}.tsx`: 実践チャットを希望相談チャットに統合。実践開始後は同じ入力欄から相談と画像を送り、希望会話・実践相談を時系列に表示。旧独立相談フォームを削除。
- `apps/web/test/fixtures/learning-proposal-evaluation-set.ts`、`apps/web/test/learning-proposal-policy-evaluation.test.ts`、`apps/web/test/personal-learning-conversation-service.test.ts`: 合成評価セットと共有ポリシー、候補再生成分岐、不要な候補出力を無視する挙動を検証。
- `scripts/test/learning-ui/main.tsx`、`scripts/test/learning-ui/practice-support.e2e.ts`: 合成Learning UIにも希望相談・実践相談の共有スレッドを組み込み、画像添付・再訪・失敗時保持・停止中の送信防止を検証。
- `docs/DECISION_LOG.md`、`docs/IMPLEMENTATION_ROADMAP.md`、本報告を更新。

## 3. 主要な設計判断

- 初回提案と確認質問回答後の再提案は、一つのポリシー実装を共有する。設定OFFでは既存v2文面、ONではv3文面を選ぶ。v3はスクリーンショットがある場合に見える範囲を根拠とし、ない場合は一般手順として案内する。不確かな画面・操作を断定しない。手本の後に本人が試す具体的な一歩を残す。
- 「作り直し」が不要な状態でAIが有効な候補案や環境情報まで返した場合、会話本文だけを保存し、候補・環境情報は適用しない。NEEDS_CONTEXT候補の時だけ、保存時の既存revision/ownership照合を経て候補を更新する。
- 実践相談欄は学習チャット内の同じ composer と時系列表示へ統合した。一方、永続化は既存の会話イベントと実践支援イベントをそれぞれ維持する。画像は既存の安全な実践支援画像テーブルに保存され、AI費用枠・同意・所有認可・既存保持/削除を迂回しない。schema変更・migrationなし。
- v4 PR-Eの範囲外リスト: (1)本人に代わる外部サービスへのログイン・投稿・公開・送信、(2)医療・法律・税務等の専門的判断、(3)他人の個人情報・権利侵害を伴う作業、(4)研修と無関係な依頼。安全で研修に沿う代替案を提示する。この最終リストを田中に報告し、Draftレビューで確認を受ける。

## 4. 実行した検証

- Web全テスト: 501 files / 3,612 tests passed、2 skipped（全3,614件）。Providerはモックで、実API呼び出しなし。
- Learning UI E2E: 9 files / 39 tests passed。統合チャット上で実践相談を同じスレッドに表示すること、画像添付、再訪時の復元、失敗時の入力保持、停止中の送信防止を確認。最初のCIでは旧「個別の途中相談フォーム」を前提にしたE2E 6件が失敗したため、実UIに合わせてテストと合成ハーネスを更新し、ローカルで全件再確認した。PR更新後のCI再実行は確認待ち。
- `pnpm --filter web typecheck`: 成功。`pnpm --filter web lint`: 成功。`pnpm --filter web build`: 成功（Next.js production build）。
- Prettierで変更したTS/TSXを整形。
- `git diff --check`: 成功。
- GitHub Actions run `39003336113`（E2E修正を含むcommit `cabda2e5`）: `verify` と `database` の両jobが成功。verifyのformat check / typecheck / lint / 全test / Chromium準備 / Learning UI E2E / buildが全て成功し、Learning UI E2Eは9 files / 39 tests。Databaseではdb validate / CI用DB migration / readiness / 統合テストが成功（1分52秒）。これはCI用DBでありproduction DBには接続していない。
- 初回runは旧UI前提のLearning UI E2Eが失敗したが、統合チャットの合成ハーネスと期待値を修正した後のrun `39003336113` ですべて成功した。未実行の検証を成功扱いにしない。

### 合成評価セットの範囲

架空20シナリオ（SNS、事務、販売、画像生成、スマートフォン初学者、PC中級者、画面操作質問、範囲外依頼など）を含み、各シナリオに受講者像と10回の発言目安を付けた。初回提案と再提案の双方について、共有Prompt方針、構造スキーマ、READYの実践/証拠/基準、範囲外応答の分岐を合成Providerで検査する。これはモデル生成文の人手品質採点ではない。実AI会話、2人以上の採点者、費用・応答時間、実受講者の学習効果はPR-Gの承認された検証環境で実施する。

## 5. 未解決事項

- 田中による範囲外リストとPR-E実装の確認・マージは未完了。
- 実AI品質、人手評価、実画像を含む実機動作、PR-Gの会話実施と採点は未実施。
- Productionリリース、DB migration、feature flag、Pilot/外部公開の変更はしていない。

## 6. 次へ進める条件

- Draft PR-Eの差分、CI、範囲外リストを田中が確認する。
- 指摘があればDraftのまま修正し、必須CIを再確認する。
- 田中の確認前にマージしない。Productionリリースは、別途田中の確認を受けてから行う。

# マナベル PR-G 実装報告

状態: **Draft PR**。実AIの通し評価・人手採点は未実施。本番設定・DB・Program・Enrollment・Feature flag・Cron・Vercel deployに変更なし。

## 1. 調査した内容

- 添付の本線化指示書v4のPR-G手順を一次仕様として確認。v1〜v3は仕様根拠として使っていない。
- main上のPR-E合成評価セット（架空20件）、Wave 0 Launch Runbookの既存Production E2E/境界/観測/Kill Switch手順、AI進化方針書、学習フローGap Reportを照合した。
- PR-Gの必須要件は、検証環境での実AI、同一10件以上、Web/LINE各5件以上、各10発言以上、人間の採点者2人以上、7観点、費用/応答時間記録である。機械的なモック・既存CI成功では代替できない。
- 現セッションでは検証環境・実AI利用/費用、受講者役、独立採点者、LINE実配送の証跡がなく、実評価を実施できる状態ではない。未実施をPASSとせず、将来の実施手順・記録様式と明確なNO-GO判定を整備した。
- Backup復元元の来歴証明は、#1205から持ち越された外部公開前の課題としてUNKNOWNを維持する。実環境を読み取ったかのような証明は追加していない。

## 2. 変更したファイル

- `docs/ai-training/MANABERU_PR_G_EVALUATION_PACKET.md`: 固定10シナリオ、Web/LINE配分、実施者、採点規準、合否判定、記録/Privacy境界。
- `docs/ai-training/MANABERU_PR_G_SCORECARD_TEMPLATE.csv`: 10セッション×2採点者の空採点テンプレート。会話本文欄は設けない。
- `docs/ai-training/MANABERU_EXTERNAL_RELEASE_READINESS.md`: 外部公開Gate一覧。未確認のProduction証拠はUNKNOWN、現判定NO-GO。
- `docs/ai-training/MANABERU_STYLE_PRODUCTION_WAVE0_LAUNCH_RUNBOOK.md`: PR-G検証手順・外部公開判定表への導線を追記。
- `docs/ai-training/MANABERU_PR_G_IMPLEMENTATION_REPORT.md`: 本報告。

## 3. 主要な設計判断

- 10個の既存合成シナリオを固定し、Web 5件/LINE 5件を割り当てた。SNS、事務、販売、画像生成、スマートフォン初学者、PC中級者、画面質問、範囲外2種類を含む。
- 評価会話は人が役者を務める。各セッションで受講者発言10回以上、各会話2人以上が独立採点し、最低1人は役者と別人とする。スクリプトによる偽の人手評価を作らない。
- 初期閾値はv4どおり観点1〜6平均4.0以上、観点4〜6の1点が0件、2点以上の評価差を調整記録、観点7は人間承認済みの費用/時間上限と照合する。
- 実AIの資格情報は既存の暗号化Provider設定から解決する想定とし、資格情報を文書へ記載しない。実費上限・環境承認・担当者が確定していなければ呼び出さない。
- 実会話記録は非公開の証跡保管先に制限し、PRへは集計と証跡キーのみ記載する。PR-Gの品質結果は学習効果を証明しない。
- 各GateのUNKNOWNをPASSへ読み替えない。外部公開は全必須条件の証拠付きPASSと田中の別承認後に限る。
- Decision Logへ新しい製品仕様の決定は追加していない。評価用の初期判定値は本線化指示書v4で指定済み。

## 4. 実行した検証

- ドキュメント差分のリンク/参照整合、CSVのヘッダーと20採点行、10セッション・Web 5/LINE 5配分を機械的に確認する。
- `git diff --check` およびドキュメント内リンク確認を実行する。
- 実AI、LINE送信、実ユーザー会話、人手評価、Productionのread/write操作は本PRで実行しない。したがって実運用品質評価の結果は未取得である。
- Node.js 24.19.0 / pnpm 10.10.0で`pnpm install --frozen-lockfile`と`pnpm format:check`が成功。
- CI run [39236872312](https://github.com/team478a/bunshin-platform/actions/runs/39236872312): `verify` と `database` が成功。verifyのformat / typecheck / lint / 全test / learning UI / build、databaseのvalidate / CI用migration / readiness / integration testが完了。CI databaseは隔離環境でありProduction DBではない。
- 文書PRのため、アプリケーションコード・DB schema/migrationに変更なし。Production DB migration/DB操作は行っていない。

## 5. 未解決事項

- 実AI検証環境、Provider/model/価格版、Admission・Provider側予算、実費承認、監視/停止担当。
- 受講者役・独立採点者（各会話2人、うち最低1人は役者以外）と10件の実会話、費用・応答時間記録。
- LINE学習の検証環境・Webhook/再送・quotaの実証。LINE実送信は認可と承認済み上限が確認できるまで行わない。
- 現行Productionのrelease SHA、migration/checksum/drift、RLS/role、Retentions cron実動作。
- 復元元Backupの識別子・取得時刻・復元先の来歴証明（UNKNOWN）。
- 利用規約・プライバシー表示の専門家確認、内部Wave 0結果、Kill Switch/drain実証、田中による最終外部公開承認。

## 6. 次へ進める条件

1. Draft PRの文書・手順・固定評価ケースを田中が確認する。
2. 承認済みの隔離検証環境、Provider費用上限、実行者/2人以上の採点者、LINE検証経路が用意される。
3. 10セッションを規定どおり実施し、集計・費用・応答時間・例外を非公開証跡と照合して報告を更新する。
4. 外部公開判定表の全必須Gateを根拠付きでPASSにする。UNKNOWN/FAILが残る場合NO-GOを維持する。
5. PR-Gレビュー/マージとProductionリリースは別承認。本PR後のPR-H/Iには進まない。

## 7. 実装済み／検証済み／本番反映済み

- 実装済み: PR-Gの文書手順、採点テンプレート、外部公開準備判定表。
- 検証済み: 文書/CSVの構造・リンク整合、`git diff --check`、`pnpm format:check`、GitHub Actions run `39236872312`のverify/database成功。
- 未検証: 実AI会話、LINE配送を伴う通し評価、人手採点、実費・時間の判定、ProductionのDB/Backup/Retention/停止条件。
- 本番反映済み: なし（本PRでは本番に触れていない）。

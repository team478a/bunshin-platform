# マナベルスタイル — Pilot学習の焦点表示

2026-10-09 JST。基準main `7bc8c23c9b5fc90a0cb2a94531f0349aaff1a00d`（#1207）、branch `codex/pilot-definition-focus`。commitは本書を含むPRのheadを参照する。

## 目的・実装

3Definition教育レビューで指摘した「構造と背景で同じ課題が再表示され、違いが分かりにくい」を、Pilotだけの表示補足で対応する。Definition本文・版、Mission、Rubric、合格条件、Router、30日V1は変更しない。

- 構造: 背景・目的・依頼を分けることを案内。
- 背景: 前と同じ課題を再利用し、相手・場面・必要情報に注目することを明記。構造も引き続き評価される。
- 条件: 2つ以上の具体的で矛盾しない条件を案内。背景も評価される。
- 架空の勉強会・お店などの安全な題材を利用でき、実名・連絡先・会社の秘密を入力しないことを案内。外部AIの完成回答ではなく、本人の指示を提出する。
- PASSかつ実践開始済み・未完了の場合だけ、本人操作・確認後の実践完了記録を案内。新しい必須条件・自動完了・能力Level判定は追加しない。

## 変更ファイル・境界

| ファイル                                                                                       | 役割                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/src/services/personal-learning-focus.ts`                                             | 純粋な版固定の表示Mapping                           |
| `packages/database/src/personal-learning-pilot.ts`                                             | 既存Assignment snapshotの参照を読取projectionへ追加 |
| `apps/web/src/http/personal-learning-pilot.ts`                                                 | 既存認可後のPlanとAssignmentから表示を解決          |
| `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card.tsx` | Pilot専用の焦点・安全題材・記録案内                 |
| `apps/web/test/personal-learning-focus.test.ts`                                                | Mapping・未知版・Plan/Mission照合                   |
| `apps/web/test/personal-learning-pilot-http.test.ts`                                           | Serverでの解決・未知参照の非推測                    |
| `apps/web/test/personal-learning-pilot-ui.test.tsx`                                            | 3焦点・安全案内・記録表示条件・旧表示回帰           |
| 本報告・Wave 0 Launch Runbook                                                                  | 引継ぎ                                              |

既存認証・Tenant Scope・Pilot Gateを再利用し、クライアント指定のDefinitionを信用しない。DB projectionは保存済みpackage/key/version、Mission key、qualityVersionをfixtureと照合する。legacy parserの版補完を根拠にしない。表示MappingはCONFIRMED Plan内の完全一致参照を要求する。

照合できない場合は焦点を返さず、UIで確認不能を表示する。これは**表示だけのfail-closed**であり、既存実行Gate・Router判断の代替ではない。内部Definition版を利用者に表示せず、Mission本文や評価対象を変更しない。新しいCore契約・保存先・本文ログを追加しない。

## 検証

- Web関連6ファイル50テストPASS: focus、Pilot UI/HTTP/access、既存Assessment evaluator、Skill evaluation boundary。
- capability-training全29ファイル465テストPASS: Scope・Goal・Plan・Consultation・Router・Guided Practice等。
- 追加のWeb回帰4ファイル22テストPASS: 旧受講者UI、評価結果観測、評価job境界、評価期間。合計537テストPASS。
- database型チェック、変更した7コード/テストファイルのESLint、architecture check、diff checkはPASS。
- Web `next build` PASS（コンパイル・TypeScript・34静的ページ生成）。最初の単体typecheckは古い `.next` validatorの存在しないroute参照で失敗し、`next typegen`で再生成した。単体再実行は重複負荷を避け中断し、build内TypeScriptで成功を確認した。アプリコードで回避していない。

実Provider品質・実認証・実スマートフォン操作・本番E2Eは未検証。合成/静的描画テストを本番利用成功と扱わない。

## 未実施・停止条件

DB/schema/migration、Definition承認、Provider設定・呼出、LINE、30日V1、本番deploy・設定・参加者登録・STARTは変更/実行しない。教育レビューの人間判断はUNKNOWNのままで、本PRは承認の代替ではない。

次は人間の画面/教育レビューと既存Wave 0 Gateの確認。新課題・Teaching生成・能力Level自動判定へ進まない。rollbackは本PRのコード変更をrevertする。保存形式の変更がないためDB rollbackは不要。旧Serverの焦点未返却をUIは確認不能として扱う。

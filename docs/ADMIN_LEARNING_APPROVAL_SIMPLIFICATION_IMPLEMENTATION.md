# 学習設計承認の来歴自動化（PR-2B）

作成日：2026-11-03。基準main：`cd788c62`（PR #1453および外部API認証/テストPR #1446・#1455マージ後）。実装・検証・本番反映を区別し、本PRは本番設定・migration・deployment・承認登録・送信を実行しない。

## 1. 調査した内容

既存の固定3件のLearning Definition承認経路を、page→card/client→definition-approvals HTTP→PrismaLearningDefinitionApprovalAdminRepository→LearningDefinitionApproval/ProgramAuditLogまで追跡した。SHAは従来、人間の申告にすぎず、証跡キーも自由な参照文字列だった。現在状態の初回取得と成功後の取得も手動で、7項目の内容確認に加え最終確認チェックがあった。

稼働コード情報は既存production-gate-evidenceと同じ`VERCEL_GIT_COMMIT_SHA`を利用できる。新環境変数・新table・GitHub照会・有料Providerは不要。既存のscope/actor確認、DB再認可、Serializable transaction、revision/reviewDigest、operationIdとfingerprintを再利用する。

対象は停止中Pilotの既存固定3件の内容承認であり、自由希望の動的教材や個別学習候補をこの承認へ追加しない。

## 2. 変更ファイル

- `apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/card.tsx`：初回自動GET、技術入力と重複最終チェック撤廃、成功/拒否後の自動GET、結果不明と読取失敗の区別。Service変更時は状態を分離する。
- 同`client.ts`：GETの来歴projectionを検証し、操作へ固定。人間が確認した7項目だけを送信する。
- `apps/web/src/http/learning-definition-approval-admin.ts`：GETへ検証済みSHAまたはnullを付加。新モードの証跡キーをoperationIdから生成。旧API形式は従来の人間申告として受理する。
- `packages/database/src/learning-definition-approval-admin.ts`：自動来歴区分と証跡参照を検証・既存監査へ保存。新規操作のSHAをサーバー値へ照合し、同一操作のreceiptはdeploy後も再取得できる。
- Webの既存HTTP/UIテスト、DBの既存command/integrationテスト、既存`definition-review.e2e.ts`：新旧互換、失敗・競合・認可・来歴・再送・端末幅の検証。
- 新ADRと本報告、旧UI ADRへの更新先案内。
- 共有ファイルの変更：`apps/web/app/styles.css`へ本画面専用classの折り返しと最小幅解除を追加。既存のselectorは変更しない。package公開入口、環境定義、DECISION_LOG、IMPLEMENTATION_ROADMAP、共通e2e configは変更しない。

## 3. 設計判断と操作比較

詳細は[ADR](adr/LEARNING_APPROVAL_AUTOMATIC_PROVENANCE_ADR.md)。

| 操作             | 従来                  | 改修後              |
| ---------------- | --------------------- | ------------------- |
| 初回状態取得     | ボタン1回             | 表示時に自動GET     |
| 対象選択         | 1件選択               | 維持、事前選択なし  |
| 内容確認         | 7項目の本人確認       | 維持、自動trueなし  |
| 技術情報の手入力 | SHA・証跡キーの2欄    | 0欄                 |
| 最終確認         | チェック＋承認ボタン  | 承認ボタン1回       |
| 承認の書込       | 1 POST                | 1 POST（維持）      |
| 成功後状態取得   | ボタン1回＋対象再選択 | 自動GET、選択を維持 |

上記は同一合成データでの画面手順比較で、実利用者の所要時間測定ではない。SHAはコード来歴であり教材同一性や本番リリース承認の代わりではない。内容は既存digest/版、承認状態はrevisionで別々に照合する。

新UIは`provenanceMode=SERVER_V1`とGETのSHAを送り、証跡キーは送らない。サーバーが`definition-review:{operationId}`を作る。DBは自動区分、参照、actor、scope、対象、digest、revision、SHA、本人のchecklistを既存の同一transactionの監査に残す。ログ本文・secret・新個人追跡情報を追加しない。

新規操作でSHA欠落/不正は保存せず、旧SHAはCONFLICT。既に確定済みの同一ID/bodyは、現在SHAが変化・欠落しても、再認可後に履歴receiptを返す。別body/actor/scopeの再送は許可しない。旧入力形式は自動検証済みに分類しない。

receipt受信後のGET失敗は読取だけ再試行できる。5xx・切断・不正receiptは同一ID/bodyだけを明示再送する。自動POST再試行や新ID生成はしない。receiptと現在状態が異なる場合は、GETの現在状態を表示し、その差を案内する。

## 4. 検証

初期基準`1bdae6f4`でローカルの全体`pnpm test`は25 task成功。Webは560ファイル・4,137件成功（実AIの3件は既存のskip）、Database単体は230ファイル・1,345件成功。新旧HTTP契約、画面/pageの既存認可、command検証を含む。全packageとlearning-uiの型検査・lintも成功した。その後mainへ外部API認証/テストPR #1446・#1455が入ったため、最終基準`cd788c62`へrebaseし、標準CIを改めて実行する。初期基準の件数をrebase後の最終結果とは扱わない。

既存e2e harnessで7件成功。1280/390/320pxの初回自動GET→7項目の本人確認→1 POST→自動GET、入力欄0、横overflowなしを検証した。結果不明時の同一body再送、receipt後の読取失敗、現在状態がreceiptと異なる場合、来歴欠落、対象切替と競合も確認した。390pxのスクリーンショットを確認した。合成データであり、本番や外部Providerを呼ばない。

CIのLinuxフォントでは320pxに長い版名が収まらないことを検出したため、本画面の長い文字列の折り返しとfieldset/入力の最小幅を修正する。テストの幅条件を緩めず、320pxでは20px文字サイズも適用して確認する。他画面への一括overflow非表示で隠さない。

整形・型検査・lint・全体テスト・既存画面テスト全体・ビルド、および使い捨てPostgreSQLでの統合テストは標準CIの必須確認とする。最終実行結果と対象head SHAはPRのチェック/本文に記録する。DB統合には、新規操作のSHA欠落/不正/不一致、deploy後の同一操作再送、digest競合、別scope・失効、監査故障時の業務rollbackと監査1件だけの保存を含める。実装が存在することと、統合テストが成功したことを混同しない。

## 5. 未解決事項・適用範囲

- 本番反映と本番でのSHA取得・管理者操作は未実施。環境変数の欠落時は承認できないことを画面に明示する。
- 旧APIの人間申告形式は互換性のため維持し、自動来歴を保証するのはSERVER_V1モードだけ。既存APIの非互換な一括廃止はしない。
- 結果不明の操作はメモリー内に固定する従来方式を維持。ページ離脱後は状態/既存監査を照合する必要があり、新たな永続コマンドtableを作らない。
- 既存の承認用flag、準備authority、両Pilot停止条件を維持。Pilot運用画面の他の技術入力や費用・AI設定は別対象。
- 7項目の教育内容確認は、人間が何を確認したかを残すため維持。承認ボタン以外の最終確認を追加しない。

## 6. 次へ進める条件

本PRの差分、テスト、CIをレビュー後にマージする。本番反映は別途指示に従う。次の実装候補はPR-2Cの配信・接続確認の集約。対象preview、料金・秘密情報、二重送信防止を保った小さい変更に分割する。

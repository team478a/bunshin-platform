# 本番フィードバック統合 Phase 1-B 管理者画面

## 結論・調査

2026-10-12、1-A [#1258](https://github.com/team478a/bunshin-platform/pull/1258) のマージとCI verify/database SUCCESSを確認し、管理者画面の実装指示を受領。main基点は `3fb659100141ffbe88048eea17ecae3d0d9e6833`、production確認値は `e7415ad33cc1a6b17ff38c7e86028255cfe77aca`。本PRの実装はまだ本番反映済みではない。

AGENTS、正本仕様、設計原則、ロードマップ、Decision Log、Phase 0/1-A報告、既存管理者認証、Feedbackの固定週表示、公開Reader、既存e2eハーネスを照合した。元のプロジェクトcheckoutの未解決変更を操作せず、専用worktreeの `codex/feedback-overview-admin-phase1b` で作業した。

既存Service管理画面から「利用記録と改善の確認」を開き、SOCIALまたはTRAININGの保存記録を明示ボタンで読む。APIはGETのみ。自動修正・本人向け生成・課金・DB更新は行わない。自動AI分析や原因確定の画面ではない。

## 変更ファイル

- `apps/web/src/services/service-improvement-admin-preview.ts`：既存JST完了週、種類/週の限定検証、1-A DTOの再検証と件数範囲への投影、クライアント応答schema。
- `apps/web/src/services/service-improvement-admin-data.ts`：Capability/history probe、明示scopeの1-A Reader接続、本文/数値なしのHMAC読取操作ログ。
- `apps/web/src/http/service-improvement-overview.ts`、`app/api/services/[serviceSlug]/improvement-overview/route.ts`：管理者認証、入力・種類・サービス確認、private/no-storeのGET応答。
- `app/s/[serviceSlug]/manage/improvement-overview/page.tsx` と `card.tsx`：管理者専用ページ、明示読取、未判定/非表示、表示消去、注意事項。
- 管理ホームdata/repository/view-modelと管理ナビゲーション：対応Capability/historyが確認できるServiceだけに導線を追加。
- `apps/web/src/auth/line-return.ts` と認証route inventory：新画面への安全なlogin復帰pathだけを許可し、query/alias/外部URLを拒否する。管理者認可を省略する変更ではない。
- Webのpreview/HTTP/pageテスト、合成fixture、ナビゲーション負例、既存learning-uiハーネスとoverview e2e：読取・非表示・権限・小画面の検証。
- 本報告、ロードマップ、Decision Log：scope、release単位、限界を記録。

## 設計・安全条件

認証済み `SERVICE_OWNER` / `SERVICE_ADMIN` だけ。platform管理者やCONTENT_EDITORの権限を代用しない。URLのslugを既存管理者resolverで解決し、Workspace/Service/actorをサーバー側で固定する。各原本AdapterもDBで再認可する。管理画面公開可否のprobeは認可ではない。

SOCIALは既存Capability/history probe、TRAININGは同一Workspace/ServiceのAI_TRAINING_V1 Programで確認する。ブランド名から推測しない。種類は対応しているものだけ、期間は既存の完了済み直近12JST週に限定する。追加・重複query、現在週、任意期間、利用者/Bunshin、scope、取得件数の指定はAPIで拒否する。GETにOriginがあれば既存origin検証を適用し、cross-site Fetch Metadataも拒否。新CORS・秘密情報・外部Providerは追加しない。

1-Aの5人・CODE分類・boolean補集合抑制を維持し、表示は固定件数範囲（5〜9、10〜19等）。任意の重なり期間、個人filter、正確な件数、差分/率、exportを提供しない。原本集合の捕捉率、原本環境/公開SHA、AI原価、離脱率、成果、因果効果は未判定。投稿案採用と本人の投稿記録、評価READYと本人能力は区別する。少数や欠測を0へ変換しない。

これは一般公開用の匿名化保証ではない。過去の原本が更新・削除・移管されると、固定週でも再読取結果が変わる可能性がある。永久に同じsnapshotを保存する新DBは追加していない。範囲表示・固定非重複期間・管理者限定でリスクを抑制するが、他の管理画面で知った個人情報との照合や任意の外部共有は保証対象外。画面でも個人特定/転載を禁止する。匿名外部分析や凍結済み時系列比較は別設計・承認が必要。

HTTP成功では限定投影だけをserializeする。本文、個人結果、User/Bunshin/source IDを渡さない。定義版・package・期間・coverage・保留/数値の整合を確認し、未知の定義や環境帰属・率を創作した応答は取得不能にする。失敗は503等で返し、空の成功にしない。応答/ログへ生のDB例外や秘密情報を出さない。

UIは30秒で読取を中止し、選択変更・再読取・失敗・権限失効で前の集計を消す。古い選択の応答は反映しない。自動再試行/自動poll/自動取得はしない。サーバーDB読取は既存Adapterごとの上限/transaction timeoutに従い、ブラウザabortでDBが必ず即停止する保証はない。負荷・処理時間の実測は本番確認項目。

既存構造化ログに読取開始/完了/拒否/取得不能、週、種類、policy版を記録する。staffとscopeはSESSION_SECRETを用いたscope内HMACで照合可能な参照にし、個人の本文・評価結果・集計値は含めない。secret自体をログへ出さない。永続監査DB、ログの新外部転送、長期保全/保持期限は追加しない。ログの本番保存・閲覧/保持条件は運用未確認であり、監査台帳の完全性を保証しない。

## 検証

Node 24 / 指定pnpm、合成データ、外部AI呼出しなし。

- Web全体unit：478 files、3,390件成功、既存2件skip。preview・HTTP・page/server composition・ナビゲーション・login復帰負例を含む。初回全体試験で新画面のlogin復帰allowlist不足を検出し、正確なpathのみ追加して全体を再実行した。
- 既存+追加のスマートフォン幅e2e：390×844、18件成功（追加overview 5件）。横はみ出し・選択欄44px以上・明示GET・表示消去・取得失敗を確認し、スクリーンショットも目視確認した。run `01a12f8a-165a-70e0-bac5-115a3447f851`。
- Web/ハーネス型検査：成功。fixtureの故意に不正な入力と空配列推論の型エラーを修正して再実行した。
- 境界検査：成功、境界回帰テスト10件成功。
- 変更TS/TSXとE2Eハーネスのlint、変更ファイルのformat、`git diff --check`：成功。
- Web build：成功。CIと同様のダミーDB接続先とbuild専用secretでPrisma Client生成/Next buildのみ実行し、Migration・本番DB操作は行っていない。
- 隔離DB：新SQLなし。1-AのDB統合CI成功を基準とし、本PRの通常CIも維持する。

合成HTTP試験は実handlerへRequestを渡して認証/DB境界をmockする契約試験。小画面e2eは実Card+CSSを既存Viteハーネスで動かし、APIを合成応答へ置換する。実Next.jsセッション・本番DB・実ブラウザログイン・本番利用者の一連操作を確認したとは扱わない。

## 残課題・release・次の条件

本番settings、Migration、実API、実送信、課金、参加者登録、Pilot、model切替、Deployは未実施。費用/OEM機能も変更しない。一般利用者に新操作を要求せず、千ノ国メディアの既存Runtimeには接続しない。

本PRをレビュー・CI成功後にmainへマージし、1-A + 1-Bを最初の限定release単位とする。production基点に対象コミットだけを取り込み、release差分/CI/既存デプロイ手順/切戻しを確認する。main全体を無条件に反映しない。新Migrationがないことを再確認し、既存productionのmigration boundsやVercel設定を維持する。人間レビュー・マージは自動化しない。

本番反映後は既存サービスのhealthと通常動線への影響、管理者権限と保留表示、読取ログ・負荷を確認する。本番操作が必要な場合は対象/用途を明示し、顧客本文を外部へ送信しない。データ不足なら未判定のまま運用する。全Phase完成までデプロイを待たせない。

Rollbackは新ページ/API/ナビ接続をrevert/offにし、1-A Readerと既存Feedback/保持/研修原本を残す。DBを自動復旧・削除しない。次は1-Cの技術ログ相関/本番観測準備。外部AI分析・修正PR生成のPhase 2/3は別承認。

# 通常保存の理由入力削減（PR-2A）

作業日：2026-11-03 JST。基準main：`b5530bdb`（PR #1451マージ後）。[実装計画](ADMIN_SIMPLIFICATION_IMPLEMENTATION_PLAN.md)のPR-2A、監査F05/F06/F07に対応する。[判断記録](adr/ADMIN_ROUTINE_SAVE_REASON_ADR.md)を実装前に追加した。

## 1. 調査と変更

| 経路               | 改修前                                | 改修後                                                              |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------- |
| 団体プロフィール   | 保存に使われない5文字以上の理由が必須 | 理由欄と未使用検証を撤廃。同じフォーム・Server Actionで1回保存      |
| サービスの通常設定 | 文言・ロゴ・時刻だけでも理由が必須    | 理由欄なしで1回保存。HTTPが監査用reasonを補完                       |
| サービスの重要条件 | ほかの項目と一律に理由入力            | 条件を変更する場合だけ従来の理由入力を表示し、HTTPでも必須判定      |
| 週次レポート配信   | 定型の理由をUIで初期入力して送信      | 欄を廃止し、HTTPが同じ定型reasonを補完。保存回数は従来も改修後も1回 |

通常には説明・案内文・見た目・既存配信の時刻、動画スタイル・音量・声の選択などを含める。理由を残す変更は、登録受付/ログイン方法/紹介記録、法務文書の参照先、取得するプロフィール項目、企業向け提供方式、話題調査、配信有効状態・頻度/固定・提供内容・メディア方式、音声/キャラクターAIの利用有効状態である。

フォーム専用の共通関数で現在と次の条件を比較する。汎用承認エンジンや新たな管理レイヤーは作らない。UIの表示判定だけに依存せず、HTTPでも認可済みの現在設定と照合する。追加の確認ダイアログや承認段階は導入しない。

保存成功後はサーバーの返却値を比較の基準へ反映する。重要変更を保存した後の通常編集に、理由欄が残り続けることを防ぐ。API保存失敗はエラー表示にし、成功表示や比較基準の更新をしない。

週次HTTPは`request.json()`のPromiseを直接schemaへ渡していたため、JSONの値を読んでから検証するよう修正した。実際のRequestを使い、理由あり/なしの両方で保存し、返却された曜日・時刻を確認した。不正な曜日・時刻等のschemaエラーは400となり、書込を行わない。

## 2. 認可・監査・互換性

- サービスと週次HTTPはsame-origin、本人セッション、既存の管理者Context、Foundation Repositoryの認可・契約判定を維持する。団体は本人認証と同じ団体の管理者確認を維持する。
- 通常サービス更新は`サービスの基本設定を更新`、週次は従来と同じ`週次レポートの配信設定を更新`をサーバーが補完する。有効な旧clientのreasonはそのまま受理する。通常では欠落・空文字を補完し、重要条件では欠落・空白の理由を拒否する。
- Applicationのreason必須制約は維持する。既存ServiceConfigurationAuditのactor/対象/before/afterと更新の同一transactionは変更しない。監査失敗を成功として扱わない。
- 団体プロフィールのreasonは従来も保存されていない。旧FormDataのreasonを無視して受理し、新しい監査テーブルや不適切な権利監査記録を追加していない。団体プロフィールへ新規のactor差分監査を実装したとは扱わない。
- 文言・再生方法の変更で理由を省略しても、BGM素材のWorkspace/Service/所有者・READY状態等の既存確認は残る。API試験で、利用条件が同じでも利用できない素材を拒否することを確認した。
- 比較結果やreasonは、本人同意・権限・Capability・AI予算・公開承認の代替ではない。料金・権限・秘密情報の別API、実AI呼出し、配信Jobの制御は変更しない。

## 3. 変更ファイル

- `apps/web/app/(app)/organizations/[workspaceId]/manage/organization-manage-actions.ts`、同`organization-manage-view.tsx`：未使用の理由検証と入力の撤廃
- `apps/web/src/services/service-settings-reason.ts`：このフォームの変更条件比較。技術IDや証跡を管理者に入力させない
- `apps/web/src/http/service-settings.ts`：通常の理由補完、重要変更の理由必須、旧client受理
- `apps/web/app/s/[serviceSlug]/manage/settings/service-settings-editor.tsx`：条件付き理由欄、保存済み基準の更新、エラー表示
- `apps/web/src/http/service-weekly-report-delivery.ts`と同サービス管理の`weekly-report/weekly-report-delivery-editor.tsx`：理由補完、JSON読取、理由欄撤廃
- `apps/web/test/service-settings-fixture.ts`、`service-settings-reason.test.ts`、`service-routine-settings-http.test.ts`、`organization-profile-save.test.ts`：判定・保存・拒否・互換性の検証
- `scripts/test/learning-ui/routine-settings.e2e.ts`：通常→重要→通常の保存、曜日/時刻保存、エラー表示の回帰テスト
- 本報告とADR

共有ファイルの変更：`scripts/test/learning-ui/main.tsx`と`e2e.config.ts`に検証用分岐・テストを追加し、既存ケースを保持した。CSS、DECISION_LOG/ROADMAP、package exports、環境変数、DB/schema/migrationは変更していない。

## 4. 検証

- 対象9ファイル62テスト成功。理由なし保存と旧理由の受理、重要変更・空白理由の拒否、origin/本人/会員権限/スコープ偽装の拒否、素材所有の確認、団体の未認証/不正入力/別管理権限の拒否を確認した。企業向け無料の既存補正でも通常更新を妨げないことを確認し、全体検証で時間切れになった既存2ファイルも再実行して成功した。
- ローカル画面テストは1280px/390px/320pxで通常保存→重要変更の理由入力→保存後の通常編集、時刻変更、収集情報変更の理由表示、週次曜日/時刻の保存を確認した。各保存が1送信で、通常送信にreasonがないこと、横はみ出しがないことを検証する。保存拒否のエラー表示と企業向け無料の通常編集を含め5テストを既存e2eへ追加した。
- 団体フォームは別のローカル検証用Adapterで、3画面幅の理由欄なし・1回の保存操作を確認した。実際のServer Actionの認可・保存はVitestで検証した。
- 画面試験は実コンポーネント/CSSと合成データ、HTTP mock/検証用Actionを使用し、本番DB・メール・LINEへ接続していない。実AI接続や本番反映の証明ではない。最終の全体回帰結果はPR本文に記録する。

## 5. 未解決事項と次の条件

Foundationの全設定upsert・snapshot、既存の企業向け設定補正、Groupの旧MANAGER判定、同時更新のCASは今回変更しない。理由の判定はHTTPで解決した現在設定に基づくもので、Repository内の同時更新保証ではない。競合が疑われる場合は最新設定を読み直す。差分限定更新・監査書込の合理化は後続PRで扱う。

実操作時間・本番頻度は未測定。重要変更の最終確認UIの統合や、学習設計承認のSHA/証跡自動化は未実装であり、理由欄をなくしたと混同しない。本PRのレビュー後、PR-2Bの学習設計承認の来歴自動化へ進める。本番設定、deployment、migration、送信は実行していない。

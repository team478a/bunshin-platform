# OEM決済CSVの期間指定・欠落防止

## 1. 調査した内容

従来のOrganization決済ExportはACTIVE OrganizationのOWNER/ADMINまたはPlatform Adminに限定し、Workspaceで購入/サービス名を絞っていた。一方、受付期間指定がなく、最新10,000件を超える購入が黙って省略される。CSVの返金/異議申立て列は既に実装済み。

## 2. 変更したファイル

- `apps/web/src/payments/organization-payment-export-period.ts`: 共通の厳格な日付検証、日本時間の日付境界、件数上限。
- `apps/web/src/http/organization-payment-export.ts`: 日付条件、10,001件目の検出、超過時413、期間入りファイル名。不正Workspace IDも400へ分類。
- `apps/web/app/(app)/organizations/[workspaceId]/payment/organization-payment-export.tsx`: 開始/終了日、全期間取得、取得中の二重実行防止、エラー/保存先案内。成功CSVのみを端末へ保存し、一時Blob URLを解放する。
- `organization-payment-operations.tsx`: 既存CSVリンクを期間フォームへ置換。
- 関連テスト、Decision D-141、機能不足監査、ロードマップ。

## 3. 主要な設計判断

日本時間のcreatedAt受付日による絞り込みで、終了日全体を含む。CSV中の日時は従来のISO UTCのまま。入金日/返金日による会計期間集計ではない。双方未指定は全期間、片側指定/不正日付/逆順/重複/未知パラメータは400。全件が上限内の場合だけCSVを返す。上限超過は413と固定文言で期間を狭める案内を返し、CSVや個人情報・件数をエラーに含めない。認可、Workspace境界、CSV列・BOM・数式対策・金額計算は維持する。

## 4. 実行した検証

- Web関連テスト6ファイル/44件成功（日付/閏年/年境界、HTTP入力・認可・DB条件・0件/10,000件/10,001件、既存CSV金額/数式対策、画面のサーバーレンダリング）。
- 最初の実行ではCSV末尾の改行を1レコードと数えて2件失敗した。テストで末尾改行を除外して件数を確認するよう修正し、再実行は全件成功。実CSV仕様は変更していない。
- Web型検査、変更ファイルLint、git diff --check成功。初回の型検査/Lintで日付配列の未定義候補・FormData値の暗黙文字列化を検出し、固定位置の日付分解・文字列型の明示検証へ修正して再実行した。
- 最終差分の関連44件も再実行成功。全体のformat/typecheck/lint/test/build/DB統合は対象HEADのCIとPR本文を正とする。実端末でのダウンロードはこの自動検証に含まない。

## 5. 未解決事項

同期取得の最大10,000件は残る。同一受付日でも上限を超える規模では非同期/分割Exportが別途必要。CSVは決済台帳であり、決済通知更新と同時刻の会計スナップショット保証を追加していない。スマートフォンの実保存と本番反映は未検証。DB変更・Provider呼出・本番設定変更はない。

## 6. 次作業へ進める条件

この差分のテスト・型検査・Lint・Buildの成功とPRレビュー/マージ。次は無料・手動AI研修の自動期限終了を独立PRとして扱う。上限撤廃、本番Cron/保持期限削除の有効化はこの作業から推定しない。

# SNS支援開始前後7日間の行動比較

2026-11-02 / 基点 main dd9c88b2（#1434）

## 調査

既存のHassy Support Adapterは提供期間cohortの採用・完了・見送りを観測しており、既存Service Improvement Overviewへ接続済みだった。支援前後の行動比較は含まれていない。既存台帳、Collector、管理者認可、少数セル抑止、JST週選択、Rate Limit、監査ログ、no-storeを再利用した。

## 変更ファイル

- capability-social/improvement-support-outcomes.ts: SNS固有の比較指標定義。
- database/social-support-behavior-adapter.ts: 既存Intervention / MissionDecision / PostRecordを同じ読み取り専用RepeatableRead transactionで集計。
- database/service-improvement-overview.ts: 既存Overviewへ追加sourceを接続。
- Web/service-improvement-admin-preview.tsと既存card.tsx: 既存の安全な射影と5人抑止を通した件数範囲の表示。
- DB unit / composition / SQL integration、既存Web fixture、既存mobile e2eを拡張。

共有ファイルの変更: capability-social/src/index.tsとdatabase/src/index.tsへ公開exportを追記。既存SQL integration登録はそのまま使い、同じfixture内へ試験を追加。schema・migration・Cron・Flagの変更なし。

## 設計判断

[ADR](adr/SOCIAL_SUPPORT_BEHAVIOR_COMPARISON_ADR.md)を実装前に記録した。

選択週のacceptedAtを持つ支援が母集団。開始時刻を境に前後各7日（UTC経過時間）の半開区間で比較する。開始後7日未満は保留する。比較対象の前後4項目は同じ支援母集団を使い、各区間内に1回以上の行動がある支援件数を返す。Mission件数・人数・採用率・因果効果へ読み替えない。

投稿完了報告はpostedAtとcreatedAtが同じ比較区間内の場合のみ記録ありとする。遡及報告や後から変更された採用記録、開始時刻の矛盾は未判定とする。支援を伴わない行動、acceptedAtの欠損した旧支援、原本削除、採否変更の全履歴は復元しない。現在の原本からの保守的な再集計であり、不変の過去スナップショットではない。

読取上限は支援1,000件、採否/投稿原本は各10,000件。limit+1で打切りを検知し、打切りは全指標を保留する。取得はsupport / decisions / postsの3回で、支援件数に比例するDB呼出しをしない。各原本はWorkspace/Service/Bunshin/所有者を検査する。

少数セル抑止は前後4項目の同時パターンにも適用する。個人の参照・支援の本文・理由・投稿本文は画面に返さない。共通ApplicationへSNSの固定指標を追加せず、SNS定義はCapability、DB読取はAdapter、サービス非依存の安全な集計は既存Applicationに残す。

## 検証

合成データのみ使用。対象DB/Web/mobile試験、実DBの全migrationとSQL結合試験、標準format/typecheck/lint/test/buildの最終結果はPR本文とCIに記録する。

## 未解決・本番状況

実装・検証と本番反映を区別する。本番DB、実ユーザー素材、AI API、外部SNS、デプロイは操作しない。原価、障害日、未記録行動、支援による負担軽減や因果効果は未判定。最新週の支援は7日間の観測が終わるまで保留になり得る。複数支援の窓は重なる可能性があり、独立した実験標本とは扱わない。

## 次へ進む条件

本PRのCI・レビュー通過後、既存サービス固有catalogで期間・本部上限を確定できる特典から段階的な提案拡張を行う。比較画面だけで自動化の権限や原価上限を変更しない。

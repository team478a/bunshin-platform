# B2 成長画面の利用実績を1回だけ集計する

日付: 2026-11-02

## 判断

既存の認可・Service Policy・利用実績集計・ロードマップ評価を再利用し、
`GetMemberRoadmap.executeWithUsage`で、評価に実際に使った利用実績と結果を返す。
既存のexecuteはroadmapだけを返す互換投影とする。外部から集計済み実績を渡して認可を迂回する入口は作らない。

新しいGET member-growthは明示的な`member-growth-api-v1`契約で、
既存v1のusage / roadmap DTOを入れ子で返す。画面はこのAPIを1回だけ呼ぶ。
既存member-roadmap / member-usageのDTOと意味は維持する。
Hassy Policy選択はWeb、評価はApplication、SNS証拠取得は既存Database Adapterに残す。

同一scope・asOf・timezoneの利用実績を表示と評価に使う。
既存Adapterはそれぞれ読取専用トランザクションで失効を再検証するが、
2つのAdapterを横断する単一DB snapshotではない。この制約は隠さない。
両方成功するまでレスポンスを返さず、欠測・失敗を0扱いしない。

既存の共有Rate Limit、private/no-store、所有権・同意、停止・権限を維持する。
旧習慣のMission日と実操作日を統合せず、新しいDB台帳・migration・AI呼出しは追加しない。

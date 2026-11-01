# ADR: 成長ロードマップの会員向けAPI

作成日: 2026-11-02
Status: Accepted for Phase 1-B3 implementation.

- GET /api/services/[serviceSlug]/bunshins/[bunshinId]/member-roadmap を新設し、既存Application評価器と2つの読み取りAdapterをWeb composition rootで組み立てる。既存の90日計画APIと区別する。
- 利用実績APIの認証、所属・所有権確認、通知設定timezone、サーバー時刻、エラー処理を内部HTTP helperへ抽出し共用する。全query parameterは拒否する。現在の権限・同意の再検証はAdapterにも残す。
- 既存のプロセス内Rate Limitを2経路で共有する。ServiceやBunshin、APIを切り替えて同時枠・回数上限を回避できない。分散上限とは扱わない。
- public DTOは明示投影する。内部scope、原価、権限設定、投稿本文、証拠レコードを返さない。固定のstage / milestone IDを返し、操作URLを動的生成しない。
- UNKNOWNを未達成や0件に変換しない。次の候補がnullでも成功できる。これは自動化提案履歴やユーザー回答の永続化、外部操作の承認ではない。
- 使用量とContextは同じasOfで取得するが、別read-only transactionである。同一DB snapshotは保証しない。実際の操作時には既存Use Caseで現在の権限・前提を再検証する。
- 生成予算、有効紹介判定、未接続の証拠・管理設定は前PRの制約を維持する。GETで付与・消費・AI呼び出し・外部操作をしない。UI、schema、migration、本番設定は変更しない。

# マナベルスタイル: 学習・評価待ち・再開の接続

2026-10-08。基準main: `3846902fc4ba24063911a3cdc099a3d7461ee070`。

学習を契約実装だけで完了と扱わず、受講者が既存Missionの手順・ヒントを読み、自分でAIを操作し、回答・評価・復習/次の学習へ進めることを完成条件とする。

- 既存Consultation / Goal / Plan / Router / Mission / Assessment / Guided Practiceを再利用する。完成品生成、新Definition、Teaching Providerは追加しない。
- 非同期評価のPOSTがPENDINGを返した後、Pilot UIは既存の認証・Tenant・Pilot gate付きGETで結果を取得する。再訪時も同じGETから結果を復元する。
- 自動確認は最大16回・2秒間隔。GET以外を自動再送しない。停止・ページ離脱・Assignment変更時は確認を中断し、古い結果を次の課題へ表示しない。
- 時間切れ/通信失敗は合格とは扱わない。手動確認でGETを再実行できる。FAILEDの評価再実行だけは本人の明示操作で既存POSTを使用する。
- LINEは仕様§10どおり学習への入口。接続画面から既存の認証付き学習プログラム画面へ進める。LINE接続を参加権やPilot開始とみなさず、旧30日Runtime/LINE除外は維持する。
- 本番照合はread-only。Production変更、通知送信、課金API試験は行わない。本番の参加者0人と旧Deployを実装済み/稼働済みに読み替えない。

本PRは学習画面の実行・再開を完成させる。学習通知の自動配信は別の有効化/実送信確認が必要であり、稼働済みとは報告しない。

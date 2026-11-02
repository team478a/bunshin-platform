# ADR: 外部Connectorの読取PoCとAgent実行を分離する

## Status

Proposed。読取PoCの設計判断。外部公開・接続成功・本番提供を意味しない。

## Context

利用者はMUSE連携PoCの開始を依頼した。Meta Museの公式情報にCustom Connectorと正式Connectorの説明はあるが、一般向け製品の詳細な認証・MCP互換性は未検証。既存AgentRuntime設計はBUNSHINから外部Agentへ仕事を依頼する方向であり、今回の外部からの本人情報読取とは異なる。

## Decision

1. 最初の対象を本人の保存済みミッション・選択済み投稿案・利用状況の読取に限定する。採否・生成・通知・SNS公開は含めない。
2. 共通Applicationは接続許可・期限・失効・scope・監査の責務、SOCIALは投稿案/ミッション投影と利用権限、ハッシーは案内文・導線・ブランドの責務を持つ。Museの認証・transportは外側Adapter/Web compositionに置く。CoreへMuse名・Zapier型を持ち込まない。
3. Mission/Activity/利用集計を再実装せず既存Use Caseと原本を再利用する。既存HTTP sessionを外部へ渡さず、外部認可とログインを区別する。
4. 接続scopeはWorkspace/Service/Membership/User/Bunshinに固定し、実行時と応答前に現在の許可・所有権・失効を確認する。外部clientによるactorの自己指定を認めない。
5. 認可方式は実機互換確認と認証製品比較で決める。既存LINE token、規約同意、AuthReturnAttemptを外部grantへ読み替えない。新規テーブルは重複監査と設計後の独立PRで判断する。
6. 初回PoCへ汎用AgentRuntime、巨大MCP Gateway、Zapier中継、外部AI呼出しを追加しない。readから生成や閲覧イベント等のwriteを発生させない。
7. 将来のwriteにはbunshin側の対象・内容に結びついた明示承認を追加する。MuseのAlways allowや接続同意だけで採否・SNS投稿を実行しない。
8. 公式に確認できない仕様を推測実装しない。Custom Connectorの説明を正式公開の審査免除と解釈しない。解除後の過去会話・記憶の消去は別の検証項目とする。

## Consequences

既存原本と責務分離を保ったままPoCを進められる。認可・失効が未実装の段階で既存APIを外部公開しない。合成データによる検証とMuse実機互換・商用判断を別の品質ゲートとして記録する。

## References

- [調査・実装計画](../MUSE_READONLY_POC_READINESS_REPORT.md)
- [既存Agent境界](AI_AGENT_RUNTIME_BOUNDARY_ADR.md)
- [責務分離](HASSY_SHARED_CAPABILITY_BOUNDARY_ADR.md)
- [Muse公式ガイド](https://platform.muse.ai/docs)
- [Muse公式ヘルプ](https://www.meta.com/help/superintelligence/1687253048996149/)

## 2026-11-03: 認証方式に依存しないCoreの先行検証

- 初回実装は公開routeを持たないApplicationの接続grant照合・失効反映・読取制御と、既存利用集計への接続に限定する。DB保存・OAuth・接続発行UIは未実装と明示する。
- 認証済みclient/environmentは将来Adapterが与える。外部入力はconnectionId/requestIdのみで、対象scopeは保存済みgrantから解決する。
- grantは一つのMemberUsageScope、version、環境、client、有効期限、失効日時、明示許可operationを持つ。読取前後の再取得でversionを含む全項目の一致と現時点の所有権・機能権限を検証する。
- rate/concurrency制限と監査を必須Portにし、失敗時は閉じる。readにはAbortSignalを渡し、timeout後の結果は破棄する。合成Adapterはtest内だけに置き、本番保存の代用にしない。
- SNSの投稿案/ミッション投影は後続。今回の縦断対象は利用状況で、7/30日集計を再利用し、原価・scope・累計・最終利用時刻を外部応答へ含めない。

# ADR: トレンド調査をEvidence付きProvider境界として追加する

## Status

Proposed

## Context

最新の話題を使う動画企画には外部調査が必要だが、SNS無断取得、鮮度不明の情報、他者投稿の複製、「バズる」という成果保証、Provider依存のCore混入は許容できない。

## Decision

1. Coreは`TrendResearchPort`だけに依存し、検索HTTP、SDK型、raw responseをProvider Adapterへ閉じ込める。
2. 初期検証は週1回の調査結果を最大3候補へ絞り、毎日のMissionで再利用する。
3. Candidateは必ず1件以上のEvidence、取得日時、有効期限、適合理由を持つ。
4. Evidenceは短い要約と正規化URLを保存し、全文、動画、画像、コメント、個人プロフィール、raw responseを保存しない。
5. 別Workspace / User / Bunshinの入力や結果を共有しない。検索queryには内部ID、個人情報、秘密値、Knowledge全文を含めない。
6. Provider障害・期限切れ時は通常Missionへ戻し、古い候補を最新として表示しない。
7. 他者コンテンツをコピーせず、複数根拠からテーマと構成を抽象化する。
8. TikTok Research APIは資格対象が限定された非営利研究向けであるため、商用MVPの標準Providerにしない。
9. 「必ずバズる」と断定せず、「最新情報を調べた、利用者向けの企画」と表示する。
10. Provider採用はspike結果と人間レビュー後に別Decisionで確定する。

## Consequences

- 初期原価と規約リスクを抑えながら、調査企画の採用・投稿効果を検証できる。
- SNS内の完全な急上昇ランキングは取得できない場合がある。
- URL削除、期限切れ、Provider変更に対応する運用が必要になる。
- 毎日リアルタイム調査は初期FREEへ提供しない。

## References

- Exa Search / Contents API: https://exa.ai/docs/reference/search
- Firecrawl Search API: https://docs.firecrawl.dev/api-reference/endpoint/search
- YouTube Data API: https://developers.google.com/youtube/v3/docs/search/list
- TikTok Research API: https://developers.tiktok.com/products/research-api/

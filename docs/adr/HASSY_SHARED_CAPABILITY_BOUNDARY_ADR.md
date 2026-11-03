# ADR: ハッシー固有Policy・SOCIAL共通・全サービス共通を分離する

作成日: 2026-11-02
Status: Accepted for boundary design; runtime migration pending.
対象: #1414〜#1426のHassy成長ロードマップ / 有効紹介と、既存SNS継続支援・紹介・観測基盤。

## Context

member-roadmap.tsは共通Applicationに置かれているが、Hassyの5段階、SNS固定項目、MUSE / Zapierを含む。member-roadmap-context.tsはDBでHassyの既定定義を選んでいる。新しい資格判定にもSNSのactivity種別とBunshin必須scopeが含まれる。

一方で既存の質問・支援選択・ACCEPT / COMPLETE / SKIP・抑制・Scheduler・OEM支援候補と、共通Improvement / Hassy観測Adapterがある。これらを未実装として新設すると重複する。

## Decision

1. [責務表と再監査](../HASSY_SHARED_CAPABILITY_BOUNDARY_DESIGN.md)を今後の分離作業の基準とする。共通の仕組み、SNSの業務的意味、HassyのService Policyを区別する。
2. 共通Domain / Applicationへ固定SNS項目・Hassyブランド・Provider固有ガイドを必須化しない。必要な比較・状態・scope・版と既存基盤を再利用する。
3. 現在のcapability-socialからapplicationへの依存を尊重する。逆向きimportや再exportで循環を作らず、Webで認可済みServiceのPolicyを選び、DatabaseでPortを実装する。
4. profile未設定や別ServiceにHassyを暗黙適用しない。本部の上限・禁止内でOEMが条件を変更する。共通コードの再利用とデータの共有を混同しない。
5. 紹介・Credit・権限・Case / Evidence / Confirmation / SupportProgress・観測基盤を再利用する。再構築可能な履歴や派生指標を重複保存しない。
6. 既存習慣進捗と実操作日、Hassyロードマップと90日計画の意味を保つ。共通helperへ切り出しても過去の実績・判定版を黙って変えない。
7. 同じUI閲覧で行う利用集計を1回にする。既存v1公開契約は明示した移行まで維持する。実行時の再認可・予算・承認を表示で代替しない。
8. B0設計 → B1固有定義とprofile → B2重複整理 → B3紹介保存 → B4既存支援拡張 → B5観測・ガイド・限定運用の順で、独立PRと品質ゲートを置く。

## Scope

本ADRは設計判断であり、コードの移動、DB保存先の新設、migration、Service設定・Flagの変更、公開APIの廃止、本番反映を実行する承認・完了記録ではない。必要な実装範囲と検証を次の独立作業で具体化する。

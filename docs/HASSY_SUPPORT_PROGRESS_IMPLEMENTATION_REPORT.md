# HASSY SNS継続支援 状態管理 実装報告

## 1. 調査した内容

- H3-Bでは回答直後に支援を表示できる一方、画面再訪後に支援を復元できないことを確認した。
- 既存`SocialActivitySupportIntervention`の状態と日時で開始・完了・見送りを表現できるため、新規テーブルは不要と判断した。

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier-support.ts`
- `packages/database/src/social-activity-barrier-confirmation-repository.ts`
- `packages/database/test/social-activity-barrier-confirmation-repository.test.ts`
- 本人向けAPI、投稿パートナーホームdata、確認カード、UI test、CSS
- `docs/DECISION_LOG.md`

## 3. 主要な設計判断

- 未完了の`OFFERED` / `ACCEPTED`支援を再訪時に復元する。
- 本人操作を`ACCEPT` / `COMPLETE` / `SKIP`へ限定する。
- 同じ操作の再送は成功扱い、異なる終端状態への競合変更は拒否する。
- 状態取得・更新はBarrier Case Relation経由で全Scopeを照合する。

## 4. 実行した検証

- Capability Social、Database、Webのtypecheck / lint / test。
- 未完了支援の復元、完全Scope条件、完了操作の冪等性をRepository testで確認。
- スマートフォン画面の開始・完了・見送り文言とAPI境界を静的testで確認。

## 5. 未解決事項

- 確定障壁と支援状況の事業者向け集計。
- Barrier推定を定期実行するJob接続。
- 実運用前のテストServiceによる画面操作確認。

## 6. 次Phaseへ進める条件

- 状態遷移と本人向け文言をレビューする。
- 次PRでは個人回答本文を表示せず、確定Categoryと支援状態の集計だけを事業者へ提供する。

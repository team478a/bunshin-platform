# EVO-05-B: 再現Evidenceは履歴投影を優先し、Privacy接続前Gateを置く

- 日付: 2026-10-09
- 状態: Proposed（設計PRレビュー待ち、未実装）。
- 基準main: `6aaae80688ae2badce181ec7e6a20c2edfdb5f08`。

## Decision候補

EVO-05-A比較関数を直ちにUI/保存へ接続せず、まず既存Assignment/Answer/完了Event/評価監査からの認可済みread projectionとして設計する。題材は新規提示時のserver-owned Human Reviewed版固定参照だけを使い、旧履歴から推測しない。比較成功の別正本や2Answerを複製する成功ledgerは作らない。

現在のRouterにない再現課題を通常NEXTへ混在させない。明示再挑戦のpurpose、現在Plan/承認/実行Gate、Assignment/Progress競合、保持・削除・Exportを独立PRで検証する。新Definition/Teaching/Level/Providerは対象外。

所有者本人の限定INTERNAL学習は可能だが、現在の個別学習データExport/削除RepositoryはPARTICIPANTのみ。新Evidence機能を所有者本人へ接続する前のGateとして扱い、権限を管理者一般へ拡張したり、二重所属/降格で回避したりしない。既存account deletion等の別経路まで不可能とは断定せず、本書のRepository範囲の差分として報告する。

## 理由・代替案

即座のRuntime接続は、欠損題材の捏造、通常Router/Plan完了の意味変更、片側Answer削除後の再現成功取り残し、所有者本人のPrivacy経路不整合を招く。独立modelや永久Achievementでは責務が重複する。既存履歴とsource削除を再利用し、未知はUNKNOWNで止める方を採用候補とする。

## 範囲・停止

詳細・受入条件・R0〜R4分割は[EVO05B_REPRODUCTION_BRIDGE_DESIGN.md](EVO05B_REPRODUCTION_BRIDGE_DESIGN.md)。今回は文書のみ。設計PRのmergeはR0以降の実装、本番開始、保持方針変更、課題承認の許可ではない。

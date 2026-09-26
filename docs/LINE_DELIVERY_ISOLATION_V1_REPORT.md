# LINE Delivery Isolation V1 Report

## 1. 調査した内容

- Daily Mission のLINE配信準備、送信対象解決、配信履歴、再送、Deep Link発行・消費の経路を確認した。
- 共通LINE接続とOEM専用LINE接続の両方について、Workspace、Service、User、Bunshinの条件を確認した。
- `ExecuteLineMissionDelivery` が、配信レコードに保存されたWorkspace・Service・User・Bunshinをそのままrecipient解決とMission要約へ渡すことを確認した。
- Deep Linkは署名済みの短期state IDだけをURLへ含め、実際のWorkspace・Bunshin・User・MissionはDB側で保持していることを確認した。

## 2. 変更したファイル

- `packages/database/src/line-message-delivery-repository.ts`
  - 配信履歴取得時に、対象Bunshinの所有者またはWorkspace管理者であることを再検証する。
- `packages/database/src/line-mission-notification-summary-repository.ts`
  - LINEへ渡すMission要約の取得時に、対象Bunshinの所有者またはWorkspace管理者であることを再検証する。
- `packages/database/test/line-delivery-repository-isolation.test.ts`
  - 配信履歴、Mission要約、Deep Link、サービス管理者による再送の越境防止を実動作テストで固定する。

## 3. 主要な設計判断

- Application層の前段チェックだけに依存せず、Repository層も単独でfail closedにする。
- Workspaceの一般メンバーであることだけでは、別UserのBunshinへアクセスできない。
- WorkspaceのOWNER・ADMINは運用上必要な範囲でBunshinを扱える既存方針を維持する。
- OEMサービス管理者の再送は、配信時に保存された`groupId`と管理対象Serviceが一致する場合だけ許可する。
- Deep Linkにはスコープ情報を直接載せず、environment・actor・key version・expiryをDBのstateと照合する既存方式を維持する。

## 4. 実行した検証

- LINE配信Repositoryの対象テスト
- database packageのtypecheck・lint・test
- 変更ファイルのformat check
- ルートのtypecheck・lint・architecture check・test・build

## 5. 未解決事項

- 本変更は自動テストによる境界保証であり、本番LINE Providerへ実送信は行っていない。
- サービス一斉配信はWeb層で直接Prismaを利用する箇所が多く、次の作業単位でRepository/Application境界へ寄せる余地がある。

## 6. 次Phaseへ進める条件

- CIのdatabase・verifyが成功すること。
- 次はサービス一斉配信の作成、対象者確定、配信、再送、履歴出力をRepository/Application境界へまとめ、同じService分離テストを適用する。

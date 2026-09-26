# Service LINE Broadcast Boundary V1 Report

## 1. 調査した内容

- OEMサービス管理画面の一斉配信previewと予約作成経路を確認した。
- Application層に旧来の一斉配信interfaceがある一方、実際のHTTP経路はWeb層からPrismaを直接操作していることを確認した。
- 対象者抽出、専用LINE設定確認、配信本体、宛先snapshot、監査ログの境界とトランザクション範囲を確認した。

## 2. 変更したファイル

- `packages/application/src/service-line-broadcast-audience.ts`
  - 現行preview・予約作成仕様に対応するApplication ServiceとRepository Portを追加。
- `packages/database/src/service-line-broadcast-audience-repository.ts`
  - OEMサービス管理権限、対象者抽出、LINE設定、予約作成を実装。
- `apps/web/src/http/service-line-broadcasts.ts`
  - previewと予約作成から直接Prisma操作を除去し、新しいApplication/Repository境界へ接続。
- Application、Database、Webの各層へ動作テストを追加・更新。

## 3. 主要な設計判断

- HTTPで解決済みのService情報を信用するだけでなく、Repositoryでも`workspaceId`、`groupId`、`actorUserId`と`serviceRole`を再検証する。
- 配信作成時の対象者は、preview結果を再利用せず、トランザクション内で再計算する。
- 配信本体、宛先snapshot、監査ログは同じトランザクションで保存する。
- 対象者抽出は`createdAt`と`id`で順序を固定し、同じ状態なら同じ対象者集合になるようにする。
- 500人を超える場合は任意の500人を黙って配信対象にせず、対象者再確認を要求する。
- 既存の配信本文、segment条件、監査ログ形式、Job投入形式は維持する。

## 4. 実行した検証

- Application Serviceの正規化、失敗分類、確認人数検証。
- Database Repositoryの管理権限、Service分離、対象者snapshot、監査ログ、人数変更時のfail closed。
- Web previewが新しい境界へ正しいService scopeを渡すこと。
- packageおよびルートのformat、typecheck、lint、architecture、test、build。

## 5. 未解決事項

- 一斉配信の一覧・CSV出力・取消・失敗宛先再送は、まだWeb層から直接Prismaを利用している。
- 配信workerはService scopeで対象者を絞っているが、Web composition rootに大きな処理が残っている。
- 本番LINE Providerへの実送信は行っていない。

## 6. 次Phaseへ進める条件

- CIのdatabase・verifyが成功すること。
- 次は一覧・CSV出力・取消・再送をRepository/Application境界へ移し、その後配信workerを分割する。

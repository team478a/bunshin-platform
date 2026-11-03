# LINE配信予約の確認集約（PR-2C-A）

日付：2026-11-03。基準main：`da63da42`（PR #1454マージ後）。管理運用簡素化PR-2Cを小分けにし、最初は一斉配信の新規予約に限定する。本番設定・migration・deployment・実LINE公開/配信は実行しない。

## 1. 調査した内容

ServiceLineBroadcastEditor→preview/予約HTTP→ServiceLineBroadcastAudienceService→Prisma Repository→配信本体・宛先・監査→EnqueueJob→既存workerを追跡した。

従来は対象人数の手動確認、送信ボタン、ブラウザconfirmが別々で、本文・日時をまとめた確認画面がなかった。datetime-localをISO化せず送る問題、確定後のフォームreset/履歴取得の失敗を予約失敗と混同する問題もあった。Jobの冪等キーは配信ID基準だが、再操作で別IDの配信が作られると別Jobになる。

PrismaJobRepositoryはTransactionClientを受け取り、同じJob keyのupsertは既存Jobを再開/初期化しない。既存の配信UUID、監査JSON、Jobを再利用すれば、新tableや汎用承認基盤は不要と判断した。[ADR](adr/LINE_BROADCAST_CONFIRMATION_SIMPLIFICATION_ADR.md)に判断を記録した。

専用リッチメニュー公開は、外部作成・upload・公開・監査が一連で、旧confirm＋promptの置換だけで結果不明を解消できないため別PRへ分ける。配信の取消・失敗分再送も今回は変更しない。

## 2. 変更ファイル

- `apps/web/app/s/[serviceSlug]/manage/line/service-line-broadcast-editor.tsx`：対象previewの自動取得、同一ページの読取専用確認、編集へ戻る導線、確定1回、結果不明/履歴失敗の分離、古いGET応答の破棄、入力の確実なreset。
- 同`broadcast-confirmation-client.ts`：入力・preview・receiptの検証、固定した操作ID/bodyによる明示再送。本文等をブラウザの永続storageへ保存しない。
- 同`page.tsx`：認可済みServiceのdisplayNameを確認画面へ渡す。他サービスの名前を流用しない。
- `apps/web/src/http/service-line-broadcasts.ts`：新旧確認形式、server scope、即時/指定日時、新形式のJob処理を既存Repositoryへ接続。旧形式の経路は維持する。
- `packages/application/src/service-line-broadcast-audience.ts`：任意のoperationId、新形式の再送結果を既存Portへ追加。過去日時の検証は新形式の保存時に行い、登録済み操作の結果取得を妨げない。
- `packages/database/src/service-line-broadcast-audience-repository.ts`：操作ID単位のtransaction lock、入力fingerprint、同一操作の結果再利用、既存Job Repositoryでのatomic書込。
- WebのHTTP/clientテスト、既存のApplication/Database単体テスト、使い捨てDBの新しいintegration cases、既存learning-ui harnessの配信テストを使用する。

共有ファイルの変更：`apps/web/app/styles.css`へ本画面専用selectorを追加。`scripts/test/learning-ui/main.tsx`/`e2e.config.ts`と`packages/database/test/database.integration.test.ts`へテスト入口を追加する。既存CSS selector、package公開入口、環境定義、DECISION_LOG、IMPLEMENTATION_ROADMAP、Prisma schema/migrationは変更しない。

## 3. 主要な設計判断

| 操作                   | 従来                       | 新画面                                                      |
| ---------------------- | -------------------------- | ----------------------------------------------------------- |
| 対象人数取得           | 専用ボタン1回              | 内容確認時に自動preview                                     |
| 確認場所               | 入力画面とブラウザconfirm  | サービス・条件・人数・本文・日時・理由を1つの確認画面へ集約 |
| 入力後の主な操作       | 人数確認→送信→confirmの3回 | 内容確認→最終確定の2回                                      |
| 最終承認               | confirm1回                 | 明示的な確定ボタン1回                                       |
| 理由                   | 重要操作として1欄          | 維持、再入力なし                                            |
| 操作ID・技術情報の入力 | なし                       | なし、内部で自動生成                                        |
| 結果不明               | 新規予約が作られ得る       | 同一ID/bodyだけを再送                                       |

新形式ではServiceLineBroadcast.idをoperationIdとし、同一scope/actor/入力を既存SCHEDULED監査のfingerprintで照合する。同じIDで内容・理由・条件・人数・指定日時等を変えると拒否する。即時指定のhashにはサーバー現在時刻を含めず、再送時には初回の保存日時を返す。指定日時が過ぎても登録済み結果は取得でき、新規の過去日時予約は拒否する。

配信本体・宛先snapshot・監査・Jobは新形式では同じtransactionで成立またはrollbackする。JobのWorkspaceMembership確認も維持する。新形式のHTTPは別途enqueueしない。取消・完了済みの再送は状態を復活させず、Jobを追加しない。既存Jobのupsertはupdate空のため、同じJobを未実行へ戻さない。

新形式はconfirmedに`SERVICE_LINE_BROADCAST_SCHEDULE_V1`を入れ、operationIdと対にする。旧true形式はoperationIdなしで受理する。previewのcontract markerも検証する。旧サーバーが未知のIDを捨てて新規作成することを防ぐため、旧版が受理できない確認literalを使う。新しい手入力欄は増えない。

内容確認中は編集フォームを表示せず、修正へ戻ると入力を復元する。再確認では人数を再取得する。確定応答後の履歴取得が失敗した場合は、GETだけを再試行する。5xx・429・切断・不正receiptは同じ予約だけを明示再送する。4xxの確定的な拒否は、内容確認からやり直す。自動POST再試行はしない。

## 4. 検証

ローカルの重点Web HTTP/client、既存の配信preview/履歴操作、Application/Database単体テストと、PC1280px/390px/320pxの既存e2e harnessを使用する。画面の文字サイズ20pxでも確認する。画面は合成データ、外部LINE/メール/AIは呼ばない。

ローカル全体テストは25 task成功。Webは567ファイル4,204件成功（既存の実AI3件はskip）、DB単体は230ファイル1,345件成功。新画面のe2e8件が成功し、390pxの確認画面を目視確認した。最終headの成否は以下の標準CIで再確認する。

DB統合では同一IDの同時要求、宛先/監査/Jobが各1件だけであること、別内容・別Service・別actor・失効の拒否、監査・Jobの故障時rollback、権限拒否時rollback、取消後の再送、指定日時経過後の結果取得を検証する。DB試験は既存のlive disposable preflight内だけで登録する。

最終の整形・型検査・lint・全体テスト・全画面テスト・ビルド・使い捨てDB検証は標準CIで確認し、対象headと結果をPR本文/チェックへ記録する。実装の存在と検証成功を区別する。

## 5. 維持する制御・未解決事項

- 同一Origin、本人認証、Service管理権限のDB再確認、現在の接続設定と停止条件、在籍/通知同意/友だち、500人上限、保存時の人数再計算、既存workerの実行時確認と宛先別冪等性を維持する。
- previewは条件と人数の確認。同人数での参加者入替を固定する名簿承認ではない。新しい配信を意図して別IDで作ることまで、本文一致だけで禁止しない。Providerのexactly-once保証を新設したと主張しない。
- 新形式の保証は既存の配信・監査記録を保持する間の同一IDに対するもの。将来の監査保持見直しではこの依存も確認する。旧形式のAPIは従来の保存/enqueue経路を維持し、新形式の再送保証を旧形式へ拡張したとは扱わない。
- 新形式の未確定コマンドはメモリー内のみ。離脱後は履歴/既存監査の照合が必要。本文・理由・secretをlocalStorage等へ追加保存しない。
- 既存Job RepositoryはACTIVE WorkspaceMembershipを必要とする。ServiceRoleとの認可範囲の整合はPR-3Aの別対象で、一律に権限条件を外さない。新形式ではその拒否でも全体をrollbackする。
- 本番での送信・公開・設定変更、実機LINE操作、実受信は未実施。mergeを本番反映や実配信成功の証拠にしない。

## 6. 次へ進める条件

本PRの差分・標準CI・DB統合の確認後にマージする。次はPR-2C-Bとして取消・失敗分再送の確認集約、または専用リッチメニュー公開の結果確認を独立して扱う。料金・秘密情報・外部実行の保護を単なるUI削減と混同しない。

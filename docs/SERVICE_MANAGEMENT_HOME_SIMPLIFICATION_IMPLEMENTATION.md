# サービス・OEM管理ホーム整理（PR-1B）

作業日：2026-11-03 JST。基準main：`23ee4c0d`（PR #1449マージ後）。[実装計画](ADMIN_SIMPLIFICATION_IMPLEMENTATION_PLAN.md)のPR-1B、所見F02/F03/F04/F26に対応する。保存・承認・契約・予算・監査処理は変更しない。

## 1. 調査と変更

サービスホームは認可後に全サービス共通でSNS集計を行い、長い集計・準備一覧の後に26件の運営メニューを表示していた。集計1件の失敗でもホーム全体が失敗する経路だった。OEMホームでは日常の既存プロジェクトへの入口が、基本情報・運営者招待・作成フォームの後にあった。

- サービスホームはサービス名、参加者数、運用状況、要対応、運営メニューを先に表示する。
- メニューを会員・契約、配信・コンテンツ、サービス設定、詳細管理に分類し、空分類を表示しない。会員分類を初期展開し、リンク自身を操作対象にした。現行26候補は分類後も欠落・重複しない。将来の未分類リンクは詳細管理へ入る。
- 既存の研修Program判定と、同一Workspace/ServiceのSOCIAL付与・履歴の判定を利用する。研修専用では投稿・紹介・画像・動画等のSNSメニューと集計を出さない。明示的なSOCIAL併用では残す。ブランド名だけで機能を決めない。
- 研修Programも研修履歴もないサービスには「AI研修の進み具合」を出さない。共通ナレッジの案内も投稿専用の表現からサービス共通の表現へ直した。
- 研修・占いの準備一覧は共通の登録・連絡事項に限定する。研修の初回質問説明は既存方針を保持し、投稿AIやSNS機能の不足を研修開始条件として表示しない。研修内容の承認、AI利用、本番開始は既存の実践プログラムで別に判断する。
- 取得対象外の集計はPrismaを呼ばない。専用LINEがない研修専用fixtureでは、従来の28集計枠中、ナレッジ確認2枠・LINE通知3枠・共通LINE1枠の6呼び出しになる。専用LINEでは公開履歴確認が加わる。これはPrisma呼び出しの比較であり、本番SQL数・応答時間の実測ではない。
- SNSでは紹介登録を無効にしても、既存の商品投稿履歴・確認待ちを隠さない。現在の話題調査が無効でも、過去の話題利用件数は保持する。設定が使わない商品準備件数と調査Provider準備の取得だけを省く。
- OEMは団体メニューと既存プロジェクト一覧をフォームより前へ移した。一覧・入力項目を二重保存せず、同じフォームとServer Actionを利用する。新しい作成ウィザードやサービス検索APIは作らない。

## 2. 障害と権限の設計判断

[監査F02/F26](ADMIN_UX_OPERATION_AUDIT.md)の方針に従い、認可・管理対象の状態と補助集計を区別した。

1. 本人認証、管理者Contextの解決、ACTIVEな同一Workspace/ServiceのGroup取得、機能・履歴判定は集計のfallbackより前に行う。これらの失敗は伝播し、空の管理画面へ置き換えない。
2. 認可後の集計は`summary`へ分離する。集計失敗時は`null`と明示的な取得不可案内を返す。0件・準備完了・正常状態を代入しない。
3. 取得不可のときも、確認済みサービスの設定メニューと会員数は表示できる。各ページ/APIの既存認可はそのまま使う。再読み込みは通常の再読取であり、送信・更新・承認は実行しない。
4. ログはシステムがWorkspace/Serviceとエラー分類を記録する。接続文字列・例外の生メッセージ・参加者本文は記録・表示しない。

今回は集計群をまとめて「取得不可」にする。取得済みの個別数値まで一部表示する設計、任意のエラーを正常扱いする`allSettled`、新しい監査・Job・管理レイヤーは追加していない。コア状態を取得できない全面的なDB障害を、この表示整理で復旧できるとは扱わない。

## 3. 変更ファイルと再利用

- `apps/web/app/s/[serviceSlug]/manage/service-management-home-data.ts`：認可済み共通情報と任意の集計モデルを分離
- 同`service-management-home-repository.ts`：対象機能に応じた読取、集計失敗の局所化。既存queryのscopeは維持
- 同`service-management-home-view.tsx`：要対応と分類メニューを先に表示、集計不可案内、準備の折りたたみ
- 同`service-management-view-model.ts`：共通ナレッジの案内文
- `apps/web/src/services/service-management-navigation.ts`：既存26候補の分類・研修専用の絞り込み
- `apps/web/src/services/service-launch-readiness.ts`：共通準備とSNS準備の区別
- `apps/web/app/(app)/organizations/[workspaceId]/manage/organization-manage-view.tsx`：既存一覧・フォームの順序、団体内のアンカー
- `apps/web/test/service-management-navigation.test.ts`、`service-management-home-{access,repository,view}.test.ts/tsx`、`service-management-home-fixture.ts`：境界・欠損・混在・表示の検証

既存のProgram/SOCIAL判定、readiness/要対応の計算、PublicShell、details用スタイル、OEMのフォーム・Server Actionを再利用した。共有のDECISION_LOG/ROADMAP、CSS、公開package exports、環境変数、DB/migrationは変更していない。Repositoryの集計群とViewの配置変更で字下げ・移動の差分が多いが、既存APIの契約や書込処理は変えない。

## 4. 検証

- 対象9ファイル56テスト成功。認証前・管理拒否後にqueryしない、Context障害を伝播する、コアGroupの不在と障害を区別する、SOCIAL併用の履歴を残す、集計不可でも設定へ到達することを確認した。
- 既存26候補の分類漏れ・重複なし、研修専用のSNS非表示、対象外queryが呼ばれないことを確認した。
- 全体型検査（順次実行）と追加テストを含むWeb型検査、依存境界検査に成功した。最終の全体回帰結果はPR本文に記録する。
- ローカルe2eは1280px/390px/320pxの3テスト成功。実View/CSSと合成データで、研修プログラム、集計不可時の設定、SNS集計、OEMプロジェクトへの遷移と横はみ出しを確認し、PC/スマホの画像を確認した。NextのLink/Image、server-onlyマーカー、OEMのServer Actionは検証用Adapterへ置換し、更新ボタンは押していない。本番DB・メール・LINEには接続していない。

## 5. 未解決事項と次の段階

実利用頻度、操作時間、SQL数・応答時間、本番データの表示は未測定。項目を分類してスクロールを減らす一方、閉じた分類を開く操作は増えるため、全操作のクリック数を減らしたとは扱わない。既存メニューURLは保持し、画面の削除はしていない。

契約・予算・課金、Programの実行許可・承認、通常保存の理由入力、監査の書込は今回の対象外。本PRのレビュー後はPR-2A（通常保存の入力削減）へ進める。デプロイ、本番設定変更、migration、送信は行っていない。

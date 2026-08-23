# BUNSHIN UI Design Foundation

作成日: 2026-08-23

対象: BUNSHIN Platform FREE SOCIAL MVP

状態: Proposed（デザイン方向は人間確認済み、実装前仕様）

## 1. ゴール

スマートフォン利用者が迷わず、次の主要導線を完了できるUIを作る。

```text
ログイン
→ 利用条件への同意
→ Bunshin作成
→ SOCIAL有効化・戦略承認
→ 今日のMission確認
→ 採用 / 不採用
→ Copy
→ 投稿完了
→ Feedback
```

成功条件は機能一覧を見せることではなく、利用者が「今日やること」を理解し、実際の投稿行動まで進めることである。

## 2. 現状監査

### 確認した実装

- `apps/web/app/styles.css`
- Root / authenticated layout
- Login / Consent
- Bunshin一覧 / 作成Wizard
- Bunshin詳細内のSOCIAL、Knowledge、Memory、Weekly Plan、Daily Mission各Section
- Account、Validation、Platform Admin画面

### 主な課題

1. 色、余白、角丸、影、入力欄、ボタンの共通Tokenがない。
2. `main`と機能別classへCSSが直接積み上がり、画面間の一貫性が弱い。
3. 認証後の共通Header / Bottom Navigationがなく、現在位置と次の行動が分かりにくい。
4. Bunshin一覧が管理リンクの集合になっており、「今日のMission」が入口になっていない。
5. Bunshin作成Wizardの`Slug`や内部Enumなど、FREE利用者に不要な実装用語が露出している。
6. 正常、警告、エラー、空状態、処理中状態の表示規則が統一されていない。
7. 44px以上の操作領域を部分的に満たすが、全画面で保証されていない。
8. Desktop幅を縮めた構成が中心で、片手操作と画面下部の主要Actionが設計されていない。

## 3. デザイン原則

### 3.1 今日やることを最優先する

- 認証後の第一画面は機能一覧ではなく「今日のMission」とする。
- Primary Actionは各画面原則1つにする。
- 詳細設定、Knowledge、Memory、管理機能は主導線から階層を下げる。

### 3.2 AIではなく信頼できる企画担当として見せる

- ロボット、過度なSparkle、黒い未来的UIを使わない。
- 静かな色、明確な文章、進捗の見えるカードを使う。
- 生成中、生成根拠、失敗時の次の操作を平易な日本語で示す。

### 3.3 モバイルを正本にする

- 基準Viewportは375pxから430px。
- 主要操作領域は最小44px、Primary Buttonは原則48px以上。
- 操作が長い画面は下部固定Actionを使用できる構成にする。
- Safe Areaを考慮し、Bottom Navigationと本文を重ねない。

### 3.4 利用者向けと管理者向けを分離する

- FREE利用者のBottom Navigationへ管理機能を混ぜない。
- Platform Adminは同じTokenを使うが、Desktop中心の管理Shellを別に持つ。
- 内部ID、Slug、Enum名、実行環境は一般利用者へ表示しない。

## 4. ブランド表現

BUNSHINの視覚モチーフは、少しずれた2つの円とする。本人とデジタル分身の関係を表し、Logo、Avatar Placeholder、Loadingへ限定して使用する。

- 写真や人物イラストを必須にしない。
- 2円モチーフをカード背景へ大量に配置しない。
- 装飾より情報階層を優先する。

## 5. Design Tokens

### 5.1 Color

| Token                    | Value     | 用途              |
| ------------------------ | --------- | ----------------- |
| `--color-canvas`         | `#F7F5F0` | アプリ背景        |
| `--color-surface`        | `#FFFFFF` | Card / Sheet      |
| `--color-text`           | `#172033` | 主本文            |
| `--color-text-muted`     | `#667085` | 補助情報          |
| `--color-primary`        | `#5B5CE2` | Primary Action    |
| `--color-primary-strong` | `#4546C8` | Hover / Pressed   |
| `--color-accent`         | `#5EC4A6` | 進捗、肯定的補助  |
| `--color-border`         | `#E2E5EA` | 境界線            |
| `--color-success`        | `#16805C` | 成功              |
| `--color-warning`        | `#A15C00` | 注意              |
| `--color-danger`         | `#B42318` | 破壊操作 / エラー |
| `--color-focus`          | `#818CF8` | Focus Ring        |

本文と背景、ボタン文字と背景はWCAG AA以上を目標とする。色だけで状態を伝えない。

### 5.2 Typography

- Font: `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `"Noto Sans JP"`, sans-serif
- Display: 32px / 1.25 / 700
- Page title: 28px / 1.3 / 700
- Section title: 20px / 1.4 / 700
- Body: 16px / 1.7 / 400
- Small: 14px / 1.6 / 400
- Label: 14px / 1.5 / 700
- 数値は`font-variant-numeric: tabular-nums`を使用する。

### 5.3 Space / Radius / Shadow

- Space: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`
- Control radius: 12px
- Card radius: 16px
- Sheet / Dialog radius: 20px
- Pill radius: 999px
- Card shadow: `0 8px 24px rgb(23 32 51 / 8%)`
- Floating action shadow: `0 12px 32px rgb(23 32 51 / 16%)`

## 6. 共通Component

### App Shell

- `PublicShell`: Login、利用規約、プライバシー
- `AppShell`: Header、本文、Bottom Navigation
- `AdminShell`: Sidebar / Headerを持つ管理者向け
- 本文幅はモバイル100%、Tablet以降は720pxを基本とする。

### Navigation

FREE利用者のBottom Navigationは4項目とする。

1. ホーム
2. ミッション
3. 進捗
4. プロフィール

Knowledge、Bunshin設定、SNS戦略はプロフィールまたはBunshin詳細から辿る。Bunshinが1体の間は、Bunshin一覧を毎回経由させない。

### Button

- Primary: 画面の次の行動
- Secondary: 戻る、別の安全な行動
- Tertiary: 補助リンク
- Danger: 退会、Archive等。Primaryと同時に強調しない。
- Disabledは理由が分かる補助文を付ける。
- Processing中は二重送信を防ぎ、文言を動詞の進行形へ変える。

### Card

- `MissionCard`: 目的、所要時間、Platform、Primary Action
- `ProgressCard`: 数値、期間、Progress Bar
- `BunshinCard`: 名前、役割、状態、次のAction
- `NoticeCard`: info / success / warning / danger
- Card全体をclickableにする場合も、内部Buttonとの競合を避ける。

### Form

- Labelは常時表示し、placeholderだけに依存しない。
- Helper、Errorを入力欄直下へ置く。
- 入力エラー後も値を保持する。
- 内部用Slugは名前から自動生成し、一般利用者へ入力させない。
- Enumは日本語の目的ベース選択肢へ翻訳する。

### Feedback

- `InlineAlert`: 画面内で解決すべきエラー
- `Toast`: 保存完了など短時間の通知
- `EmptyState`: 状況説明と次のActionを1つ提示
- `Skeleton`: 初回読込。無限Spinnerだけを表示しない。

## 7. 主要画面

### Login

- Logo、見出し、短い説明、メール入力、Primary Buttonだけを主領域に置く。
- 成功時は「メールを確認」状態へ切り替え、再送可能時刻とメール変更を示す。
- エラーは「再試行」と「設定不備」を利用者向けに区別しすぎず、運用ログでは分類する。

### Login Confirm

- メールリンクを開いた直後に「ログインする」を明示する。
- 成功後は同意またはホームへ遷移する。
- 期限切れ時はLoginへ戻って再送できるButtonを出す。

### Consent

- 規約本文を読みやすいSheet / Accordionで表示する。
- 必須文書とversionを示す。
- 同意Checkboxと固定下部Actionを利用する。

### First Bunshin Creation

5段階は維持し、表示項目を利用者向けに変更する。

1. 名前・役割
2. 達成したいこと
3. 届けたい相手
4. 話し方・雰囲気
5. 確認

Slugと内部Type値は画面へ出さない。各Stepは1問から3問を上限とし、進捗を常時表示する。

### Home / Today

- 挨拶と現在のBunshin
- 今日のMission Card
- 所要時間、Platform、Format
- `投稿案を見る`
- 今週の投稿進捗
- Mission未生成時は生成条件と次のActionを示す。

### Mission Detail

表示順序を固定する。

1. 今日の投稿案
2. 投稿内容
3. `採用する` / `今回は使わない`
4. 採用後のFormat別Copy Action
5. `投稿しました`
6. GOOD / NEUTRAL / BAD Feedback

採用前にCopyを主Actionとして表示しない。Mission lifecycleとDecisionの違いを画面用語へ持ち込まない。

### Bunshin / SOCIAL Settings

- 通常利用時は要約を表示し、編集時のみ詳細Formを開く。
- Account Strategy、Content Pillar、Weekly Plan、Memory、Knowledgeを1ページへ縦に並べない。
- 概要、SNS戦略、発信テーマ、知識、設定の階層へ分ける。

### Profile / Account

- Bunshin切替
- Knowledge
- 通知設定
- 利用規約・プライバシー
- アカウント設定
- ログアウト
- Danger Zoneは画面末尾か別画面へ分離する。

## 8. Responsive

| 幅         | 方針                                             |
| ---------- | ------------------------------------------------ |
| 375–430px  | 正本。1列、Bottom Navigation、全幅Primary Action |
| 431–767px  | 1列、本文最大640px                               |
| 768–1023px | 主要Cardを必要に応じて2列、Navigationは維持      |
| 1024px以上 | User画面は中央寄せ、AdminのみSidebarを使用       |

Desktopでも横幅を広げすぎず、投稿文などの可読行長を70文字程度以下にする。

## 9. Accessibility

- Keyboard操作と可視Focusを必須とする。
- Icon-only Buttonにはaccessible nameを付ける。
- Errorと成功は`role="alert"`または適切なlive regionを使う。
- Heading levelを順序通りにする。
- FormはLabel、説明、Errorを関連付ける。
- Motionは200ms前後を基本とし、`prefers-reduced-motion`を尊重する。
- 重要操作をSwipeやHoverだけに依存させない。

## 10. 実装境界

本UI刷新ではPersistence、Mission / Decision / Activityの意味、Isolation、外部Provider境界を変更しない。既存Use CaseとAPIを再利用し、必要なView Modelまたはpresentation componentだけを追加する。

CSSは次の順で整理する。

1. Token
2. Reset / Base
3. Layout Shell
4. Primitive Component
5. Feature Component
6. Page固有style

CSS Modulesまたは明示的な共通classを採用し、無制限に`styles.css`へ機能固有規則を追加しない。

## 11. PR分割

### UI-0: Design Foundation（本PR）

- 本文書
- Decision Log / Roadmap更新
- コード変更なし

### UI-1: Token / Primitive / Public Auth

- Design Token
- PublicShell、Brand Mark
- Button、Input、Card、Alert
- Login、Login Confirm、Consent
- Responsive / Accessibility test

### UI-2: Authenticated App Shell

- Header
- Bottom Navigation
- Mobile Safe Area
- Profile / Accountの情報設計
- 管理者Navigationとの分離

### UI-3: Bunshin Onboarding

- Bunshin空状態
- 5-step Wizard
- Slug自動生成
- 作成完了後の正しい遷移

### UI-4: Today / Mission Experience

- Home / Today
- Mission Card / Detail
- Decision、Copy、Post、Feedbackの段階表示
- Format別表示

### UI-5: SOCIAL Settings Information Architecture

- Bunshin概要
- Account Strategy
- Content Pillar / Weekly Plan
- Knowledge / Memory
- Progressive Disclosure

### UI-6: Admin / Final QA

- AdminShell
- Validation、Legal、LINE、Deletion管理画面
- 375 / 390 / 430 / 768 / 1280px確認
- Keyboard、contrast、empty/error/loading状態

各PRで`format:check`、`lint`、`typecheck`、`test`、`build`を実行する。UI-1以降は主要画面のComponent testまたはE2E相当の回帰確認を追加する。

## 12. 人間確認済み事項

- アイボリー、濃紺、インディゴ、ミントを使う方向性
- 2円のBUNSHINモチーフ
- スマートフォン中心
- Cardと大きなPrimary Button
- Login、Home、Mission Detailのモックアップ方向

## 13. 実装前に追加確認する事項

- Brand Markを正式Logoとして採用するか、暫定UI Markとするか
- Bottom Navigationの最終文言
- Home routeを`/today`、`/`、既存routeのどれへ割り当てるか
- User画面で複数Bunshin切替をいつ表示するか

未決事項はUI-1のToken / Public Auth実装を妨げない。Home routeとNavigationはUI-2開始前に確定する。

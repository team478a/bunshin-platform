import type { FortuneTheme } from './fortune-definition';
import type { FortuneKnowledgePack } from './fortune-knowledge';
import type { FortuneOrientation, TarotCard } from './tarot';

type Guidance = { focus: string; caution: string };

const majorGuidance: Record<string, Guidance> = {
  MAJOR_00: { focus: '新しい一歩を軽やかに試す', caution: '見切り発車を避け、足元を確かめる' },
  MAJOR_01: { focus: '手元の力や道具を活かす', caution: '準備不足や空回りを一度整える' },
  MAJOR_02: { focus: '静かな直感と観察を大切にする', caution: '思い込みを離れ、事実を確かめる' },
  MAJOR_03: { focus: '豊かさを育て、受け取る', caution: '世話を抱え込み過ぎず余白を作る' },
  MAJOR_04: { focus: '方針と境界を明確にする', caution: '頑なさをゆるめ、別の意見も聞く' },
  MAJOR_05: { focus: '信頼できる知恵や基本に学ぶ', caution: '慣習だけで決めず、自分の考えを持つ' },
  MAJOR_06: { focus: '大切な価値観に沿って選ぶ', caution: '迷いの理由を言葉にして整理する' },
  MAJOR_07: { focus: '目的へ向けて力をまとめる', caution: '急ぎ過ぎず進む方向を確かめる' },
  MAJOR_08: { focus: '穏やかな強さで向き合う', caution: '感情を抑え込み過ぎず休息を取る' },
  MAJOR_09: { focus: '一人で考える静かな時間を持つ', caution: '閉じこもらず必要な助けを求める' },
  MAJOR_10: { focus: '変化の流れを受け止める', caution: '成り行き任せをやめ、選べることを見る' },
  MAJOR_11: { focus: '事実と公平さを基準に整える', caution: '一方的な判断を避け、背景も確かめる' },
  MAJOR_12: {
    focus: '立ち止まり、別の角度から見る',
    caution: '我慢だけを続けず、手放せる負担を探す',
  },
  MAJOR_13: {
    focus: '区切りを受け入れ、次へ進む',
    caution: '変化への抵抗に気づき、小さく整理する',
  },
  MAJOR_14: { focus: '違う要素をほどよく調整する', caution: '偏りを見直し、無理のない配分へ戻す' },
  MAJOR_15: {
    focus: '強い欲求や執着を正直に見つめる',
    caution: '離れにくい習慣との距離を少し取る',
  },
  MAJOR_16: {
    focus: '古い前提を見直し、立て直す',
    caution: '動揺の中で結論を急がず安全を優先する',
  },
  MAJOR_17: { focus: '小さな希望を育てる', caution: '期待と現状の差を確かめ、できることへ戻る' },
  MAJOR_18: { focus: '揺れる気持ちを丁寧に観察する', caution: '不安だけで判断せず情報を確かめる' },
  MAJOR_19: {
    focus: '明るさや達成を素直に分かち合う',
    caution: '元気に見せ続けず本音も大切にする',
  },
  MAJOR_20: {
    focus: 'これまでを振り返り、応え直す',
    caution: '過去の評価に縛られず今の選択を見る',
  },
  MAJOR_21: { focus: '一区切りの成果を受け取る', caution: '未完了を責めず、最後の一歩を整える' },
};

const suitGuidance: Record<string, { subject: string; shadow: string }> = {
  WANDS: { subject: '情熱と行動', shadow: '焦りや空回り' },
  CUPS: { subject: '感情とつながり', shadow: '感情の揺れや依存' },
  SWORDS: { subject: '思考と言葉', shadow: '考え過ぎや鋭すぎる言葉' },
  PENTACLES: { subject: '暮らしと現実的な基盤', shadow: '停滞や目先への固執' },
};

const rankGuidance: Record<string, Guidance> = {
  ACE: { focus: '新しい可能性を見つける', caution: '始める前に目的を見直す' },
  '02': { focus: '二つの選択肢のバランスを取る', caution: '迷いを急いで結論にしない' },
  '03': { focus: '協力しながら先へ育てる', caution: '周囲とのずれを確認して整える' },
  '04': { focus: '安心できる土台を作る', caution: '守ることに偏らず風通しを良くする' },
  '05': { focus: '違いや課題から学ぶ', caution: '対立や不足だけに目を奪われない' },
  '06': { focus: '前進や支えを受け取る', caution: '評価を急がず内側の納得も確かめる' },
  '07': { focus: '自分の立場を保ちながら工夫する', caution: '力み過ぎず守る範囲を選び直す' },
  '08': { focus: '流れに乗って具体的に進める', caution: '速さを落として見落としを確認する' },
  '09': { focus: '積み重ねた力を信頼する', caution: '警戒し過ぎず助けを受け入れる' },
  '10': { focus: '一区切りまで責任を持つ', caution: '抱え込みを減らし負担を分ける' },
  PAGE: { focus: '好奇心を持って知らせを受け取る', caution: '未確認の情報をそのまま信じない' },
  KNIGHT: { focus: '目標へ向けて行動を起こす', caution: '勢いを整え相手の歩調も見る' },
  QUEEN: { focus: '経験を活かして丁寧に支える', caution: '世話をし過ぎず自分の余力も守る' },
  KING: { focus: '落ち着いて方向を示す', caution: '自分だけで決めず周囲の声を聞く' },
};

const themeGuidance: Record<FortuneTheme, { label: string; reflection: string; action: string }> = {
  LOVE: {
    label: '恋愛',
    reflection: '相手の気持ちを決めつけず、自分が望む距離感と伝え方を整えてみましょう。',
    action: '今の気持ちを一文で書き、相手に伝える前に読み返しましょう。',
  },
  WORK: {
    label: '仕事',
    reflection: '抱えている課題を小さく分け、優先順位と使える助けを確かめてみましょう。',
    action: '今日取り組む作業を一つ選び、最初の10分で行うことを書きましょう。',
  },
  RELATIONSHIPS: {
    label: '人間関係',
    reflection: '相手との違いを急いで評価せず、事実と自分の受け止め方を分けて眺めてみましょう。',
    action: '最近の会話を一つ思い出し、次に相手へ確認したいことを一つ書きましょう。',
  },
};

function guidanceFor(card: TarotCard): Guidance {
  if (card.arcana === 'MAJOR') return majorGuidance[card.code]!;
  const [suit, rank] = card.code.split('_');
  const suitText = suitGuidance[suit!]!;
  const rankText = rankGuidance[rank!]!;
  return {
    focus: `${suitText.subject}について、${rankText.focus}`,
    caution: `${suitText.shadow}に気づき、${rankText.caution}`,
  };
}

export const STANDARD_FORTUNE_PROMPT_VERSION = 'fortune-standard-ja-v1';

export function buildStandardFortuneKnowledgePackFromDeck(
  deck: readonly TarotCard[],
  orientations: readonly FortuneOrientation[],
  themes: readonly FortuneTheme[],
): FortuneKnowledgePack {
  return {
    promptVersion: STANDARD_FORTUNE_PROMPT_VERSION,
    meanings: deck.flatMap((card) => {
      const guidance = guidanceFor(card);
      return orientations.flatMap((orientation) =>
        themes.map((theme) => {
          const themeText = themeGuidance[theme];
          const message = orientation === 'UPRIGHT' ? guidance.focus : guidance.caution;
          const position = orientation === 'UPRIGHT' ? '正位置' : '逆位置';
          return {
            cardCode: card.code,
            orientation,
            theme,
            title: `${themeText.label}：${message}`,
            body: `${card.nameJa}の${position}は、「${message}」という視点を示します。${themeText.reflection}`,
            actionStep: themeText.action,
          };
        }),
      );
    }),
  };
}

import { FortunePolicyError } from './fortune-policy-error';

export const FORTUNE_ORIENTATIONS = ['UPRIGHT', 'REVERSED'] as const;
export type FortuneOrientation = (typeof FORTUNE_ORIENTATIONS)[number];

export interface TarotCard {
  code: string;
  nameJa: string;
  nameEn: string;
  arcana: 'MAJOR' | 'WANDS' | 'CUPS' | 'SWORDS' | 'PENTACLES';
}

const majorArcanaDefinitions = [
  ['MAJOR_00', '愚者', 'The Fool'],
  ['MAJOR_01', '魔術師', 'The Magician'],
  ['MAJOR_02', '女教皇', 'The High Priestess'],
  ['MAJOR_03', '女帝', 'The Empress'],
  ['MAJOR_04', '皇帝', 'The Emperor'],
  ['MAJOR_05', '教皇', 'The Hierophant'],
  ['MAJOR_06', '恋人', 'The Lovers'],
  ['MAJOR_07', '戦車', 'The Chariot'],
  ['MAJOR_08', '力', 'Strength'],
  ['MAJOR_09', '隠者', 'The Hermit'],
  ['MAJOR_10', '運命の輪', 'Wheel of Fortune'],
  ['MAJOR_11', '正義', 'Justice'],
  ['MAJOR_12', '吊るされた男', 'The Hanged Man'],
  ['MAJOR_13', '死神', 'Death'],
  ['MAJOR_14', '節制', 'Temperance'],
  ['MAJOR_15', '悪魔', 'The Devil'],
  ['MAJOR_16', '塔', 'The Tower'],
  ['MAJOR_17', '星', 'The Star'],
  ['MAJOR_18', '月', 'The Moon'],
  ['MAJOR_19', '太陽', 'The Sun'],
  ['MAJOR_20', '審判', 'Judgement'],
  ['MAJOR_21', '世界', 'The World'],
] as const;

const majorArcana: readonly TarotCard[] = majorArcanaDefinitions.map(([code, nameJa, nameEn]) => ({
  code,
  nameJa,
  nameEn,
  arcana: 'MAJOR',
}));

const rankNames = [
  ['ACE', 'エース', 'Ace'],
  ['02', '2', 'Two'],
  ['03', '3', 'Three'],
  ['04', '4', 'Four'],
  ['05', '5', 'Five'],
  ['06', '6', 'Six'],
  ['07', '7', 'Seven'],
  ['08', '8', 'Eight'],
  ['09', '9', 'Nine'],
  ['10', '10', 'Ten'],
  ['PAGE', 'ペイジ', 'Page'],
  ['KNIGHT', 'ナイト', 'Knight'],
  ['QUEEN', 'クイーン', 'Queen'],
  ['KING', 'キング', 'King'],
] as const;

const suits = [
  ['WANDS', 'ワンド', 'Wands'],
  ['CUPS', 'カップ', 'Cups'],
  ['SWORDS', 'ソード', 'Swords'],
  ['PENTACLES', 'ペンタクル', 'Pentacles'],
] as const;

const minorArcana: readonly TarotCard[] = suits.flatMap(([arcana, suitJa, suitEn]) =>
  rankNames.map(([rankCode, rankJa, rankEn]) => ({
    code: `${arcana}_${rankCode}`,
    nameJa: `${suitJa}の${rankJa}`,
    nameEn: `${rankEn} of ${suitEn}`,
    arcana,
  })),
);

export const TAROT_DECK: readonly TarotCard[] = Object.freeze([...majorArcana, ...minorArcana]);

export interface SecureRandomSource {
  nextInt(maxExclusive: number): number;
}

export interface TarotDraw {
  card: TarotCard;
  orientation: FortuneOrientation;
}

const takeRandomIndex = (source: SecureRandomSource, maxExclusive: number) => {
  const value = source.nextInt(maxExclusive);
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new FortunePolicyError(
      'INVALID_RANDOM_VALUE',
      `Random source must return an integer from 0 through ${maxExclusive - 1}`,
    );
  }
  return value;
};

export function drawTarotCard(source: SecureRandomSource): TarotDraw {
  return {
    card: TAROT_DECK[takeRandomIndex(source, TAROT_DECK.length)]!,
    orientation: FORTUNE_ORIENTATIONS[takeRandomIndex(source, 2)]!,
  };
}

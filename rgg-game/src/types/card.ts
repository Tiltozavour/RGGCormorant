export type CardDeck = 'inventory' | 'momental';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type { DuelState, DuelStatus, DuelWeapon } from './duel';

export type CardAction =
  | 'discard_next_drawn'
  | 'take_next_card'
  | 'give_next_card'
  | 'promo_code_benefit'
  | 'add_coins'        // Изменение баланса (может быть отрицательным)
  | 'move_steps'       // Сдвиг по клеткам (может быть отрицательным)
  | 'extra_roll'       // Доп. бросок кубика
  | 'protection'       // Иммунитет к негативным эффектам
  | 'teleport'         // Прямой телепорт на ID клетки
  | 'teleport_to_type' // Телепорт на ближайшую клетку определенного типа
  | 'skip_turn'        // Пропуск следующего хода
  | 'steal_coins'
  | 'steal_card'
  | 'discard_card'
  | 'spin_wheel'       // Повторный запуск колеса
  | 'duel'             // Дуэль (PvP)
  | 'prize'            // Призовая карта (легендарная)
  | 'judge_coins'      // Судья душ (бросок кубика для +/- монет цели)
  | 'deal_with_mage'   // Сделка с магом (бросок кубика для эффектов)
  | 'reflect_debuff'   // Отразить дебафф (Уно реверс)
  | 'move_target_for_coins' // Передвинуть цель за монеты (Заказное)
  | 'move_target_and_self' // Двигает цель и себя (Подвинься!)
  | 'pay_or_move_back' // Заплатить или отступить (Платити налоги!)
  | 'passive_benefit'   // Пассивный бонус
  | 'fish_protection'   // Защита от игроков и отмена колеса
  | 'communism';        // Разделить монеты с другим игроком

export interface GameCard {
  id: string;          // Уникальный ID (например, inv_001)
  name: string;        // Название карты
  description: string; // Текст описания
  deck: CardDeck;      // Тип колоды
  rarity: CardRarity;  // Редкость (влияет на шанс и визуал)
  action: CardAction;  // Программный идентификатор действия
  value: number;       // Числовое значение (шаги, коины или ID клетки)
  
  // Визуальные поля
  faceCard: string;    // Путь к картинке (рубашка или арт)
  artCard?: string;    // GIF или PNG арт для лицевой стороны
  bgCard?: string | null;
  bgGradientStart?: string | null;
  bgGradientEnd?: string | null;
  price: number | null; // Цена в B-Shop (null если не продается)
  number: number;      // Порядковый номер в коллекции для удобства
  isUnique?: boolean;  // Флаг уникальности (для призовых карт)
  isWon?: boolean;     // Флаг: была ли карта уже выиграна
  winnerId?: string | null;
  howtowork?: string;  // Дополнительный текст, объясняющий механику работы карты
  requiresTarget?: boolean; // Нужно ли выбирать игрока-цель при использовании
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CardDeck = 'inventory' | 'momental';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CardAction = 
  | 'add_coins'        // Изменение баланса (может быть отрицательным)
  | 'move_steps'       // Сдвиг по клеткам (может быть отрицательным)
  | 'extra_roll'       // Доп. бросок кубика
  | 'protection'       // Иммунитет к негативным эффектам
  | 'teleport'         // Прямой телепорт на ID клетки
  | 'teleport_to_type' // Телепорт на ближайшую клетку определенного типа
  | 'skip_turn'        // Пропуск следующего хода
  | 'steal_coins'      // Украсть монеты
  | 'steal_card'       // Украсть карту
  | 'discard_card'     // Сбросить карту противника
  | 'freeze_player'    // Заморозить игрока
  | 'spin_wheel'       // Повторный запуск колеса
  | 'duel'             // Дуэль (PvP)
  | 'challenge_gaben'; // Испытание Габена

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
  bgCard: string;      // Цвет фона или градиент (HEX или CSS класс)
  artCard?: string;    // GIF или PNG арт для лицевой стороны
  bgGradientStart?: string; // Начальный цвет градиента
  bgGradientEnd?: string;   // Конечный цвет градиента
  number: number;      // Порядковый номер в коллекции для удобства
  isUnique?: boolean;  // Флаг уникальности (для призовых карт)
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardDeck = 'inventory' | 'momental';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CardAction = 
  | 'add_coins'        // Изменение баланса (может быть отрицательным)
  | 'move_steps'       // Сдвиг по клеткам (может быть отрицательным)
  | 'extra_roll'       // Доп. бросок кубика
  | 'protection'       // Иммунитет к негативным эффектам
  | 'teleport'         // Прямой телепорт на ID клетки
  | 'teleport_to_type' // Телепорт на ближайшую клетку определенного типа
  | 'skip_turn';       // Пропуск следующего хода

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
  number: number;      // Порядковый номер в коллекции для удобства
}
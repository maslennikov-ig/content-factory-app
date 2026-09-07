/**
 * Событие, которого контракту не хватило, объявленное рядом до его правки.
 *
 * `content-factory-next-tu3k.7`: экран входа молчит те несколько секунд, пока
 * числа чужого поста проверяются поиском, и человек читает это молчание как
 * зависание. Событие говорит вслух, что сейчас происходит поиск и сколько
 * запросов уйдёт.
 *
 * Живёт здесь, а не в `voice-wiring.contract.ts`, по одной причине: контракт —
 * общая правда шести потоков волны, и правит его только Z4. Этот союз
 * аддитивен и складывается с контрактным: старый читатель `IntakeEventV1` не
 * ломается, потому что не знает нового имени и пропускает строку. Перенос в
 * контракт — работа корневого сеанса; до тех пор двери и экраны берут тип
 * отсюда.
 */

import type { IntakeEventWithPieceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

export type IntakeSearchStartedEventV1 = {
  name: 'search-started';
  /**
   * Зачем ищем: `claims` — сверка чисел чужого поста, `facts` — опора для
   * мысли, у которой не нашлось ни одного факта.
   */
  reason: 'claims' | 'facts';
  /** Сколько запросов уйдёт. Экран показывает число, а не крутилку без конца. */
  count: number;
};

export type IntakeEventWithSearchV1 =
  | IntakeEventWithPieceV1
  | IntakeSearchStartedEventV1;

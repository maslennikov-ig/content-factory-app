'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';

/**
 * «Удалить» с подтверждением вторым нажатием (`content-factory-next-97dq.30`).
 *
 * Удаление заготовки необратимо, и одно нажатие для него — мало; диалог с
 * полями — много (правило владельца: меньше выбора, меньше экранов). Кнопка
 * делает это сама: первое нажатие взводит её — она краснеет и говорит
 * «Удалить насовсем?», второе удаляет. Уход фокуса или четыре секунды тишины
 * возвращают её в покой, так что случайное первое нажатие ничего не стоит.
 *
 * Одна кнопка на два места — строку списка и страницу заготовки: второй
 * рукописный экземпляр того же решения был бы дубликатом.
 */
const ARMED_MS = 4_000;

export function PieceDeleteButton({
  label,
  armedLabel,
  disabled = false,
  onConfirm,
  ...rest
}: {
  label: string;
  armedLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
} & Record<`data-${string}`, string | undefined>) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), ARMED_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  return (
    <Button
      {...rest}
      type="button"
      variant={armed ? 'destructive' : 'quiet'}
      density="dense"
      className="shrink-0"
      disabled={disabled}
      aria-pressed={armed}
      data-piece-delete-armed={armed ? 'true' : 'false'}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? armedLabel : label}
    </Button>
  );
}

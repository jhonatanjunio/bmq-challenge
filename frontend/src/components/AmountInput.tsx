/* Input de valor monetário com formatação Cleave.js */

import { useEffect, useRef } from 'react';
import Cleave from 'cleave.js';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function AmountInput({ value, onChange }: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cleaveRef = useRef<Cleave | null>(null);

  useEffect(() => {
    /* Inicializa o Cleave.js apenas uma vez */
    if (inputRef.current && !cleaveRef.current) {
      cleaveRef.current = new Cleave(inputRef.current, {
        numeral: true,
        numeralThousandsGroupStyle: 'thousand',
        numeralDecimalMark: ',',
        delimiter: '.',
        prefix: 'R$ ',
        noImmediatePrefix: true,
        rawValueTrimPrefix: true,
        numeralDecimalScale: 2,
        numeralPositiveOnly: true,
        onValueChanged: (e) => onChange(e.target.value),
      });
    }

    /* Destrói a instância ao desmontar o componente */
    return () => {
      if (cleaveRef.current) {
        cleaveRef.current.destroy();
        cleaveRef.current = null;
      }
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      className="input-dark"
      inputMode="decimal"
      placeholder="R$ 0,00"
      defaultValue={value}
    />
  );
}

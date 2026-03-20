/* Botão de copiar chave de idempotência para o campo de configuração */

import { useState } from 'react';
import { Icon } from './icons';

interface CopyKeyButtonProps {
  keyValue: string;
  onCopy: (key: string) => void;
}

export function CopyKeyButton({ keyValue, onCopy }: CopyKeyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    onCopy(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleClick}
      title="Usar esta chave no formulário"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 4,
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : '#3d4461'}`,
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.08)',
        color: copied ? '#4ade80' : '#93c5fd',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.2)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#60a5fa';
          (e.currentTarget as HTMLButtonElement).style.color = '#bfdbfe';
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.08)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#3d4461';
          (e.currentTarget as HTMLButtonElement).style.color = '#93c5fd';
        }
      }}
    >
      {copied ? <Icon.Check /> : <Icon.Clipboard />}
    </button>
  );
}

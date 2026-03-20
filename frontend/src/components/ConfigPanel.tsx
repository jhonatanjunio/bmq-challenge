/* Painel lateral de configuração dos parâmetros do pagamento */

import { useState } from 'react';
import { Icon } from './icons';
import { AmountInput } from './AmountInput';
import { generateKey } from '../utils/format';

interface ConfigPanelProps {
  idempotencyKey: string;
  onKeyChange: (key: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  loadingConcurrent: boolean;
  keepKey: boolean;
  onKeepKeyChange: (value: boolean) => void;
  onSendPayment: () => void;
  onSendConcurrent: () => void;
  onClearLogs: () => void;
}

/* Label do campo valor com ícone informativo sobre conversão em centavos */
function AmountLabel() {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, position: 'relative' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Valor
      </span>
      <button
        onClick={() => setShowInfo((s) => !s)}
        onBlur={() => setShowInfo(false)}
        style={{
          width: 16, height: 16, borderRadius: '50%', border: '1px solid #374151',
          background: showInfo ? '#1e2130' : 'transparent', color: '#4b5563',
          fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Informações sobre o valor"
      >
        i
      </button>
      {showInfo && (
        <div style={{
          position: 'absolute', top: 22, left: 0, zIndex: 10,
          background: '#1e2130', border: '1px solid #2d3348', borderRadius: 6,
          padding: '8px 12px', width: 260, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.5 }}>
            O valor informado em reais é convertido automaticamente para <strong style={{ color: '#60a5fa' }}>centavos</strong> antes
            de ser enviado ao backend (ex: R$ 100,50 = 10050). Este é o padrão utilizado por Stripe, PagBank e outros processadores de pagamento
            para evitar erros de precisão com ponto flutuante (IEEE 754).
          </p>
        </div>
      )}
    </div>
  );
}

export function ConfigPanel({
  idempotencyKey,
  onKeyChange,
  amount,
  onAmountChange,
  customerId,
  onCustomerIdChange,
  loadingConcurrent,
  keepKey,
  onKeepKeyChange,
  onSendPayment,
  onSendConcurrent,
  onClearLogs,
}: ConfigPanelProps) {

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Painel principal de configuração */}
      <div className="panel">
        <h2
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#94a3b8',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 18px',
          }}
        >
          <Icon.Settings /> Configuração
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Campo Idempotency-Key */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Idempotency-Key
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={idempotencyKey}
                onChange={(e) => onKeyChange(e.target.value)}
                className="input-dark"
                style={{ fontFamily: 'monospace', flex: 1 }}
              />
              <button
                onClick={() => onKeyChange(generateKey())}
                className="btn btn-ghost btn-sm"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}
                title="Gerar nova chave"
              >
                <Icon.RefreshCw /> Novo
              </button>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.7rem',
                color: '#4b5563',
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              <input
                type="checkbox"
                checked={keepKey}
                onChange={(e) => onKeepKeyChange(e.target.checked)}
                style={{ accentColor: '#3b82f6' }}
              />
              Manter chave após envio (para testar replay)
            </label>
          </div>

          {/* Campo Valor */}
          <div>
            <AmountLabel />
            <AmountInput value={amount} onChange={onAmountChange} />
          </div>

          {/* Campo ID do Cliente */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              ID do Cliente
            </label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => onCustomerIdChange(e.target.value)}
              className="input-dark"
            />
          </div>

          {/* Botões de ação */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
            <button
              className="btn btn-primary"
              onClick={onSendPayment}
              disabled={loadingConcurrent}
            >
              <Icon.Send /> Enviar Pagamento
            </button>

            <button
              className="btn btn-purple"
              onClick={onSendConcurrent}
              disabled={loadingConcurrent}
            >
              {loadingConcurrent ? (
                <><Icon.Spinner /> Simulando...</>
              ) : (
                <><Icon.Zap /> Simular Concorrência (3x)</>
              )}
            </button>

            <button className="btn btn-ghost" onClick={onClearLogs}>
              <Icon.Trash /> Limpar Logs
            </button>
          </div>
        </div>
      </div>

      {/* Painel de dicas de teste */}
      <div className="panel">
        <h3
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#64748b',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 14px',
          }}
        >
          <Icon.Lightbulb /> Dicas de Teste
        </h3>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <li
            style={{
              fontSize: '0.78rem',
              color: '#64748b',
              lineHeight: 1.55,
              paddingLeft: 14,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 6,
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#3b82f6',
              }}
            />
            Clique em{' '}
            <strong style={{ color: '#93c5fd' }}>Enviar Pagamento</strong> duas
            vezes com a mesma chave para ver o{' '}
            <strong style={{ color: '#a78bfa' }}>REPLAY</strong>.
          </li>
          <li
            style={{
              fontSize: '0.78rem',
              color: '#64748b',
              lineHeight: 1.55,
              paddingLeft: 14,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 6,
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#7c3aed',
              }}
            />
            Use{' '}
            <strong style={{ color: '#c084fc' }}>Simular Concorrência</strong>{' '}
            para ver o bloqueio de linha em ação.
          </li>
          <li
            style={{
              fontSize: '0.78rem',
              color: '#64748b',
              lineHeight: 1.55,
              paddingLeft: 14,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 6,
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#f59e0b',
              }}
            />
            Altere o <strong style={{ color: '#fcd34d' }}>Valor</strong> sem
            mudar a chave para provocar o erro{' '}
            <strong style={{ color: '#fb923c' }}>HTTP 409</strong> (conflito de
            payload).
          </li>
          <li
            style={{
              fontSize: '0.78rem',
              color: '#64748b',
              lineHeight: 1.55,
              paddingLeft: 14,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 6,
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#22c55e',
              }}
            />
            Use o botão de copiar ao lado da chave nos logs para reutilizá-la no formulário e testar o replay.
          </li>
        </ul>
      </div>
    </div>
  );
}

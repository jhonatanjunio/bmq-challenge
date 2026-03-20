/* Painel lateral de configuração dos parâmetros do pagamento */

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
  loadingSingle: boolean;
  loadingConcurrent: boolean;
  onSendPayment: () => void;
  onSendConcurrent: () => void;
  onClearLogs: () => void;
}

export function ConfigPanel({
  idempotencyKey,
  onKeyChange,
  amount,
  onAmountChange,
  customerId,
  onCustomerIdChange,
  loadingSingle,
  loadingConcurrent,
  onSendPayment,
  onSendConcurrent,
  onClearLogs,
}: ConfigPanelProps) {
  const isLoading = loadingSingle || loadingConcurrent;

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
          </div>

          {/* Campo Valor */}
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
              Valor (Amount)
            </label>
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
              disabled={isLoading}
            >
              {loadingSingle ? (
                <><Icon.Spinner /> Processando...</>
              ) : (
                <><Icon.Send /> Enviar Pagamento</>
              )}
            </button>

            <button
              className="btn btn-purple"
              onClick={onSendConcurrent}
              disabled={isLoading}
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

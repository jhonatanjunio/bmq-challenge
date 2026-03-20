/* Componente principal — compõe layout, estado e lógica de negócio */

import { useState, useCallback } from 'react';
import { Icon } from './components/icons';
import { LogsViewer } from './components/LogsViewer';
import { ConfigPanel } from './components/ConfigPanel';
import { LogPanel } from './components/LogPanel';
import { ToastContainer } from './components/ToastContainer';
import { useToast } from './hooks/useToast';
import { useLogs } from './hooks/useLogs';
import { sendPaymentRequest } from './services/api';
import { generateKey, parseAmountToFloat } from './utils/format';

type ViewMode = 'chronological' | 'grouped';

export function App() {
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateKey());
  const [amount, setAmount] = useState<string>('R$ 100,00');
  const [customerId, setCustomerId] = useState<string>('cust_123');
  const [viewMode, setViewMode] = useState<ViewMode>('chronological');
  const [loadingConcurrent, setLoadingConcurrent] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const { toasts, addToast, removeToast } = useToast();
  const { logs, addLog, updateLog, clearLogs, groupedLogs } = useLogs();

  /* Monta o payload a partir dos campos do formulário */
  const buildPayload = useCallback(
    () => ({
      amount: parseAmountToFloat(amount),
      customerId,
    }),
    [amount, customerId]
  );

  /* ── Envio de pagamento único — botão permanece habilitado para demonstrar idempotência ── */
  const sendPayment = async () => {
    const payload = buildPayload();
    const key = idempotencyKey;
    const logId = `log-${Date.now()}-${Math.random()}`;

    addLog({
      id: logId,
      type: 'ÚNICA',
      idempotencyKey: key,
      loading: true,
      data: null,
      httpStatus: null,
      replay: false,
      timestamp: new Date().toISOString(),
    });

    try {
      const { data, httpStatus, replay } = await sendPaymentRequest(key, payload);

      updateLog(logId, { data, httpStatus, replay });

      const status = (data as { status?: string } | null)?.status;

      if (httpStatus === 409) {
        addToast(
          'Conflito: a chave foi usada com um payload diferente.',
          'error'
        );
      } else if (httpStatus === 202 || status === 'PENDING') {
        addToast(
          'Pagamento em processamento. Pode levar até 10s.',
          'warning'
        );
      } else if (status === 'FAILED') {
        addToast(
          'Pagamento falhou (simulação do backend, 20% de chance). Erro foi persistido.',
          'warning'
        );
      } else if (status === 'SUCCESS') {
        if (replay) {
          addToast(
            'Resposta idempotente retornada (REPLAY). Mesmo resultado da requisição original.',
            'info'
          );
        } else {
          addToast('Pagamento processado com sucesso.', 'success');
        }
        /* Gera nova chave após sucesso para facilitar novos testes */
        setIdempotencyKey(generateKey());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateLog(logId, {
        data: { error: message },
        httpStatus: 'NET_ERROR',
        replay: false,
      });
      addToast('Erro de conexão. Verifique se o servidor está rodando na porta 3000.', 'error');
    }

  };

  /* ── Teste de concorrência com 3 requisições simultâneas ── */
  const sendConcurrent = async () => {
    setLoadingConcurrent(true);
    const payload = buildPayload();
    /* Todas as 3 requisições usam a mesma chave nova para demonstrar
       o cenário 1 do desafio: requisições concorrentes com mesma key
       devem resultar em apenas 1 pagamento processado */
    const concurrentKey = generateKey();

    addToast('Disparando 3 requisições simultâneas com a mesma chave...', 'info');

    const logId1 = `log-${Date.now()}-0-${Math.random()}`;
    const logId2 = `log-${Date.now()}-1-${Math.random()}`;
    const logId3 = `log-${Date.now()}-2-${Math.random()}`;

    addLog({ id: logId1, type: 'CONCORRENTE #1', idempotencyKey: concurrentKey, loading: true, data: null, httpStatus: null, replay: false, timestamp: new Date().toISOString() });
    addLog({ id: logId2, type: 'CONCORRENTE #2', idempotencyKey: concurrentKey, loading: true, data: null, httpStatus: null, replay: false, timestamp: new Date().toISOString() });
    addLog({ id: logId3, type: 'CONCORRENTE #3', idempotencyKey: concurrentKey, loading: true, data: null, httpStatus: null, replay: false, timestamp: new Date().toISOString() });

    const requests = [
      { logId: logId1, reqKey: concurrentKey },
      { logId: logId2, reqKey: concurrentKey },
      { logId: logId3, reqKey: concurrentKey },
    ];

    /* Dispara todas as requisições em paralelo */
    await Promise.all(
      requests.map(async ({ logId, reqKey }) => {
        try {
          const { data, httpStatus, replay } = await sendPaymentRequest(
            reqKey,
            payload
          );
          updateLog(logId, { data, httpStatus, replay });
          if (httpStatus === 400) {
            addToast(
              'Falha intencional simulada (20% de chance). Erro persistido para demonstração.',
              'warning'
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          updateLog(logId, {
            data: { error: message },
            httpStatus: 'NET_ERROR',
            replay: false,
          });
        }
      })
    );

    /* Gera nova chave após concorrência */
    setIdempotencyKey(generateKey());
    addToast(
      'Teste de concorrência concluído. Verifique se todos os resultados são idênticos.',
      'success'
    );
    setLoadingConcurrent(false);
  };

  /* Limpa todos os logs e notifica o usuário */
  const handleClearLogs = () => {
    clearLogs();
    addToast('Logs removidos.', 'info');
  };

  /* Copia uma chave para o campo de configuração */
  const handleCopyKey = useCallback(
    (key: string) => {
      setIdempotencyKey(key);
      addToast('Chave copiada para o campo de configuração.', 'info');
    },
    [addToast]
  );

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{ backgroundColor: '#0f1117' }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Cabeçalho */}
        <header
          style={{
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Ícone do sistema */}
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: '#161922', border: '1px solid #1e2436',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', fontWeight: 800, color: '#3b82f6',
              position: 'relative', fontFamily: 'system-ui',
            }}>
              $
              <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: '#f1f5f9',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Sistema de Pagamentos
              </h1>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: '#4b5563',
                  margin: '3px 0 0',
                  letterSpacing: '0.02em',
                }}
              >
                Simulador de Idempotência e Concorrência
              </p>
            </div>
          </div>
          {/* Botão de observabilidade + indicador */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setShowLogs(true)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.72rem', gap: 5 }}
            >
              <Icon.Logs /> Observabilidade
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 6px #22c55e',
                }}
              />
              <span style={{ fontSize: '0.68rem', color: '#4b5563' }}>
                localhost:3000
              </span>
            </div>
          </div>
        </header>

        {/* Conteúdo principal — alterna entre simulador e observabilidade */}
        {showLogs ? (
          <LogsViewer onClose={() => setShowLogs(false)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Coluna lateral — configuração */}
            <div className="lg:col-span-1">
              <ConfigPanel
                idempotencyKey={idempotencyKey}
                onKeyChange={setIdempotencyKey}
                amount={amount}
                onAmountChange={setAmount}
                customerId={customerId}
                onCustomerIdChange={setCustomerId}
                loadingConcurrent={loadingConcurrent}
                onSendPayment={sendPayment}
                onSendConcurrent={sendConcurrent}
                onClearLogs={handleClearLogs}
              />
            </div>

            {/* Coluna principal — logs */}
            <div className="lg:col-span-2">
              <LogPanel
                logs={logs}
                groupedLogs={groupedLogs}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onCopyKey={handleCopyKey}
              />
            </div>
          </div>
        )}

        {/* Sistema de notificações */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    </div>
  );
}

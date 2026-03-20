/* Visualizador de logs de observabilidade com filtros */

import { useState, useEffect, useCallback } from 'react';
import { Icon } from './icons';
import { JsonHighlight } from './JsonHighlight';

interface AuditLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  correlationId: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
  source: string | null;
}

interface LogsResponse {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface LogsViewerProps {
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL?.replace('/payments', '') || 'http://localhost:3000/api/v1';

const LEVEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  INFO: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa', dot: '#3b82f6' },
  WARN: { bg: 'rgba(234,179,8,0.1)', text: '#facc15', dot: '#eab308' },
  ERROR: { bg: 'rgba(239,68,68,0.1)', text: '#f87171', dot: '#ef4444' },
};

/* Linha de log expansível — clique para ver o payload completo */
function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const lc = LEVEL_COLORS[log.level] || LEVEL_COLORS.INFO;
  const time = new Date(log.timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const date = new Date(log.timestamp).toLocaleDateString('pt-BR');
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <div
      style={{
        background: lc.bg,
        borderLeft: `3px solid ${lc.dot}`,
        borderRadius: 5,
        overflow: 'hidden',
        cursor: hasMetadata ? 'pointer' : 'default',
      }}
      onClick={() => hasMetadata && setExpanded((e) => !e)}
    >
      <div style={{ padding: '8px 12px', fontSize: '0.74rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: lc.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {log.level}
          </span>
          <span style={{ color: '#64748b', fontWeight: 500 }}>
            {log.message}
          </span>
          {hasMetadata && (
            <span style={{ color: '#2d3348', display: 'inline-flex', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
              <Icon.ChevronRight />
            </span>
          )}
          <span style={{ marginLeft: 'auto', color: '#374151', fontSize: '0.65rem', flexShrink: 0 }}>
            {date} {time}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {log.source && (
            <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>
              fonte: <span style={{ color: '#64748b' }}>{log.source}</span>
            </span>
          )}
          {log.idempotencyKey && (
            <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>
              key: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{log.idempotencyKey}</span>
            </span>
          )}
          {log.correlationId && log.correlationId !== log.idempotencyKey && (
            <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>
              correlação: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{log.correlationId}</span>
            </span>
          )}
        </div>
      </div>
      {expanded && hasMetadata && (
        <div style={{ padding: '0 12px 10px', maxHeight: 200, overflowY: 'auto' }}>
          <JsonHighlight data={log.metadata} />
        </div>
      )}
    </div>
  );
}

export function LogsViewer({ onClose }: LogsViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (level) params.set('level', level);
      if (idempotencyKey.trim()) params.set('idempotencyKey', idempotencyKey.trim());

      const res = await fetch(`${API_BASE}/logs?${params}`);
      const json: LogsResponse = await res.json();
      setLogs(json.data);
      setTotal(json.pagination.total);
      setTotalPages(json.pagination.totalPages);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }, [page, level, idempotencyKey]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  /* Reseta página ao mudar filtros */
  const handleLevelChange = (v: string) => { setLevel(v); setPage(1); };
  const handleKeyChange = (v: string) => { setIdempotencyKey(v); setPage(1); };

  return (
    <div
      className="panel"
      style={{
        height: 'calc(100vh - 140px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Cabeçalho */}
      <div style={{
        paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #1e2436',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 10px', fontSize: '0.7rem', gap: 4 }}
          >
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon.ChevronRight /></span> Voltar
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
              Observabilidade
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#4b5563' }}>
              {total} registros persistidos
            </p>
          </div>
        </div>
      </div>

        {/* Filtros */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid #1e2436',
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['', 'INFO', 'WARN', 'ERROR'].map((lv) => (
              <button
                key={lv}
                onClick={() => handleLevelChange(lv)}
                style={{
                  padding: '4px 10px', borderRadius: 5, fontSize: '0.7rem',
                  fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: level === lv ? '#1e2130' : 'transparent',
                  color: level === lv ? '#e2e8f0' : '#4b5563',
                  transition: 'all 0.15s',
                }}
              >
                {lv || 'Todos'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Filtrar por Idempotency-Key..."
            value={idempotencyKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="input-dark"
            style={{ flex: 1, minWidth: 180, padding: '5px 10px', fontSize: '0.72rem' }}
          />
          <button
            onClick={fetchLogs}
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 10px', fontSize: '0.68rem' }}
          >
            <Icon.RefreshCw /> Atualizar
          </button>
        </div>

        {/* Lista de logs */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#4b5563' }}>
              <Icon.SpinnerLg />
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#374151', fontSize: '0.82rem' }}>
              Nenhum log encontrado com os filtros atuais.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div style={{
            padding: '10px 20px', borderTop: '1px solid #1e2436',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={{ padding: '3px 10px', fontSize: '0.68rem' }}
            >
              Anterior
            </button>
            <span style={{ fontSize: '0.72rem', color: '#4b5563' }}>
              {page} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: '3px 10px', fontSize: '0.68rem' }}
            >
              Próximo
            </button>
          </div>
        )}
    </div>
  );
}

/* Área de logs com alternância entre visualização cronológica e agrupada */

import { useState } from 'react';
import { Icon } from './icons';
import { LogCard } from './LogCard';
import { GroupCard } from './GroupCard';
import type { LogEntry } from '../types';

type ViewMode = 'chronological' | 'grouped';

interface GroupedLog {
  key: string;
  logs: LogEntry[];
}

interface LogPanelProps {
  logs: LogEntry[];
  groupedLogs: GroupedLog[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onCopyKey: (key: string) => void;
}

export function LogPanel({
  logs,
  groupedLogs,
  viewMode,
  onViewModeChange,
  onCopyKey,
}: LogPanelProps) {
  /* Controle global de expansão/colapso dos cards agrupados */
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);

  return (
    <div
      className="panel"
      style={{
        height: 'calc(100vh - 140px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Cabeçalho com contador, toggle e controles de colapso */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#94a3b8',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <Icon.Logs />
          Logs de Resposta
          {logs.length > 0 && (
            <span
              className="badge"
              style={{
                background: 'rgba(59,130,246,0.15)',
                color: '#60a5fa',
                fontSize: '0.65rem',
              }}
            >
              {logs.length}
            </span>
          )}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Botões expandir/recolher (visível apenas no modo agrupado) */}
          {viewMode === 'grouped' && logs.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginRight: 6 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setExpandSignal((s) => s + 1)}
                title="Expandir todos"
                style={{ padding: '3px 8px', fontSize: '0.68rem' }}
              >
                Expandir
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCollapseSignal((s) => s + 1)}
                title="Recolher todos"
                style={{ padding: '3px 8px', fontSize: '0.68rem' }}
              >
                Recolher
              </button>
            </div>
          )}

          {/* Toggle de modo de visualização */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              background: '#0d0f18',
              borderRadius: 7,
              padding: 3,
              border: '1px solid #1e2436',
            }}
          >
            <button
              className={`view-tab${viewMode === 'chronological' ? ' active' : ''}`}
              onClick={() => onViewModeChange('chronological')}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Icon.List /> Cronológico
            </button>
            <button
              className={`view-tab${viewMode === 'grouped' ? ' active' : ''}`}
              onClick={() => onViewModeChange('grouped')}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Icon.GitBranch /> Agrupado
            </button>
          </div>
        </div>
      </div>

      {/* Lista de logs com scroll interno fixo */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingRight: 4,
          minHeight: 0,
        }}
      >
        {logs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              minHeight: 280,
              color: '#374151',
              gap: 14,
            }}
          >
            <Icon.Inbox />
            <div style={{ textAlign: 'center' }}>
              <p
                style={{
                  color: '#374151',
                  fontWeight: 600,
                  margin: '0 0 4px',
                  fontSize: '0.88rem',
                }}
              >
                Nenhuma requisição enviada
              </p>
              <p style={{ color: '#2d3348', fontSize: '0.76rem', margin: 0 }}>
                Configure os parâmetros e clique em Enviar Pagamento
              </p>
            </div>
          </div>
        ) : viewMode === 'chronological' ? (
          logs.map((log) => (
            <LogCard key={log.id} log={log} onCopyKey={onCopyKey} />
          ))
        ) : (
          groupedLogs.map((group) => (
            <GroupCard
              key={group.key}
              groupKey={group.key}
              logs={group.logs}
              onCopyKey={onCopyKey}
              collapseSignal={collapseSignal}
              expandSignal={expandSignal}
            />
          ))
        )}
      </div>
    </div>
  );
}

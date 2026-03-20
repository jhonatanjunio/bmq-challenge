/* Card de grupo de requisições agrupadas por chave de idempotência */

import { useState, useEffect } from 'react';
import { Icon } from './icons';
import { CopyKeyButton } from './CopyKeyButton';
import { TimelineNode } from './TimelineNode';
import { formatTime, formatCurrency } from '../utils/format';
import type { LogEntry } from '../types';

interface GroupCardProps {
  groupKey: string;
  logs: LogEntry[];
  onCopyKey: (key: string) => void;
  collapseSignal: number;
  expandSignal: number;
}

export function GroupCard({ groupKey, logs, onCopyKey, collapseSignal, expandSignal }: GroupCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  /* Reage aos sinais globais de expandir/recolher */
  useEffect(() => { if (collapseSignal > 0) setCollapsed(true); }, [collapseSignal]);
  useEffect(() => { if (expandSignal > 0) setCollapsed(false); }, [expandSignal]);

  const firstLog = logs[0];
  const baseTimestamp = firstLog?.timestamp ?? '';
  const firstData = firstLog?.data as { transaction?: { amount?: number } } | null;
  const amount = firstData?.transaction?.amount;

  const hasSuccess = logs.some((l) => (l.data as { status?: string } | null)?.status === 'SUCCESS');
  const hasFailed = logs.some((l) => (l.data as { status?: string } | null)?.status === 'FAILED');
  const hasPending = logs.some((l) => (l.data as { status?: string } | null)?.status === 'PENDING' || l.httpStatus === 202);
  const hasConflict = logs.some((l) => l.httpStatus === 409);
  const hasReplay = logs.some((l) => l.replay);

  let summaryColor = '#6b7280';
  if (hasSuccess) summaryColor = '#22c55e';
  else if (hasFailed) summaryColor = '#ef4444';
  else if (hasPending) summaryColor = '#eab308';
  else if (hasConflict) summaryColor = '#f97316';

  return (
    <div
      className="card-enter"
      style={{
        background: '#161922',
        border: '1px solid #1e2436',
        borderLeft: `3px solid ${summaryColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        maxHeight: collapsed ? 'auto' : 310,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Cabeçalho do grupo */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid #1e2436',
          cursor: 'pointer',
          padding: '10px 14px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              color: '#374151',
              transition: 'transform 0.2s',
              transform: collapsed ? 'none' : 'rotate(90deg)',
              display: 'inline-flex',
              flexShrink: 0,
            }}
          >
            <Icon.ChevronRight />
          </span>

          {/* Chave + botão copiar juntos */}
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {groupKey}
          </span>
          <CopyKeyButton keyValue={groupKey} onCopy={onCopyKey} />

          {/* Espaçador */}
          <span style={{ flex: 1 }} />

          {/* Badges e metadados */}
          {hasReplay && (
            <span className="badge" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', fontSize: '0.62rem' }}>
              REPLAY
            </span>
          )}
          <span className="badge" style={{ background: `${summaryColor}15`, color: summaryColor, fontSize: '0.62rem' }}>
            {logs.length} req.
          </span>
          {amount !== undefined && (
            <span style={{ fontSize: '0.68rem', color: '#4b5563', fontFamily: 'monospace', flexShrink: 0 }}>
              {formatCurrency(amount)}
            </span>
          )}
          {baseTimestamp && (
            <span style={{ fontSize: '0.65rem', color: '#374151', flexShrink: 0 }}>
              {formatTime(baseTimestamp)}
            </span>
          )}
        </div>
      </button>

      {/* Conteúdo da timeline com scroll próprio e altura fixa */}
      {!collapsed && (
        <div style={{ padding: '10px 14px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {logs.map((log, idx) => (
            <TimelineNode
              key={log.id}
              log={log}
              baseTimestamp={baseTimestamp}
              isLast={idx === logs.length - 1}
              onCopyKey={onCopyKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

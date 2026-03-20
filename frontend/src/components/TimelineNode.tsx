/* Nó individual dentro da timeline de um grupo de chave */

import { useState } from 'react';
import { Icon } from './icons';
import { JsonHighlight } from './JsonHighlight';
import { getStatusConfig } from '../utils/status';
import { formatTime, relativeTime, formatCurrency } from '../utils/format';
import type { LogEntry } from '../types';

interface TimelineNodeProps {
  log: LogEntry;
  baseTimestamp: string;
  isLast: boolean;
  onCopyKey: (key: string) => void;
}

export function TimelineNode({
  log,
  baseTimestamp,
  isLast,
  onCopyKey: _onCopyKey,
}: TimelineNodeProps) {
  const cfg = getStatusConfig(log);
  const isReplay = log.replay;
  const [expanded, setExpanded] = useState(false);
  const data = log.data as { status?: string; transaction?: { amount?: number } } | null;
  const amount = data?.transaction?.amount;

  /* Cor do dot baseada no status */
  let dotColor = cfg.dot;
  if (log.loading) dotColor = '#3b82f6';
  else if (data?.status === 'PENDING') dotColor = '#eab308';
  else if (isReplay) dotColor = '#a78bfa';
  else if (data?.status === 'SUCCESS') dotColor = '#22c55e';
  else if (data?.status === 'FAILED') dotColor = '#ef4444';
  else if (log.httpStatus === 409) dotColor = '#f97316';
  else if (log.httpStatus === 'NET_ERROR') dotColor = '#ef4444';

  return (
    <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
      {/* Coluna da timeline — dot simples + linha */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
          width: 12,
          paddingTop: 6,
        }}
      >
        {/* Dot simples */}
        {log.loading ? (
          <div style={{ color: dotColor, flexShrink: 0 }}>
            <Icon.Spinner />
          </div>
        ) : (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
        )}
        {/* Linha conectora */}
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: 1,
              background: '#2d3348',
              minHeight: 12,
            }}
          />
        )}
      </div>

      {/* Conteúdo do nó */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 8 }}>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <div
            style={{
              background: expanded ? '#0d0f18' : 'transparent',
              border: expanded ? '1px solid #1e2436' : '1px solid transparent',
              borderRadius: 5,
              padding: '5px 8px',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {log.type}
              </span>

              {isReplay && (
                <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#a78bfa', opacity: 0.8 }}>
                  REPLAY
                </span>
              )}

              <span style={{ fontSize: '0.6rem', color: cfg.badgeColor, fontWeight: 600, opacity: 0.7 }}>
                {cfg.label}
              </span>

              {/* Tempo relativo */}
              {log.timestamp && (
                <span style={{ fontSize: '0.62rem', color: '#374151', marginLeft: 'auto' }}>
                  {baseTimestamp && log.timestamp !== baseTimestamp
                    ? relativeTime(baseTimestamp, log.timestamp)
                    : formatTime(log.timestamp)}
                </span>
              )}

              {amount !== undefined && !log.loading && (
                <span style={{ fontSize: '0.62rem', color: '#4b5563', fontFamily: 'monospace' }}>
                  {formatCurrency(amount)}
                </span>
              )}

              <span style={{ color: '#2d3348', display: 'inline-flex', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
                <Icon.ChevronRight />
              </span>
            </div>

            {log.loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#60a5fa', marginTop: 4 }}>
                <span style={{ fontSize: '0.7rem' }}>Aguardando resposta...</span>
              </div>
            )}
          </div>
        </button>

        {/* JSON expandido com scroll próprio */}
        {expanded && !log.loading && (
          <div style={{ marginTop: 4, paddingLeft: 4, maxHeight: 200, overflowY: 'auto' }}>
            <JsonHighlight data={log.data} />
          </div>
        )}
      </div>
    </div>
  );
}

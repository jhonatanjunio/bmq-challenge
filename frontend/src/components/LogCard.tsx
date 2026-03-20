/* Card de log no modo de visualização cronológica */

import { Icon } from './icons';
import { CopyKeyButton } from './CopyKeyButton';
import { JsonHighlight } from './JsonHighlight';
import { getStatusConfig } from '../utils/status';
import { formatTime, formatCurrency } from '../utils/format';
import type { LogEntry } from '../types';

interface LogCardProps {
  log: LogEntry;
  onCopyKey: (key: string) => void;
}

export function LogCard({ log, onCopyKey }: LogCardProps) {
  const cfg = getStatusConfig(log);
  const isReplay = log.replay;
  const data = log.data as { transaction?: { amount?: number } } | null;
  const amount = data?.transaction?.amount;

  return (
    <div
      className="card-enter"
      style={{
        background: '#161922',
        border: '1px solid #1e2436',
        borderLeft: `4px solid ${cfg.borderColor}`,
        borderRadius: 8,
        padding: '14px 16px',
        position: 'relative',
      }}
    >
      {/* Linha superior: tipo + chave(+cópia) + tempo + valor + badges */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Rótulo do tipo */}
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#6b7280',
            flexShrink: 0,
          }}
        >
          {log.type}
        </span>

        {/* Chave de idempotência + botão de cópia lado a lado */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'monospace',
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {log.idempotencyKey}
          </span>
          <CopyKeyButton keyValue={log.idempotencyKey} onCopy={onCopyKey} />
        </span>

        {/* Horário */}
        {log.timestamp && (
          <span
            style={{
              fontSize: '0.7rem',
              color: '#4b5563',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {formatTime(log.timestamp)}
          </span>
        )}

        {/* Valor */}
        {amount !== undefined && !log.loading && (
          <span
            style={{
              fontSize: '0.7rem',
              color: '#64748b',
              fontFamily: 'monospace',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {formatCurrency(amount)}
          </span>
        )}

        {/* Badges direitos */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          {isReplay && (
            <span
              className="badge"
              style={{
                background: 'rgba(139,92,246,0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(139,92,246,0.3)',
              }}
            >
              <Icon.Replay /> REPLAY
            </span>
          )}
          <span
            className="badge"
            style={{ background: cfg.badgeBg, color: cfg.badgeColor }}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Corpo: spinner ou JSON */}
      {log.loading ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#60a5fa' }}
        >
          <Icon.SpinnerLg />
          <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            Aguardando resposta do servidor...
          </span>
        </div>
      ) : (
        <JsonHighlight data={log.data} />
      )}
    </div>
  );
}

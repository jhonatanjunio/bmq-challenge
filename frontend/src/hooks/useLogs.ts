/* Hook de gerenciamento dos logs de requisição */

import { useState, useCallback, useMemo } from 'react';
import type { LogEntry } from '../types';

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  /* Adiciona uma nova entrada no topo da lista */
  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [entry, ...prev]);
    return entry.id;
  }, []);

  /* Atualiza uma entrada existente pelo id */
  const updateLog = useCallback(
    (id: string, patch: Partial<Omit<LogEntry, 'id'>>) => {
      setLogs((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, ...patch, loading: false } : l
        )
      );
    },
    []
  );

  /* Remove todos os logs */
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  /* Agrupa logs por chave de idempotência, mais recente primeiro */
  const groupedLogs = useMemo(() => {
    const map: Record<string, LogEntry[]> = {};
    const order: string[] = [];

    for (const log of [...logs].reverse()) {
      if (!map[log.idempotencyKey]) {
        map[log.idempotencyKey] = [];
        order.push(log.idempotencyKey);
      }
      map[log.idempotencyKey].push(log);
    }

    /* Inverte para que o grupo mais recente apareça primeiro */
    return order.reverse().map((k) => ({ key: k, logs: map[k] }));
  }, [logs]);

  return { logs, addLog, updateLog, clearLogs, groupedLogs };
}

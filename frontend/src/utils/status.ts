/* Mapeamento de status de log para configurações visuais */

import type { LogEntry, StatusConfig } from '../types';

export function getStatusConfig(log: LogEntry): StatusConfig {
  /* Estado de carregamento */
  if (log.loading) {
    return {
      borderColor: '#3b82f6',
      badgeBg: 'rgba(59,130,246,0.15)',
      badgeColor: '#60a5fa',
      label: 'PROCESSANDO',
      dot: '#3b82f6',
    };
  }

  const data = log.data as { status?: string } | null;
  const s = data?.status;

  /* Conflito de payload ou erro de negócio */
  if (log.httpStatus === 409 || s === 'ERROR') {
    return {
      borderColor: '#f97316',
      badgeBg: 'rgba(249,115,22,0.15)',
      badgeColor: '#fb923c',
      label: `HTTP ${log.httpStatus ?? '409'}`,
      dot: '#f97316',
    };
  }

  /* Pagamento pendente / processando assincronamente */
  if (log.httpStatus === 202 || s === 'PENDING') {
    return {
      borderColor: '#eab308',
      badgeBg: 'rgba(234,179,8,0.15)',
      badgeColor: '#facc15',
      label: 'PENDENTE',
      dot: '#eab308',
    };
  }

  /* Pagamento falhou (simulação backend) */
  if (s === 'FAILED') {
    return {
      borderColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.15)',
      badgeColor: '#f87171',
      label: `HTTP ${log.httpStatus}`,
      dot: '#ef4444',
    };
  }

  /* Erro de rede / sem resposta */
  if (log.httpStatus === 'NET_ERROR') {
    return {
      borderColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.15)',
      badgeColor: '#f87171',
      label: 'ERRO REDE',
      dot: '#ef4444',
    };
  }

  /* Pagamento processado com sucesso */
  if (s === 'SUCCESS') {
    return {
      borderColor: '#22c55e',
      badgeBg: 'rgba(34,197,94,0.15)',
      badgeColor: '#4ade80',
      label: `HTTP ${log.httpStatus}`,
      dot: '#22c55e',
    };
  }

  /* Fallback genérico */
  return {
    borderColor: '#6b7280',
    badgeBg: 'rgba(107,114,128,0.15)',
    badgeColor: '#9ca3af',
    label: `HTTP ${log.httpStatus}`,
    dot: '#6b7280',
  };
}

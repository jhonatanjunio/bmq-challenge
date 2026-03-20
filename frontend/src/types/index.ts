/* Tipos centrais da aplicação de pagamentos */

export interface LogEntry {
  id: string;
  type: string;
  idempotencyKey: string;
  loading: boolean;
  data: unknown;
  httpStatus: number | string | null;
  replay: boolean;
  timestamp: string;
}

export interface Toast {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'warning' | 'info';
  leaving: boolean;
}

export interface StatusConfig {
  borderColor: string;
  badgeBg: string;
  badgeColor: string;
  label: string;
  dot: string;
}

/* Formato esperado da resposta de pagamento */
export interface PaymentData {
  status?: 'SUCCESS' | 'FAILED' | 'PENDING';
  transaction?: {
    amount?: number;
  };
  error?: string;
  [key: string]: unknown;
}

/* Utilitários de formatação de dados */

/* Gera uma chave aleatória para idempotência */
export const generateKey = (): string =>
  'key-' + Math.random().toString(36).substring(2, 10);

/* Converte centavos para string de moeda brasileira */
export const formatCurrency = (centavos: number): string => {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

/* Calcula tempo relativo entre dois timestamps ISO */
export const relativeTime = (baseISO: string, targetISO: string): string => {
  const diff = Math.round(
    (new Date(targetISO).getTime() - new Date(baseISO).getTime()) / 1000
  );
  if (diff === 0) return 'agora';
  if (diff === 1) return '1s depois';
  if (diff < 60) return `${diff}s depois`;
  return `${Math.floor(diff / 60)}min depois`;
};

/* Formata um timestamp ISO para hora legível */
export const formatTime = (iso: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/* Converte valor mascarado pelo Cleave.js para número decimal */
export const parseAmountToFloat = (maskedValue: string): number => {
  if (!maskedValue) return 0;
  return (
    parseFloat(
      maskedValue
        .replace(/[^\d,]/g, '')
        .replace(',', '.')
    ) || 0
  );
};

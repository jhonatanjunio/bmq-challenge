/* Hook de gerenciamento do sistema de toasts */

import { useState, useCallback, useEffect } from 'react';
import type { Toast } from '../types';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /* Remove um toast pelo id, com animação de saída */
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => {
      /* Evita acionar a animação duas vezes */
      if (prev.find((t) => t.id === id && t.leaving)) return prev;
      return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 400);
  }, []);

  /* Adiciona um novo toast, respeitando limite máximo de 5 */
  const addToast = useCallback(
    (msg: string, type: Toast['type'] = 'info') => {
      setToasts((prev) => {
        const next: Toast[] = [
          { id: Date.now() + Math.random(), msg, type, leaving: false },
          ...prev,
        ];
        return next.slice(0, 5);
      });
    },
    []
  );

  /* Auto-dismiss após 8 segundos */
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts
      .filter((t) => !t.leaving)
      .map((t) => setTimeout(() => removeToast(t.id), 8000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  return { toasts, addToast, removeToast };
}

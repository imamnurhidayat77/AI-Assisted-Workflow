'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ToastCtx {
  toast: (text: string) => void;
  toastText: string;
}

const Ctx = createContext<ToastCtx>({ toast: () => {}, toastText: '' });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastText, setToastText] = useState('');
  const toast = useCallback((text: string) => {
    setToastText(text);
    window.setTimeout(() => setToastText(''), 2600);
  }, []);
  return <Ctx.Provider value={{ toast, toastText }}>{children}</Ctx.Provider>;
}

export const useToast = () => useContext(Ctx);

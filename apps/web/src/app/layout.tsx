import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: 'Street Smart Copilot — AI Business Operations',
  description: 'SAP Joule-style AI copilot for Smart City Street Ltd NZ: tenders, sales, products, quotations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head>
    <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('street-smart-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();` }} />
  </head><body><ToastProvider><AuthProvider>{children}</AuthProvider></ToastProvider></body></html>;
}

import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Jobsmith: your job search, organised', template: '%s · Jobsmith' },
  description:
    'A free, open-source, self-hosted job search workspace. Track every application, keep every CV version, and let an AI agent do the boring half of each application.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#3346d3', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}

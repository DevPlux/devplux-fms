import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Devplux | Financial Management System',
  description: 'Enterprise Financial Management & Corporate Accounting for Devplux (Pvt) Ltd',
  icons: {
    icon: '/Logo.webp',
    shortcut: '/Logo.webp',
    apple: '/Logo.webp',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}

        <Toaster
            position="top-right"
            richColors
            closeButton
            duration={4000}
            visibleToasts={3}
        />
      </body>
    </html>
  );
}

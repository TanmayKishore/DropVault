import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'DropVault | Secure Temporary File Sharing',
  description: 'Production-oriented, zero-friction temporary file vault with automated expiration and dual-token security.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-text-primary font-sans antialiased flex flex-col selection:bg-primary selection:text-white">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

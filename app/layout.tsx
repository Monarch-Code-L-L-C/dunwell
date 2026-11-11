import type { Metadata } from 'next';
import { Inter, Newsreader, JetBrains_Mono } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const newsreader = Newsreader({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'], variable: '--font-newsreader' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: { default: 'Dunwell: get paid on time, in full', template: '%s | Dunwell' },
  description: 'Contracts that protect your payment, invoices that carry the terms, and chasing that runs itself. For businesses that sell to businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

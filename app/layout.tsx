import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';
import './brand.css';

export const metadata: Metadata = {
  title: 'Sword Art Online — Life Command',
  description: 'A local-first life command dashboard for missions, time, routines, and daily progress.',
  icons: {
    icon: '/sao-tv-icon-v2.png',
    shortcut: '/sao-tv-icon-v2.png',
    apple: '/sao-tv-icon-v2.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

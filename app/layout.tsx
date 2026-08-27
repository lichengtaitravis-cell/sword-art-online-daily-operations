import type { Metadata } from 'next';
import './globals.css';
import './brand.css';

export const metadata: Metadata = {
  title: 'Sword Art Online — Daily Operations',
  description: 'A fast, tactile daily planning board for turning pending missions into completed wins.',
  icons: {
    icon: '/sao-tv-icon-v2.png',
    shortcut: '/sao-tv-icon-v2.png',
    apple: '/sao-tv-icon-v2.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

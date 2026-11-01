import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'GreenRev Business', description: 'Separate workspaces for automotive businesses' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

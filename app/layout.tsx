'use client';

import './globals.css';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Providers from './providers';
import Navbar from './components/navbar';
import ThreeBackground from './components/ThreeBackground';

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  // Hide navbar & background on meeting pages
  const isMeetingPage = pathname.startsWith('/meeting');

  return (
    <html lang="en">
      <body className="relative overflow-hidden">
        <Providers>

          {/* Show background only if NOT meeting */}
          {!isMeetingPage && <ThreeBackground />}

          {/* Show navbar only if NOT meeting */}
          {!isMeetingPage && <Navbar />}

          <main className="relative z-10">
            {children}
          </main>

        </Providers>
      </body>
    </html>
  );
}

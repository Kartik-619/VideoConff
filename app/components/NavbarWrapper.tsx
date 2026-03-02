'use client';

import { usePathname } from 'next/navigation';
import Navbar from './navbar';

export default function NavbarWrapper() {
  const pathname = usePathname();
  const isMeetingPage = pathname.startsWith('/meeting');

  if (isMeetingPage) return null;

  return <Navbar />;
}
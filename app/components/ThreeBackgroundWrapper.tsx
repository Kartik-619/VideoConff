'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const ThreeBackground = dynamic(
  () => import('./ThreeBackground'),
  { ssr: false }
);

export default function ThreeBackgroundWrapper() {
  const pathname = usePathname();
  const isMeetingPage = pathname.startsWith('/meeting');

  if (isMeetingPage) return null;

  return <ThreeBackground />;
}
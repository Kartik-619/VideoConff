import { ReactNode } from 'react';
import ThreeBackground from '../components/ThreeBackground';

export default function MeetingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen">

      {/* ✅ 3D BACKGROUND */}
      <ThreeBackground />

      {/* ✅ DARK OVERLAY FOR READABILITY */}
      <div className="absolute inset-0 bg-black/30" />

      {/* ✅ CONTENT */}
      <div className="relative z-10">
        {children}
      </div>

    </div>
  );
}
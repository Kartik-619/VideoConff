'use client';

import { JSX } from 'react';
import HeroLanding from './landing/components/HeroLanding';

export default function Home(): JSX.Element {
  return (
    <main className="relative min-h-screen">
      <HeroLanding />
    </main>
  );
}

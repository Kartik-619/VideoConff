'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ModelBackground from './ModelBackground';
import { Suspense } from 'react';
import { JSX } from 'react';
import { useState } from 'react';

export default function ThreeBackground(): JSX.Element {

  return (
    <div className="absolute inset-0 -z-10 pointer-events-none">
     
   <Canvas
        camera={{ position: [0, 3, 20], fov: 45 }}
        gl={{ alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.7} />

        {/* Sky / background */}
        <Suspense fallback={null}>
        <ModelBackground />

        </Suspense>

        <OrbitControls enableZoom={false} />
      </Canvas>
    </div>
  );
}
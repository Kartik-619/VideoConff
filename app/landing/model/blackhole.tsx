// components/ThreeBackground.tsx
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import ModelBackground from './modelBG';

function Model() {
  const { scene } = useGLTF('/giant_scifi_statue.glb');
  return <primitive object={scene} scale={3} position={[0, -12, -1]} />;
}

export default function ThreeBackground() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none">
      <Canvas camera={{ position: [0, 5, 25], fov: 45 }}   gl={{ alpha: true }} >
        {/* IMPORTANT: transparent canvas */}
 

        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.5} />
      <ModelBackground/>
        <Model />

        <OrbitControls
          enableZoom={false}
          enableDamping={false}
          enableRotate={true}
         
        />
      </Canvas>
    </div>
  );
}

// components/EasiestModel.tsx
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

export default function StatueModel() {
  // The model component
  function Model() {
    const { scene } = useGLTF('/giant_scifi_statue.glb'); // Put your model in /public/model.glb
    return <primitive position={[10,10,0]} object={scene} />;
  }

  return (
    <div style={{ width: '100%', height: '500px' }}>
      <Canvas>
        <Model />
        <OrbitControls />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
      </Canvas>
    </div>
  );
}
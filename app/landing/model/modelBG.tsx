// components/ModelBackground.tsx
import * as THREE from 'three';
import { useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export default function ModelBackground() {
  const texture = useTexture('/B.png');
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0003;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[19, 20, 20]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}  // Disable fog for better skybox effect
      />
    </mesh>
  );
}
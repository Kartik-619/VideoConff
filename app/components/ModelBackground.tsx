'use client';

import * as THREE from 'three';
import { JSX, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export default function ModelBackground(): JSX.Element {
  const texture = useTexture('/B.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta*0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[20, 20, 25]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
      />
    </mesh>
  );
}
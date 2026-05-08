'use client'

import { ReactNode, useEffect, useState } from "react";

interface Props {
  count: number;
  children: ReactNode;
}

export function LayoutCall({ count, children }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { cols, rows } = getGridLayout(count, isMobile);

  return (
    <div
      className="grid w-full h-full gap-2 md:gap-3 p-2 md:p-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: rows > 0 ? `repeat(${rows}, 1fr)` : '1fr'
      }}
    >
      {children}
    </div>
  );
}

function getGridLayout(count: number, isMobile: boolean): { cols: number; rows: number } {
  if (count === 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };
  
  if (isMobile) {
    if (count === 2) return { cols: 1, rows: 2 };
    if (count === 3) return { cols: 1, rows: 3 };
    if (count === 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    
    const cols = 2;
    const rows = Math.ceil(count / cols);
    return { cols, rows };
  }

  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 2, rows: 2 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count === 5) return { cols: 3, rows: 2 };
  if (count === 6) return { cols: 3, rows: 2 };
  if (count === 7) return { cols: 4, rows: 2 };
  if (count === 8) return { cols: 4, rows: 2 };
  if (count === 9) return { cols: 3, rows: 3 };
  
  // For more than 9 participants, calculate optimal grid
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}
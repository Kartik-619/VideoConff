'use client'

import { ReactNode } from "react";

interface Props {
  count: number;
  children: ReactNode;
}

export function LayoutCall({ count, children }: Props) {

  let cols = 1;

  if (count === 1) cols = 1;
  else if (count === 2) cols = 2;
  else if (count <= 4) cols = 2;
  else if (count <= 6) cols = 3;
  else cols = 4;

  return (
    <div
      className="grid w-full h-full gap-3 p-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`
      }}
    >
      {children}
    </div>
  );
}
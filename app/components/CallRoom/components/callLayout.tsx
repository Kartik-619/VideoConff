'use client'
import { Children, ReactNode } from "react";

interface GridProps{
    particpants:number;
    children:ReactNode;
}

export function LayoutCall({particpants,children}:GridProps){
    let cols=Math.ceil(Math.sqrt(particpants));
    let rows=Math.ceil(particpants/cols);

    return(
        <div   className="flex-1 grid gap-2 p-2" 
        style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`
          }}>
            //allows to use react objects in your components
            
            {children}
        </div>
    )
}
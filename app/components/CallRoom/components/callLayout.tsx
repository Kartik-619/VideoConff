'use client'
import {  ReactNode } from "react";

interface GridProps{
    participants:number;
    children:ReactNode;
}

export function LayoutCall({participants,children}:GridProps){
    let cols=Math.ceil(Math.sqrt(participants));
    let rows=Math.ceil(participants/cols);

    return(
        <div   className="flex-1 grid gap-2 p-2" 
        style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`
          }}>

            {children}
        </div>
    )
}
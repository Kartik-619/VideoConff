"use client"

import React from "react"

export default function HeroLanding(){
    return(
        <div className=" realtive w-screen h-screen overflow-hidden">
            <div id="bg-landing" className="absolute inset-0 bg-gradient-to-br from-[#021b2d] via-[#041f30] to-black"/>
            <div id="fog" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(0,255,255,0.12),transparent_60%)] blur-3xl" />

        </div>
    )
}
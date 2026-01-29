'use client';

import ThreeBackground from '../model/blackhole';


export default function HeroLanding() {

  return (
    <section
      className="
        relative h-screen w-screen overflow-hidden
        bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))]
        from-[#6366f1] via-[#a5b4fc] to-[#e0e7ff]
      "
    >
      {/* Three.js BACKGROUND */}
      <ThreeBackground />

      {/* NAVBAR */}
      <nav className="relative z-10 flex items-center justify-between px-10 py-6 text-white">
        <h1 className="text-xl font-bold">SPHINX</h1>

        <ul className="flex items-center gap-8 text-sm font-medium">
          <li className="cursor-pointer hover:opacity-80">Home</li>
          <li className="cursor-pointer hover:opacity-80">Dashboard</li>
          <li className="cursor-pointer hover:opacity-80">About Us</li>
          <li className="cursor-pointer hover:opacity-80">Docs</li>
        </ul>

        <button className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black hover:bg-white/90">
          Login
        </button>
        
      </nav>

      {/* HERO CONTENT */}
      <div className="relative z-10 flex h-full flex-col items-center justify-between px-6 pb-16 text-center text-white">
        
        {/* Top spacer */}
        <div />

        {/* Center text */}
        <div>
          <h1 className="text-6xl text-slate-100 font-bold tracking-tight">
            Mythic Intelligence
          </h1>

         
        </div>

        {/* Bottom CTA — slightly above bottom */}
        <div className="flex mb-15 gap-4 rounded-full border border-white/30 bg-white/10 p-2 backdrop-blur">
          <button className="rounded-full border-black px-6 py-3 text-lg text-white hover:bg-white/10">
            Create a meeting
          </button>

          <button className="rounded-full bg-white px-6 py-3 text-lg text-black hover:bg-white/90">
            Join Meeting
          </button>
        </div>

      </div>
    </section>
  );
}

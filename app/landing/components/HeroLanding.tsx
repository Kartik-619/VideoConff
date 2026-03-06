'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function HeroLanding() {
  const router = useRouter();
  const { status } = useSession();

  const handleCreateMeeting = async () => {
    // 🔐 If not logged in → redirect to login
    if (status !== 'authenticated') {
      router.push('/login?redirect=create');
      return;
    }

    const res = await fetch('/api/meeting/create', {
      method: 'POST',
    });

    const data = await res.json();

    if (data.meetingId) {
      router.push(`/meeting/${data.meetingId}`);
    }
  };

  const handleJoinRedirect = () => {
    if (status !== 'authenticated') {
      router.push('/login?redirect=join');
      return;
    }

    router.push('/join');
  };

  return (
    <section className="relative h-screen w-screen flex items-center justify-center px-6">

      <div className="text-center max-w-3xl">

        <h1 className="text-6xl md:text-7xl font-extrabold text-white tracking-tight drop-shadow-md">
          Mythic Intelligence
        </h1>

        <p className="mt-6 text-lg md:text-xl text-white/85 leading-relaxed">
          Real-time meetings with intelligent transcripts and structured documentation.
        </p>

        <div className="
          mt-12 
          inline-flex 
          items-center 
          gap-3 
          rounded-full 
          bg-white/20 
          backdrop-blur-xl 
          border border-white/30 
          p-2
        ">

          <button
            onClick={handleCreateMeeting}
            className="
              px-8 py-3 rounded-full
              bg-gradient-to-r from-cyan-500 to-indigo-600
              text-white font-semibold
              shadow-md
              hover:scale-105
              transition-all duration-300
            "
          >
            Create New Meeting
          </button>

          <button
            onClick={handleJoinRedirect}
            className="
              px-8 py-3 rounded-full
              border border-white/40
              text-white font-semibold
              hover:bg-white/20
              transition-all duration-300
            "
          >
            Join Existing Meeting
          </button>

        </div>

      </div>
    </section>
  );
}
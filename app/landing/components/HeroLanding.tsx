'use client';

import { useRouter } from 'next/navigation';

export default function HeroLanding() {
  const router = useRouter();

  const handleCreateMeeting = async () => {
    const res = await fetch('/api/meeting/create', {
      method: 'POST',
    });

    const data = await res.json();

    if (data.meetingId) {
      router.push(`/meeting/${data.meetingId}`);
    }
  };

  return (
    <section className="relative h-screen w-screen flex flex-col items-center justify-center text-center px-6">
      <h1 className="text-6xl font-extrabold tracking-tight text-white">
        Mythic Intelligence
      </h1>

      <p className="mt-6 max-w-xl text-white/90">
        Real-time meetings with intelligent transcripts and documentation.
      </p>

      <div className="mt-14 flex gap-3 rounded-full bg-white/50 backdrop-blur-xl p-2 shadow-xl">
        <button
          onClick={handleCreateMeeting}
          className="rounded-full px-8 py-3 bg-white text-slate-900 font-semibold"
        >
          Create New Meeting
        </button>

        <button
          onClick={() => router.push('/join')}
          className="rounded-full px-8 py-3 border-2 border-white text-black"
        >
          Join Existing Meeting
        </button>
      </div>
    </section>
  );
}

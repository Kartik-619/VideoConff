'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DownloadsPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center text-white text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 pt-32 pb-20">

      {/* Page Title */}
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-12">
          Downloads
        </h1>
      </div>

      {/* Empty State */}
      <div className="max-w-4xl mx-auto">
        <div
          className="
            bg-slate-900/30
            backdrop-blur-2xl
            border border-white/20
            rounded-3xl
            p-14
            text-center
            shadow-2xl
          "
        >
          <p className="text-2xl font-semibold text-white">
            No downloads available
          </p>

          <p className="mt-4 text-white/80 text-lg">
            Your meeting transcripts and exported PDFs will appear here
            once your meetings are completed.
          </p>

          <div className="mt-10">
            <button
              onClick={() => router.push('/')}
              className="
                px-8 py-3 rounded-full
                bg-gradient-to-r from-cyan-500 to-indigo-600
                text-white font-semibold
                shadow-lg shadow-cyan-500/30
                hover:scale-105
                transition-all duration-300
              "
            >
              Start a Meeting
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
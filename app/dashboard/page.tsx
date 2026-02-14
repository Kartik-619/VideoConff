'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();

  // 🔐 Route protection
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-100 p-10">
      
      <h1 className="text-3xl font-extrabold text-slate-800 mb-8">
        Your Meetings
      </h1>

      {/* Empty state */}
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-lg">
        <p className="text-lg font-semibold text-slate-700">
          No meetings yet
        </p>

        <p className="mt-2 text-slate-500">
          Create a new meeting or join an existing one to get started.
        </p>

        <div className="mt-6 flex justify-center gap-4">
          <button
            className="rounded-full bg-indigo-600 px-6 py-3 text-white font-medium hover:bg-indigo-500 transition"
            onClick={() => router.push('/')}
          >
            Create Meeting
          </button>

          <button
            className="rounded-full border border-indigo-600 px-6 py-3 text-indigo-600 font-medium hover:bg-indigo-50 transition"
            onClick={() => router.push('/')}
          >
            Join Meeting
          </button>
        </div>
      </div>
    </div>
  );
}

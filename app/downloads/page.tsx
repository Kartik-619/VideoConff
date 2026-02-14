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
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen px-10 py-16 bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-100">
      <h1 className="text-3xl font-extrabold text-slate-800 mb-8">
        Downloads
      </h1>

      <div className="rounded-xl bg-white p-10 shadow-md text-center">
        <p className="text-lg font-semibold text-slate-700">
          No downloads available
        </p>
        <p className="mt-2 text-slate-500">
          Your meeting transcripts and PDFs will appear here after meetings end.
        </p>
      </div>
    </div>
  );
}
'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProfilePage() {
  const { data: session, status } = useSession();
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
        Profile
      </h1>

      <div className="rounded-xl bg-white p-8 shadow-md max-w-md">
        <p className="text-slate-700">
          <span className="font-semibold">Name:</span> {session?.user?.name}
        </p>

        <p className="mt-2 text-slate-700">
          <span className="font-semibold">Email:</span> {session?.user?.email}
        </p>

        <button
          onClick={() => signOut()}
          className="mt-6 w-full rounded-lg bg-indigo-600 py-3 text-white font-semibold hover:bg-indigo-500 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
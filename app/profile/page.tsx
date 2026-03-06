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
    return (
      <div className="h-screen flex items-center justify-center text-white text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 pt-32 pb-20">

      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-14">
          Account Overview
        </h1>

        {/* Main Card */}
        <div className="
          bg-slate-900/30
          backdrop-blur-2xl
          border border-white/20
          rounded-3xl
          p-10
          shadow-2xl
        ">

          {/* Top Section */}
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">

            {/* Avatar */}
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-r from-cyan-500 to-indigo-600 flex items-center justify-center text-4xl font-bold text-white shadow-xl">

              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                session?.user?.name?.charAt(0)?.toUpperCase() || "U"
              )}

            </div>

            {/* Info */}
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-semibold text-white">
                {session?.user?.name}
              </h2>

              <p className="mt-2 text-white/70">
                {session?.user?.email}
              </p>

              <span className="mt-4 inline-block px-4 py-1 text-sm rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                Active Member
              </span>
            </div>

          </div>

          {/* Divider */}
          <div className="mt-10 border-t border-white/20"></div>

          {/* Stats Section */}
          <div className="mt-10 grid md:grid-cols-3 gap-6 text-center">

            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <p className="text-3xl font-bold text-white">0</p>
              <p className="mt-2 text-white/70 text-sm">Meetings Hosted</p>
            </div>

            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <p className="text-3xl font-bold text-white">0</p>
              <p className="mt-2 text-white/70 text-sm">Hours Recorded</p>
            </div>

            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <p className="text-3xl font-bold text-white">0</p>
              <p className="mt-2 text-white/70 text-sm">Transcripts Generated</p>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="mt-12 flex flex-col sm:flex-row gap-6 justify-center">

            <button
              className="
                px-8 py-3 rounded-full
                border border-white/30
                text-white font-semibold
                hover:bg-white/10
                transition-all duration-300
              "
            >
              Edit Profile
            </button>

            <button
              className="
                px-8 py-3 rounded-full
                border border-white/30
                text-white font-semibold
                hover:bg-white/10
                transition-all duration-300
              "
            >
              Security Settings
            </button>

            <button
              onClick={() => signOut()}
              className="
                px-8 py-3 rounded-full
                bg-gradient-to-r from-cyan-500 to-indigo-600
                text-white font-semibold
                shadow-lg shadow-cyan-500/30
                hover:scale-105
                transition-all duration-300
              "
            >
              Logout
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
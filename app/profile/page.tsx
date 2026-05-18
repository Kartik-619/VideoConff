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

      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-14">
          Account Overview
        </h1>

        {/* Profile Card */}
        <div
          className="
            bg-slate-900/30
            backdrop-blur-2xl
            border border-white/20
            rounded-3xl
            p-8
            shadow-2xl
          "
        >

          <div className="flex flex-col md:flex-row items-center gap-8">

            {/* Avatar */}
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-r from-cyan-500 to-indigo-600 flex items-center justify-center text-4xl font-bold text-white shadow-xl">

              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                session?.user?.name?.charAt(0)?.toUpperCase() || 'U'
              )}

            </div>

            {/* User Info */}
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

          {/* Account Details */}
          <div className="mt-8 space-y-4 text-white/80">

            <div className="flex justify-between border-b border-white/10 pb-3">
              <span>Authentication</span>
              <span>Google OAuth</span>
            </div>

            <div className="flex justify-between border-b border-white/10 pb-3">
              <span>Account Status</span>
              <span>Active</span>
            </div>

            <div className="flex justify-between pb-3">
              <span>Platform</span>
              <span>SPHINX Collaboration System</span>
            </div>

          </div>

          {/* Logout Button */}
          <div className="mt-12 flex justify-center">

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
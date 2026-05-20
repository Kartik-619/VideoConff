'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Meeting = {
  id: string;
  meetingCode: string;
  status: string;
  createdAt: string;
};

export default function DashboardPage() {

  const { status } = useSession();
  const router = useRouter();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);

  useEffect(() => {

    if (status === 'unauthenticated') {
      router.push('/login');
    }

  }, [status, router]);

  useEffect(() => {

    const loadMeetings = async () => {

      try {

        const res = await fetch('/api/meeting/history');
        const data = await res.json();

        setMeetings(data.meetings || []);

      } catch (err) {

        console.log("Failed to load meetings");

      } finally {

        setLoadingMeetings(false);

      }

    };

    if (status === "authenticated") {
      loadMeetings();
    }

  }, [status]);

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center text-white text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 pt-32 pb-20">

      <div className="max-w-6xl mx-auto">

        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-12">
          Your Meetings
        </h1>

        {loadingMeetings ? (

          <div className="text-white">Loading meetings...</div>

        ) : meetings.length === 0 ? (

          <div className="
            bg-slate-900/30 
            backdrop-blur-2xl 
            border border-white/20 
            rounded-3xl 
            p-14 
            text-center 
            shadow-2xl
          ">

            <p className="text-2xl font-semibold text-white">
              No meetings yet
            </p>

            <p className="mt-4 text-white/80 text-lg">
              Start a new meeting or join an existing one.
            </p>

            <div className="mt-10 flex justify-center gap-6">

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
                Create Meeting
              </button>

              <button
                onClick={() => router.push('/')}
                className="
                  px-8 py-3 rounded-full
                  border border-white/40
                  text-white font-semibold
                  hover:bg-white/15
                  transition-all duration-300
                "
              >
                Join Meeting
              </button>

            </div>

          </div>

        ) : (

          <div className="space-y-4">

            {meetings.map((meeting) => (

              <div
                key={meeting.id}
                className="
                  bg-slate-900/40
                  border border-white/20
                  rounded-xl
                  p-6
                  flex justify-between items-center
                  text-white
                "
              >

                <div>

                  <p className="text-lg font-semibold">
                    {meeting.meetingCode}
                  </p>

                  <p className="text-sm text-white/60">
                    {new Date(meeting.createdAt).toLocaleString()}
                  </p>

                </div>

                <div className="flex gap-4 items-center">

                  <span className="text-sm px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300">
                    {meeting.status}
                  </span>

                  <button
                    onClick={() => router.push(`/meeting/${meeting.id}`)}
                    className="text-sm underline"
                  >
                    Open
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>
  );
}
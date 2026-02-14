'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type User = {
  id: string;
  name: string;
};

type Meeting = {
  id: string;
  meetingCode: string;
  status: string;
  host: User;
  participants: User[];
};

export default function MeetingLobby() {
  const params = useParams();
  const meetingId = params.meetingId as string;

  const router = useRouter();
  const { data: session } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  // 🔁 Poll Meeting Status
  const fetchMeeting = async () => {
    try {
      const res = await fetch(`/api/meeting/${meetingId}`);
      if (!res.ok) return;

      const data = await res.json();
      setMeeting(data);

      // 🔥 Auto redirect for everyone
      if (data.status === 'LIVE') {
        router.push(`/meeting/${meetingId}/room`);
      }

    } catch (err) {
      console.log("Polling error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!meetingId) return;

    fetchMeeting();
    const interval = setInterval(fetchMeeting, 2000);

    return () => clearInterval(interval);
  }, [meetingId]);

  // 🚀 Start Meeting (Host only)
  const handleStartMeeting = async () => {
    if (starting) return;

    setStarting(true);

    await fetch('/api/meeting/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    // ❌ No router.push here
    // Polling will redirect automatically
  };

  // 📋 Copy Meeting Code
  const handleCopy = async () => {
    if (!meeting) return;

    await navigator.clipboard.writeText(meeting.meetingCode);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 🚪 Leave
  const handleLeaveMeeting = async () => {
    await fetch('/api/meeting/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    router.push('/');
  };

  // 🛑 End (Host only)
  const handleEndMeeting = async () => {
    await fetch('/api/meeting/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading meeting...
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        Meeting not found
      </div>
    );
  }

  const isHost = session?.user?.id === meeting.host?.id;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">

        <h1 className="text-2xl font-bold text-center text-slate-800">
          Meeting Lobby
        </h1>

        {/* Meeting Code */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">Meeting Code</p>
          <div className="mt-1 p-3 bg-slate-100 rounded-md text-lg font-mono tracking-widest">
            {meeting.meetingCode}
          </div>
        </div>

        {/* Status */}
        <div className="mt-4 text-center text-slate-600">
          Status: <span className="font-semibold">{meeting.status}</span>
        </div>

        {/* Host */}
        <div className="mt-6">
          <h2 className="font-semibold text-lg">Host 👑</h2>
          <div className="mt-2 p-3 bg-yellow-100 rounded-md">
            {meeting.host?.name}
            {isHost && <span className="ml-2 text-sm">(You)</span>}
          </div>
        </div>

        {/* Participants */}
        <div className="mt-6">
          <h2 className="font-semibold text-lg">
            Participants ({meeting.participants?.length || 0})
          </h2>

          <ul className="mt-2 space-y-2">
            {meeting.participants?.map((user) => (
              <li
                key={user.id}
                className="p-2 bg-slate-100 rounded-md"
              >
                {user.name}
                {session?.user?.id === user.id && (
                  <span className="ml-2 text-sm">(You)</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Buttons */}
        <div className="mt-8 space-y-3">

          {/* Copy */}
          <button
            onClick={handleCopy}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {copied ? 'Copied ✓' : 'Copy Meeting Code'}
          </button>

          {/* Start */}
          {isHost && meeting.status !== 'LIVE' && (
            <button
              onClick={handleStartMeeting}
              disabled={starting}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {starting ? "Starting..." : "Start Meeting"}
            </button>
          )}

          {/* Leave + End */}
          <div className="flex gap-3">
            <button
              onClick={handleLeaveMeeting}
              className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition"
            >
              Leave
            </button>

            {isHost && (
              <button
                onClick={handleEndMeeting}
                className="flex-1 py-2.5 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-800 transition"
              >
                End
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Button from '../../components/ui/Button';

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
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [starting, setStarting] = useState(false);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/meeting/${meetingId}`
      : "";

  // Fetch meeting data
  const fetchMeeting = async () => {
    try {
      const res = await fetch(`/api/meeting/${meetingId}`);

      if (!res.ok) return;

      const data = await res.json();
      setMeeting(data);

      // redirect to room if meeting started
      if (data.status === "LIVE") {
        router.replace(`/meeting/${meetingId}/room`);
      }

      // exit if meeting ended
      if (data.status === "ENDED") {
        alert("Meeting has ended");
        router.replace("/");
      }

    } catch {
      console.log("Polling error");
    } finally {
      setLoading(false);
    }
  };

  // polling meeting state
  useEffect(() => {
    if (!meetingId) return;

    fetchMeeting();

    const interval = setInterval(fetchMeeting, 2000);

    return () => clearInterval(interval);
  }, [meetingId]);

  // 🔥 JOIN MEETING AUTOMATICALLY (FIX)
  useEffect(() => {
    if (!meeting?.meetingCode || !session?.user?.id) return;

    const joinMeeting = async () => {
      try {
        await fetch("/api/meeting/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            meetingCode: meeting.meetingCode,
          }),
        });
      } catch (err) {
        console.error("Join meeting error:", err);
      }
    };

    joinMeeting();
  }, [meeting?.meetingCode, session]);

  const handleCopyCode = async () => {
    if (!meeting) return;

    await navigator.clipboard.writeText(meeting.meetingCode);
    setCopiedCode(true);

    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);

    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Join my meeting",
        text: "Click to join the meeting",
        url: inviteLink,
      });
    }
  };

  const handleStartMeeting = async () => {
    if (starting) return;

    setStarting(true);

    try {
      await fetch('/api/meeting/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });
    } catch (error) {
      console.error("Start meeting error", error);
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    await fetch('/api/meeting/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    router.replace('/');
  };

  const handleEnd = async () => {
    await fetch('/api/meeting/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    router.replace('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400">
        Meeting not found
      </div>
    );
  }

  const isHost = session?.user?.id === meeting.host?.id;

  return (
    <div className="min-h-screen bg-slate-800/80 flex items-center justify-center p-6 transition-colors duration-500">

      <div className="w-full max-w-2xl  bg-slate-700/70 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-10">

        <h1 className="text-3xl font-bold text-white text-center">
          Meeting Lobby
        </h1>

        <div className="mt-8 text-center">
          <p className="text-slate-400 text-sm uppercase tracking-wide">
            Meeting Code
          </p>

          <div className="mt-3 py-4 bg-slate-900 rounded-xl border border-slate-700 text-cyan-400 text-2xl font-mono tracking-widest">
            {meeting.meetingCode}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <Button variant="secondary" onClick={handleCopyCode} full>
            {copiedCode ? "Copied ✓" : "Copy Code"}
          </Button>

          <Button variant="outline" onClick={handleCopyLink} full>
            {copiedLink ? "Link Copied ✓" : "Copy Invite Link"}
          </Button>
        </div>

        <div className="mt-3">
          <Button variant="outline" onClick={handleShare} full>
            Share Invite
          </Button>
        </div>

        <div className="mt-10">
          <h2 className="text-white font-semibold mb-3">
            Participants ({meeting.participants.length})
          </h2>

          <div className="space-y-2">
            {meeting.participants.map((user) => (
              <div
                key={user.id}
                className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
              >
                {user.name}

                {session?.user?.id === user.id && (
                  <span className="ml-2 text-xs text-cyan-400">(You)</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-4">

          {isHost && meeting.status !== "LIVE" && (
            <Button
              variant="primary"
              onClick={handleStartMeeting}
              disabled={starting}
              full
            >
              {starting ? "Starting..." : "Start Meeting"}
            </Button>
          )}

          <div className="flex gap-4">
            <Button variant="destructive" onClick={handleLeave} full>
              Leave
            </Button>

            {isHost && (
              <Button
                variant="destructive"
                className="bg-red-800 hover:bg-red-900"
                onClick={handleEnd}
                full
              >
                End
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
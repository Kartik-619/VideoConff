'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Button from '../../components/ui/Button';
import { Copy, Link2, Users, Play, LogOut, Share2 } from 'lucide-react';

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

  const fetchMeeting = async () => {
    try {
      const res = await fetch(`/api/meeting/${meetingId}`);
      if (!res.ok) return;

      const data = await res.json();
      setMeeting(data);

      if (data.status === "LIVE") {
        router.replace(`/meeting/${meetingId}/room`);
      }

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

  useEffect(() => {
    if (!meetingId) return;

    fetchMeeting();
    const interval = setInterval(fetchMeeting, 5000);
    return () => clearInterval(interval);
  }, [meetingId]);

  const joinedRef = useRef(false);

    useEffect(() => {
      if (!meeting?.meetingCode || !session?.user?.id) return;

      if (joinedRef.current) return; // ✅ prevent multiple calls
      joinedRef.current = true;

      fetch("/api/meeting/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingCode: meeting.meetingCode }),
      });
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
    } catch {
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

  // ✅ CLEAN LOADING (NO HERO LANDING)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/40 border-t-white rounded-full animate-spin"></div>
          <p className="text-lg font-medium">Creating meeting...</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Meeting not found
      </div>
    );
  }

  const isHost = session?.user?.id === meeting.host?.id;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">

      {/* ENHANCED CARD */}
      <div className="w-full max-w-2xl 
        bg-gradient-to-br from-white to-blue-50/80
        backdrop-blur-md 
        border border-gray-200
        rounded-3xl 
        shadow-[0_20px_60px_rgba(0,0,0,0.25)]
        p-10">

        <h1 className="text-3xl font-bold text-gray-900 text-center tracking-tight">
          Meeting Lobby
        </h1>

        {/* CODE */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs uppercase tracking-widest">
            Meeting Code
          </p>

          <div className="mt-3 py-4 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-900 text-2xl font-mono tracking-widest">
            {meeting.meetingCode}
          </div>
        </div>

        {/* BUTTONS */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Button variant="secondary" onClick={handleCopyCode} full>
            <div className="flex items-center justify-center gap-2">
              <Copy size={16} />
              {copiedCode ? "Copied ✓" : "Copy Code"}
            </div>
          </Button>

          {/* BUTTON */}
          <Button
            variant="secondary"
            className="bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 shadow-sm hover:shadow-md transition"
            onClick={handleCopyLink}
            full
          >
            <div className="flex items-center justify-center gap-2">
              <Link2 size={16} />
              {copiedLink ? "Link Copied ✓" : "Copy Invite Link"}
            </div>
          </Button>
        </div>

        {/* BUTTON */}
        <div className="mt-3">
          <Button
            variant="secondary"
            className="bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 shadow-sm hover:shadow-md transition"
            onClick={handleShare}
            full
          >
            <div className="flex items-center justify-center gap-2">
              <Share2 size={16} />
              Share Invite
            </div>
          </Button>
        </div>

        {/* PARTICIPANTS */}
        <div className="mt-10">
          <h2 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
            <Users size={18} />
            Participants ({meeting.participants.length})
          </h2>

          <div className="space-y-2">
            {meeting.participants.map((user) => (
              <div
                key={user.id}
                className="p-3 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-800 flex justify-between items-center"
              >
                {user.name}

                {session?.user?.id === user.id && (
                  <span className="ml-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    You
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="mt-10 space-y-4">

          {isHost && meeting.status !== "LIVE" && (
            <Button variant="primary" onClick={handleStartMeeting} disabled={starting} full>
              <div className="flex items-center justify-center gap-2">
                <Play size={16} />
                {starting ? "Starting..." : "Start Meeting"}
              </div>
            </Button>
          )}

          <div className="flex gap-4">
            <Button variant="destructive" onClick={handleLeave} full>
              <div className="flex items-center justify-center gap-2">
                <LogOut size={16} />
                Leave
              </div>
            </Button>

            {isHost && (
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 shadow-sm hover:shadow-md transition"
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
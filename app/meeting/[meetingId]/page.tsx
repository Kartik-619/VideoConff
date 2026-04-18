'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Button from '../../components/ui/Button';
import { Copy, Link2, Users, Play, LogOut, Share2 } from 'lucide-react';
import toast from "react-hot-toast";

type MeetingData = {
  id: string;
  meetingCode: string;
  status: string;
  host: { id: string; name: string } | null;
  participants: { id: string; name: string }[];
  waitingUsers: { id: string; name: string }[];
};

export default function MeetingLobby() {
  const params = useParams();
  const meetingId = params.meetingId as string;
  const router = useRouter();
  const { data: session } = useSession();

  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [starting, setStarting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const joinedWSRef = useRef(false);

  const connectingRef = useRef(false);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/meeting/${meetingId}`
      : "";

  const fetchMeeting = async () => {
    try {
      const res = await fetch(`/api/meeting/${meetingId}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      setMeeting(data);

      if (data.status === "LIVE") {
        router.replace(`/meeting/${meetingId}/room`);
      }

      if (data.status === "ENDED") {
        toast.error("Meeting has ended");
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
  if (!session?.user?.id) return;

  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;

  const connectWS = async () => {

  // 🔥 prevent multiple connections
  if (wsRef.current || connectingRef.current || joinedWSRef.current) return;

  connectingRef.current = true;

  if (!session?.user?.id) {
    connectingRef.current = false;
    return;
  }

  try {
    const res = await fetch("/api/ws-token");

    if (!res.ok) {
      console.error("❌ Failed to fetch WS token");
      connectingRef.current = false;
      return;
    }

    const { token } = await res.json();

    if (!token) {
      console.error("❌ No token received");
      connectingRef.current = false;
      return;
    }

    console.log("✅ WS Token:", token);

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 'ws://localhost:8080'}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WS connected");

      connectingRef.current = false;

      if (joinedWSRef.current) return;
      joinedWSRef.current = true;

      ws.send(JSON.stringify({
        type: "join",
        roomId: meetingId
      }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "meetingStarted") {

        setTimeout(() => {
          router.replace(`/meeting/${meetingId}/room`);
        }, 300);

      }

      if (data.type === "lobbyUpdate") {
        setMeeting((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            participants: data.participants
          };
        });

        fetchMeeting();
      }

      if (data.type === "meetingEnded") {
        toast.error("Meeting ended by host");
        wsRef.current?.close();
        router.replace("/");
      }
    };

    ws.onclose = () => {

      if (!navigator.onLine) return;
      console.log("WS disconnected");

      wsRef.current = null;
      joinedWSRef.current = false;
      connectingRef.current = false;

      setTimeout(() => {
        console.log("Reconnecting WS...");
        connectWS();
      }, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

  } catch (err) {
    console.error(err);
    connectingRef.current = false;
  }
};

  // initial fetch
  fetchMeeting();

  // connect WS
  connectWS();

  return () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  // 🔥 CLOSE WS when leaving lobby
  wsRef.current?.close();
  wsRef.current = null;
  joinedWSRef.current = false;
};


}, [meetingId, session?.user?.id]);

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
    wsRef.current?.close();
    await fetch('/api/meeting/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });
    router.replace('/');
  };

  const handleEnd = async () => {
    if (!isHost) return;
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl space-y-5 animate-pulse">

        {/* Title */}
        <div className="h-6 w-1/2 mx-auto rounded bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300"></div>

        {/* Subtitle */}
        <div className="h-4 w-3/4 mx-auto rounded bg-gray-200"></div>

        {/* Participants list */}
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl bg-gray-100"
            >
              {/* Avatar */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-300"></div>

                {/* Name */}
                <div className="h-4 w-24 rounded bg-gray-300"></div>
              </div>

              {/* Role badge */}
              <div className="h-4 w-10 rounded bg-gray-300"></div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-4">
          <div className="h-10 flex-1 rounded-xl bg-gray-300"></div>
          <div className="h-10 flex-1 rounded-xl bg-gray-200"></div>
        </div>

      </div>
    </div>
  );
}

  if (!meeting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white gap-4">
        <h1 className="text-2xl font-semibold">Meeting not found</h1>

        <Button
          variant="primary"
          onClick={() => router.replace("/")}
        >
          Go Home
        </Button>
      </div>
    );
  }

    const isHost =
      session?.user?.id &&
      meeting?.host?.id &&
      session.user.id === meeting.host.id;

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

        <p className="text-center text-sm text-gray-500 mt-2">
          {isHost
            ? "You are the host. Start the meeting when ready."
            : "Waiting for host to start the meeting..."}
        </p>

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
                <div className="flex items-center gap-2">
                  {user.name}

                  {meeting.host?.id === user.id && (
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                      Host 👑
                    </span>
                  )}

                  {session?.user?.id === user.id && (
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      You
                    </span>
                  )}
                </div>
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
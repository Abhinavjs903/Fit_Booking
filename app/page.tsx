"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Session = { id: string; startsAt: string; capacity: number };
type Booking = {
  id: string;
  sessionId: string;
  status: string;
  session: Session;
};
type WaitlistEntry = { id: string; sessionId: string; session: Session };
type Account = { username: string; memberCode: string; role: "ADMIN" | "MEMBER" };

export default function Home() {
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState("member001");
  const [password, setPassword] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminStartsAt, setAdminStartsAt] = useState("");

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    const result = await response.json();
    if (result.success) setSessions(result.data);
  }, []);

  const loadBookings = useCallback(async () => {
    const response = await fetch("/api/bookings", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) return;
    setBookings(result.data.bookings);
    setWaitlist(result.data.waitlistEntries);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Login failed");
      setAccount(result.user);
      setPassword("");
      setNotice("Logged in successfully.");
      if (result.user.role === "MEMBER") await loadBookings();
      await loadSessions();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccount(null);
    setBookings([]);
    setWaitlist([]);
    setNotice("Logged out.");
  };

  const bookSession = async (sessionId: string) => {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const result = await response.json();
      setNotice(result.message || "Request complete");
      if (response.ok) await loadBookings();
    } catch {
      setNotice("Unable to book this session.");
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      const result = await response.json();
      setNotice(result.message || "Request complete");
      await loadBookings();
      await loadSessions();
    } catch {
      setNotice("Unable to cancel booking.");
    } finally {
      setBusy(false);
    }
  };

  const createSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: new Date(adminStartsAt).toISOString() }),
      });
      const result = await response.json();
      setNotice(result.message || (result.success ? "Session created." : "Unable to create session."));
      if (response.ok) {
        setAdminStartsAt("");
        await loadSessions();
      }
    } catch {
      setNotice("Unable to create session. Check the date and time.");
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(date));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="/" className="text-xl font-black tracking-tight">FIT<span className="text-emerald-400">BOOK</span></a>
          <div className="flex items-center gap-3 text-sm">
            {account ? <><span className="hidden text-slate-300 sm:inline">{account.username} · {account.role}</span><button onClick={logout} className="rounded-xl border border-white/15 px-4 py-2 hover:bg-white/10">Log out</button></> : <span className="text-slate-400">Member fitness portal</span>}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.1fr_.9fr] md:py-20">
        <div className="flex flex-col justify-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[.25em] text-emerald-400">Your hour. Your progress.</p>
          <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">Train smarter.<br /><span className="text-emerald-400">Book your slot.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Reserve hourly gym sessions, keep track of your bookings, and join the waitlist when a session is full. Simple scheduling, no guesswork.</p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[["20", "members / slot"], ["04–24", "hourly schedule"], ["FIFO", "fair waitlist"]].map(([value, label]) => <div key={value} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xl font-black text-emerald-400">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>)}
          </div>
        </div>

        {!account ? (
          <form onSubmit={login} className="rounded-3xl border border-white/10 bg-white/[.05] p-6 shadow-2xl shadow-emerald-950/20 sm:p-8">
            <div className="mb-7"><p className="text-sm font-bold text-emerald-400">MEMBER ACCESS</p><h2 className="mt-2 text-2xl font-bold">Welcome back</h2><p className="mt-2 text-sm text-slate-400">Use the credentials provided by your gym administrator.</p></div>
            <label className="mb-2 block text-sm text-slate-300" htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className="mb-5 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400" />
            <label className="mb-2 block text-sm text-slate-300" htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="mb-6 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400" />
            <button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50">{busy ? "Please wait…" : "Sign in"}</button>
            <p className="mt-4 text-xs leading-5 text-slate-500">Accounts are issued by the gym. Public registration is disabled.</p>
          </form>
        ) : account.role === "ADMIN" ? (
          <form onSubmit={createSession} className="rounded-3xl border border-white/10 bg-white/[.05] p-6 sm:p-8">
            <p className="text-sm font-bold text-emerald-400">ADMIN CONSOLE</p><h2 className="mt-2 text-2xl font-bold">Create a session</h2><p className="mt-2 text-sm text-slate-400">Choose a future start time on the hour, between 4 AM and 11 PM IST.</p>
            <label htmlFor="startsAt" className="mb-2 mt-6 block text-sm text-slate-300">Session start (your browser time)</label>
            <input id="startsAt" type="datetime-local" value={adminStartsAt} onChange={(e) => setAdminStartsAt(e.target.value)} required className="mb-5 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white" />
            <button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? "Please wait…" : "Create session"}</button>
            <p className="mt-4 text-xs text-slate-500">The server validates session times and assigns a capacity of 20.</p>
          </form>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[.05] p-6 sm:p-8">
            <p className="text-sm font-bold text-emerald-400">YOUR MEMBERSHIP</p><h2 className="mt-2 text-2xl font-bold">You’re checked in to FITBOOK</h2><p className="mt-3 text-slate-400">Member code: <span className="font-semibold text-white">{account.memberCode}</span></p>
            <button onClick={loadBookings} className="mt-6 rounded-xl border border-white/15 px-4 py-2 hover:bg-white/10">Refresh my bookings</button>
            <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-900 p-4"><p className="text-2xl font-black">{bookings.filter((b) => b.status === "CONFIRMED").length}</p><p className="text-sm text-slate-400">Confirmed</p></div><div className="rounded-2xl bg-slate-900 p-4"><p className="text-2xl font-black">{waitlist.length}</p><p className="text-sm text-slate-400">Waitlists</p></div></div>
          </div>
        )}
      </section>

      {notice && <div role="status" className="mx-auto mb-6 max-w-6xl px-5"><p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</p></div>}

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest text-emerald-400">Schedule</p><h2 className="mt-2 text-3xl font-black">Upcoming sessions</h2></div><button onClick={loadSessions} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Refresh</button></div>
        {sessions.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">No upcoming sessions have been published yet.</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sessions.filter((s) => new Date(s.startsAt) > new Date()).map((session) => {
          const own = bookings.find((b) => b.sessionId === session.id && b.status !== "CANCELLED");
          const queued = waitlist.some((w) => w.sessionId === session.id);
          return <article key={session.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold">{dateLabel(session.startsAt)}</p><p className="mt-1 text-sm text-slate-400">1-hour gym session</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">Capacity {session.capacity}</span></div>{account?.role === "MEMBER" && <button disabled={busy || Boolean(own) || queued} onClick={() => bookSession(session.id)} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">{own ? "Already booked" : queued ? "On waitlist" : busy ? "Please wait…" : "Book this slot"}</button>}</article>;
        })}</div>}

        {account?.role === "MEMBER" && <div className="mt-12 grid gap-8 md:grid-cols-2"><div><h3 className="mb-4 text-xl font-bold">My bookings</h3>{bookings.length === 0 ? <p className="text-sm text-slate-400">Your bookings will appear here.</p> : <div className="space-y-3">{bookings.map((booking) => <div key={booking.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="font-semibold">{dateLabel(booking.session.startsAt)}</p><p className="mt-1 text-xs text-slate-400">{booking.status}</p></div>{booking.status === "CONFIRMED" && <button disabled={busy} onClick={() => cancelBooking(booking.id)} className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10">Cancel</button>}</div>)}</div>}</div><div><h3 className="mb-4 text-xl font-bold">My waitlist</h3>{waitlist.length === 0 ? <p className="text-sm text-slate-400">You are not on any waitlists.</p> : <div className="space-y-3">{waitlist.map((entry) => <div key={entry.id} className="rounded-xl border border-white/10 p-4"><p className="font-semibold">{dateLabel(entry.session.startsAt)}</p><p className="mt-1 text-xs text-amber-300">Waiting for a slot</p></div>)}</div>}</div></div>}
      </section>
      <footer className="border-t border-white/10 px-5 py-6 text-center text-xs text-slate-500">FITBOOK · Gym session booking · Members only</footer>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { loadContent, type Profile, type PassageRow } from "@/lib/content";

type Stage = "loading" | "auth" | "onboarding" | "game";
const FREE_AVATARS = ["🧒", "👧", "👦", "🧑", "👱", "🧕"];

export default function Home() {
  const [stage, setStage] = useState<Stage>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const changePassage = useCallback(() => setStage("onboarding"), []);

  async function route(s: Session | null) {
    setSession(s);
    if (!s) { setStage("auth"); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setProfile(data as Profile | null);
    setStage(data && data.passage_id ? "game" : "onboarding");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => route(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") route(s);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === "loading") return <div className="loading">📖 Loading…</div>;
  if (stage === "auth") return <Auth />;
  if (stage === "onboarding" && session)
    return <Onboarding session={session} profile={profile} onDone={(p) => { setProfile(p); setStage("game"); }} />;
  if (stage === "game" && session && profile)
    return <Game session={session} profile={profile} onChangePassage={changePassage} />;
  return null;
}

// ---------------------------------------------------------------------------
function Auth() {
  const [tab, setTab] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (tab === "signup") {
        if (!name.trim()) throw new Error("Please type your first name.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { display_name: name.trim() } }
        });
        if (error) throw error;
        if (!data.session) setInfo("Almost there! Open the email we just sent and tap the link to confirm. Then come back and log in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (ex: unknown) {
      const m = ex instanceof Error ? ex.message : String(ex);
      setErr(/invalid login/i.test(m) ? "Wrong email or password." : m);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="logo"><span className="e">📖</span><h1>Bible Quest</h1><p>Study your Adventurer Bible Game passage!</p></div>
      <div className="card">
        <div className="tabs">
          <button className={tab === "signup" ? "on" : ""} onClick={() => setTab("signup")} type="button">New player</button>
          <button className={tab === "login" ? "on" : ""} onClick={() => setTab("login")} type="button">I have an account</button>
        </div>
        <form onSubmit={submit}>
          {tab === "signup" && (
            <label className="field"><span>Your first name</span>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="given-name" />
            </label>
          )}
          <label className="field"><span>Email {tab === "signup" && <small className="note">(a parent&apos;s email is fine)</small>}</span>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field"><span>Password <small className="note">(at least 6 letters)</small></span>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              autoComplete={tab === "signup" ? "new-password" : "current-password"} />
          </label>
          <div className="err">{err}</div>
          {info && <p className="note" style={{ color: "var(--good)", fontWeight: 700 }}>{info}</p>}
          <button className="btn big wide" disabled={busy} type="submit">{tab === "signup" ? "🚀 Create my account" : "▶ Log in"}</button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Onboarding({ session, profile, onDone }: { session: Session; profile: Profile | null; onDone: (p: Profile) => void }) {
  const [passages, setPassages] = useState<PassageRow[]>([]);
  const [name, setName] = useState<string>(profile?.display_name || (session.user.user_metadata?.display_name as string) || "");
  const [avatar, setAvatar] = useState(profile?.avatar || "🧒");
  const [pid, setPid] = useState<string | null>(profile?.passage_id || null);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("passages").select("id,title,sort").order("sort").then(({ data }) => setPassages((data || []) as PassageRow[]));
  }, []);

  async function save() {
    if (!name.trim()) { setErr("Type your name."); return; }
    if (!pid) { setErr("Choose your passage."); return; }
    const row = { id: session.user.id, display_name: name.trim(), avatar, passage_id: pid, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("profiles").upsert(row).select().single();
    if (error) { setErr(error.message); return; }
    onDone(data as Profile);
  }

  return (
    <div className="auth" style={{ maxWidth: 560 }}>
      <div className="logo"><span className="e">🗺️</span><h1>Let&apos;s get ready!</h1></div>
      <div className="card">
        <label className="field"><span>Your name</span>
          <input id="display-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </label>
        <div className="field"><span>Pick your hero</span>
          <div className="avatars">{FREE_AVATARS.map((a) => (
            <button key={a} type="button" className={a === avatar ? "on" : ""} onClick={() => setAvatar(a)}>{a}</button>
          ))}</div>
        </div>
        <div className="field"><span>Which passage are you studying?</span>
          <div className="pick-list">{passages.map((p) => (
            <button key={p.id} type="button" className={"pick" + (p.id === pid ? " on" : "")} onClick={() => setPid(p.id)}>
              <span className="n">{p.sort}</span>{p.title}
            </button>
          ))}</div>
        </div>
        <div className="err">{err}</div>
        <button className="btn big wide good" type="button" onClick={save}>⚔️ Start my quest!</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Game({ session, profile, onChangePassage }: { session: Session; profile: Profile; onChangePassage: () => void }) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const engineRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const userId = session.user.id;
    const pid = profile.passage_id as string;
    (async () => {
      try {
        const [{ content, titles }, prog] = await Promise.all([
          loadContent(pid),
          supabase.from("progress").select("state").eq("user_id", userId).maybeSingle()
        ]);
        if (cancelled) return;
        let all: Record<string, unknown> = (prog.data?.state as { byPassage?: Record<string, unknown> })?.byPassage || {};
        setReady(true);
        await new Promise((r) => setTimeout(r, 0));
        const { startGame } = await import("@/lib/engine");
        if (cancelled) return;
        engineRef.current = startGame({
          userId, content, profile, initialState: all[pid] || null,
          onSave: async (state: unknown, sum: Record<string, number | string>) => {
            all = { ...all, [pid]: state };
            await supabase.from("progress").upsert({ user_id: userId, state: { byPassage: all }, updated_at: new Date().toISOString() });
            await supabase.from("profiles").update({
              xp: sum.xp, level: sum.level, mastery: sum.mastery, streak: sum.streak, bosses: sum.bosses,
              avatar: sum.avatar, updated_at: new Date().toISOString()
            }).eq("id", userId);
          },
          saveTiming: async (c: number, v: number, videoId: string, sec: number) => {
            await supabase.from("verse_timings").upsert({ book: "Acts", c, v, video_id: videoId, start_sec: sec, updated_by: userId, updated_at: new Date().toISOString() });
          },
          loadTeam: async () => {
            const { data } = await supabase.from("profiles").select("id,display_name,avatar,passage_id,xp,level,mastery,streak,bosses");
            return (data || []).map((r) => ({ ...r, passage_title: titles[r.passage_id as string] || "" }));
          },
          reportError: (message: string, detail: string) => {
            supabase.from("client_errors").insert({ user_id: userId, message, detail, user_agent: navigator.userAgent }).then(() => {});
          },
          onSignOut: () => supabase.auth.signOut(),
          onChangePassage
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; engineRef.current?.destroy(); engineRef.current = null; };
  }, [session.user.id, profile, onChangePassage]);

  if (error) return <div className="loading">😢 {error}<br /><button className="btn" onClick={() => location.reload()}>Try again</button></div>;
  return (
    <>
      {!ready && <div className="loading">📖 Loading your quest…</div>}
      <header id="topbar" className="topbar" />
      <main id="app" className="app" />
      <div id="toast-layer" className="toast-layer" aria-live="polite" />
      <div id="fx-layer" className="fx-layer" aria-hidden="true" />
    </>
  );
}

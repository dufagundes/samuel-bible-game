import { supabase } from "@/lib/supabase";
import QUOTES from "@/content/quotes.json";

export type Profile = {
  id: string; display_name: string; avatar: string; passage_id: string | null;
  xp: number; level: number; mastery: number; streak: number; bosses: number;
};
export type PassageRow = { id: string; title: string; sort: number };

type Range = [[number, number], [number, number]];

/** Loads everything the game engine needs for one passage (only works when signed in). */
export async function loadContent(passageId: string) {
  const [p, w, q, all] = await Promise.all([
    supabase.from("passages").select("*").eq("id", passageId).single(),
    supabase.from("worlds").select("*").eq("passage_id", passageId).order("idx"),
    supabase.from("questions").select("world_idx,ref,prompt,answer,wrong").eq("passage_id", passageId).order("id"),
    supabase.from("passages").select("id,title")
  ]);
  if (p.error) throw p.error;
  if (w.error) throw w.error;
  if (q.error) throw q.error;
  const passage = p.data;

  const v = await supabase.from("verses").select("c,v,text").eq("book", passage.book)
    .gte("c", passage.start_c).lte("c", passage.end_c).order("c").order("v").limit(1000);
  if (v.error) throw v.error;
  const inRange = (c: number, vv: number) =>
    (c > passage.start_c || (c === passage.start_c && vv >= passage.start_v)) &&
    (c < passage.end_c || (c === passage.end_c && vv <= passage.end_v));
  const verses = (v.data || []).filter((r) => inRange(r.c, r.v)).map((r) => ({ c: r.c, v: r.v, t: r.text }));

  const videos: Record<string, string> = passage.videos || {};
  const timings: Record<string, Record<string, number>> = {};
  const ids = Object.values(videos);
  if (ids.length) {
    const t = await supabase.from("verse_timings").select("c,v,video_id,start_sec").in("video_id", ids);
    (t.data || []).forEach((r) => { (timings[r.video_id] ||= {})[r.c + ":" + r.v] = Number(r.start_sec); });
  }

  const bank: Record<number, (string | string[])[][]> = {};
  (q.data || []).forEach((r) => { (bank[r.world_idx] ||= []).push([r.ref, r.prompt, r.answer, ...r.wrong]); });

  const worlds = (w.data || []).map((r) => ({
    id: r.idx, name: r.name, icon: r.icon, color: r.color, story: r.story, boss: r.boss,
    range: [[r.start_c, r.start_v], [r.end_c, r.end_v]] as Range
  }));

  const titles: Record<string, string> = {};
  (all.data || []).forEach((r) => { titles[r.id] = r.title; });

  // "Who said it?" speakers for the quotes inside this passage (the quote text comes from the verses)
  const quotes = (QUOTES as { c: number; v: number; n: number; speaker: string }[]).filter((x) => inRange(x.c, x.v));

  return {
    titles,
    content: {
      passage: { id: passage.id, title: passage.title },
      verses, worlds, bank, videos, timings, quotes,
      finalBoss: { name: "The Grand Champion of Acts", emoji: "🐲", taunt: "Only a true Bible Champion knows ALL of " + passage.title + "!" }
    }
  };
}

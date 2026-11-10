/* Bible Quest game engine — runs one player's passage (worlds, quizzes, bosses, review, reader).
 * A gamified study app for the Adventurer Bible Game (ABG).
 * No build step, no server: everything runs in the browser and progress is saved in localStorage.
 */
export function startGame(opts) {
  "use strict";
  const C = opts.content;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const STORE_KEY = "bible-quest-" + opts.userId + "-" + C.passage.id;
  const ROUND_SIZE = 20;
  const DAILY_SIZE = 10;
  const PRACTICE_PASS = 12;        // 60% to unlock the boss
  const BOSS_PASS = 16;            // 80% to defeat a boss
  const BOSS_HEARTS = 5;           // 5 wrong answers = defeat (so 16/20 is needed)
  const QUESTION_TIME = 30;        // seconds per question in boss battles
  const WORLDS = C.worlds;
  const BANK = C.bank;
  const FINAL = C.finalBoss;
  const PASSAGE = C.passage;

  const AVATARS = [
    { e: "🧒", price: 0, name: "Samuel" },
    { e: "🐑", price: 40, name: "Little Lamb" },
    { e: "🕊️", price: 60, name: "Dove" },
    { e: "🐟", price: 60, name: "Fish" },
    { e: "🦁", price: 100, name: "Lion of Judah" },
    { e: "⛵", price: 100, name: "Sailor" },
    { e: "🛡️", price: 150, name: "Shield of Faith" },
    { e: "🦅", price: 150, name: "Eagle" },
    { e: "🧺", price: 200, name: "Basket Escape" },
    { e: "👑", price: 300, name: "Crown of Life" },
    { e: "🦸", price: 400, name: "Bible Hero" },
    { e: "🏆", price: 600, name: "Champion" }
  ];

  const RANKS = [
    [1, "Little Lamb"], [3, "Young Disciple"], [5, "Scroll Seeker"], [8, "Bold Preacher"],
    [11, "Faithful Witness"], [15, "Mighty Apostle"], [20, "Bible Champion"]
  ];

  const STOP = new Set(("the and that this with them they their there then than unto upon from into were have hath " +
    "which when what whom whose shall will would should could been being also even said saith thee thou thy thine " +
    "him his her hers she you your ye our ours for not but all any are was had did does doth one some such very " +
    "after before while where wherefore therefore because came come went made make many much more most other " +
    "these those every about against among through himself myself itself again how who why now let yet nor own " +
    "until well same both each just only over under out off way").split(" "));

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  const vkey = (c, v) => c + ":" + v;
  const clean = (w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "");

  // Parse "9:13-14" or "10:5" → {c, v1, v2}
  function parseRef(ref) {
    const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(ref);
    return { c: +m[1], v1: +m[2], v2: m[3] ? +m[3] : +m[2] };
  }
  function refLabel(c, v1, v2) { return "Acts " + c + ":" + v1 + (v2 && v2 !== v1 ? "–" + v2 : ""); }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  function defaultState() {
    const worlds = {};
    WORLDS.forEach((w) => { worlds[w.id] = { studied: false, practiceBest: 0, bossBest: 0, stars: 0, beaten: false }; });
    return {
      name: "Samuel", avatar: "🧒", owned: ["🧒"],
      xp: 0, coins: 0,
      streak: { count: 0, last: null },
      worlds, finalBeaten: false, finalBest: 0,
      history: [], verseStats: {}, qStats: {}, mistakes: {},
      badges: [], listened: 0, studyMinutes: 0, fixed: 0, perfects: 0, bossesBeaten: 0,
      dailyDone: null, totalCorrect: 0, totalAnswered: 0, bestCombo: 0,
      settings: { rate: 0.9, voice: "", timer: true, sound: true, unlockAll: false },
      updatedAt: 0
    };
  }

  let S = load();
  function hydrate(raw) {
    const d = Object.assign(defaultState(), raw || {});
    d.settings = Object.assign(defaultState().settings, d.settings || {});
    WORLDS.forEach((w) => { if (!d.worlds[w.id]) d.worlds[w.id] = defaultState().worlds[w.id]; });
    return d;
  }
  function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { /* ignore */ }
    const cloud = opts.initialState || null;
    // use whichever copy is newer (the cloud copy wins on a new device)
    const pick = local && (!cloud || (local.updatedAt || 0) > (cloud.updatedAt || 0)) ? local : cloud;
    const d = hydrate(pick);
    if (opts.profile) { d.name = opts.profile.display_name || d.name; d.avatar = opts.profile.avatar || d.avatar; }
    return d;
  }
  let saveTimer = null;
  function save() {
    S.updatedAt = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 1500);
  }
  function summary() {
    return {
      xp: S.xp, level: levelInfo().L, mastery: masteryPct(), streak: S.streak.count || 0,
      bosses: WORLDS.filter((w) => S.worlds[w.id].beaten).length + (S.finalBeaten ? 1 : 0),
      avatar: S.avatar, name: S.name
    };
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (opts.onSave) Promise.resolve(opts.onSave(JSON.parse(JSON.stringify(S)), summary())).catch(() => {});
  }
  function masteryPct() {
    const n = VERSES.filter((x) => { const st = S.verseStats[vkey(x.c, x.v)]; return st && st.r + st.w >= 2 && st.r / (st.r + st.w) >= 0.8; }).length;
    return Math.round((n / VERSES.length) * 100);
  }

  // ---------------------------------------------------------------------------
  // Verses
  // ---------------------------------------------------------------------------
  const VERSES = C.verses;
  const CHAPTERS = Array.from(new Set(VERSES.map((x) => x.c)));
  const TIMINGS = C.timings || {};   // { videoId: { "c:v": seconds } }
  const VERSE_INDEX = {};
  VERSES.forEach((x, i) => { VERSE_INDEX[vkey(x.c, x.v)] = i; });
  function verseText(c, v) {
    const k = vkey(c, v);
    const i = VERSE_INDEX[k];
    return i == null ? "" : VERSES[i].t;
  }
  function versionLabel() { return "NKJV"; }
  function versesInRange(range) {
    const [[c1, v1], [c2, v2]] = range;
    const a = VERSE_INDEX[vkey(c1, v1)], b = VERSE_INDEX[vkey(c2, v2)];
    return VERSES.slice(a, b + 1).map((x) => ({ c: x.c, v: x.v }));
  }
  function worldOfVerse(c, v) {
    const i = VERSE_INDEX[vkey(c, v)];
    return WORLDS.find((w) => i >= VERSE_INDEX[vkey(...w.range[0])] && i <= VERSE_INDEX[vkey(...w.range[1])]);
  }
  function rangeLabel(range) {
    const [[c1, v1], [c2, v2]] = range;
    return c1 === c2 ? "Acts " + c1 + ":" + v1 + "–" + v2 : "Acts " + c1 + ":" + v1 + " – " + c2 + ":" + v2;
  }

  // ---------------------------------------------------------------------------
  // Questions
  // ---------------------------------------------------------------------------
  function handQuestions(worldId) {
    return (BANK[worldId] || []).map((row, i) => {
      const [ref, prompt, answer, ...wrong] = row;
      const r = parseRef(ref);
      return { id: "h" + worldId + "-" + i, type: "mc", world: worldId, ref, c: r.c, v1: r.v1, v2: r.v2, prompt, answer, wrong };
    });
  }

  function keywords(c, v) {
    const text = verseText(c, v);
    const out = [];
    const re = /\S+/g; let m;
    while ((m = re.exec(text))) {
      const w = clean(m[0]);
      if (w.length < 4 && !/^(six|two|ten)$/i.test(w)) continue;
      if (STOP.has(w.toLowerCase())) continue;
      if (/'/.test(w) && w.length < 6) continue;
      const start = m.index + m[0].indexOf(w);
      const prev = text.slice(0, start).replace(/\s+$/, "").slice(-1);
      // a "name" is a capitalised word that is not just starting a sentence/quote
      const name = /^[A-Z]/.test(w) && start > 0 && !/[.:;?!(]/.test(prev) && !/'s$/.test(w) && !/^(Behold|Arise|Rise|Stand|Brother|Saying|Not|Go|Send)$/.test(w);
      out.push({ w, start, name });
    }
    return out;
  }

  // "Complete the verse" question generated from the verse text itself.
  function blankQuestion(c, v, worldId) {
    const kws = keywords(c, v);
    if (!kws.length) return null;
    // prefer names / capitalised words and numbers, they are the most "quizzable"
    const strong = kws.filter((k) => k.name || /^(three|two|four|six|eight|ninth|sixth|third|night|basket|vessel|vision|tanner|centurion|sheet|scales|water|prayers|alms|widows|garments)$/i.test(k.w));
    const src = strong.length && Math.random() < 0.75 ? strong : kws;
    const pick = src[rand(src.length)];
    const answer = pick.w;
    const cap = pick.name;
    const world = WORLDS.find((w) => w.id === worldId);
    const poolVerses = versesInRange(world.range);
    let pool = [];
    const okWord = (k) => k.w.toLowerCase() !== answer.toLowerCase() && !/'s$/.test(k.w) && (cap ? k.name : !/^[A-Z]/.test(k.w));
    poolVerses.forEach((pv) => keywords(pv.c, pv.v).forEach((k) => { if (okWord(k)) pool.push(k.w); }));
    pool = Array.from(new Set(pool));
    if (pool.length < 3) {
      VERSES.forEach((x) => keywords(x.c, x.v).forEach((k) => { if (okWord(k)) pool.push(k.w); }));
      pool = Array.from(new Set(pool));
    }
    // Prefer distractors of similar length so the answer doesn't stand out.
    pool = shuffle(pool).sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length));
    let wrong = shuffle(pool.slice(0, 8)).slice(0, 3);
    // Numbers get number distractors ("three" → "two", "seven", "four"...)
    const NUMS = ["two", "three", "four", "six", "seven", "eight", "twelve", "forty"];
    const ORDS = ["first", "third", "sixth", "ninth", "twelfth"];
    const lower = answer.toLowerCase();
    const fam = NUMS.includes(lower) ? NUMS : ORDS.includes(lower) ? ORDS : null;
    if (fam) wrong = shuffle(fam.filter((x) => x !== lower)).slice(0, 3);
    const text = verseText(c, v);
    const before = text.slice(0, pick.start), after = text.slice(pick.start + answer.length);
    return {
      id: "b" + c + ":" + v + "-" + answer.toLowerCase(), type: "blank", world: worldId,
      ref: c + ":" + v, c, v1: v, v2: v, before, after, answer, wrong,
      prompt: "Complete the verse"
    };
  }

  function chapterQuestion(c, v) {
    const text = verseText(c, v);
    const words = text.split(/\s+/);
    const snippet = words.length > 22 ? words.slice(0, 20).join(" ") + "…" : text;
    return {
      id: "c" + c + ":" + v, type: "chapter", world: worldOfVerse(c, v).id, ref: c + ":" + v, c, v1: v, v2: v,
      prompt: "In which chapter of Acts is this verse?", quote: snippet,
      answer: "Acts " + c, wrong: shuffle(CHAPTERS.filter((x) => x !== c)).slice(0, 3).map((x) => "Acts " + x)
    };
  }

  function withOptions(q) {
    q.options = shuffle([q.answer].concat(q.wrong));
    return q;
  }

  function weight(q) {
    const st = S.qStats[q.id];
    let w = Math.random();
    if (!st) w -= 0.6;                         // never seen → first
    else w += (st.correct / Math.max(1, st.seen)) - 0.5;   // weakest next
    if (S.mistakes[q.id]) w -= 0.8;            // missed questions come back
    return w;
  }
  function pickWeighted(list, n) { return list.map((q) => [weight(q), q]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]); }

  function blanksFor(worldIds, n, used) {
    const verses = shuffle([].concat(...worldIds.map((id) => versesInRange(WORLDS.find((w) => w.id === id).range).map((x) => [x, id]))));
    const out = [];
    for (const [x, id] of verses) {
      if (out.length >= n) break;
      const q = blankQuestion(x.c, x.v, id);
      if (q && !used.has(q.id)) { used.add(q.id); out.push(q); }
    }
    return out;
  }

  function buildRound(mode, worldIds) {
    const used = new Set();
    let qs = [];
    if (mode === "final") {
      worldIds.forEach((id) => qs.push(...pickWeighted(handQuestions(id), 2)));
      const taken = new Set(qs.map((q) => q.id));
      const rest = shuffle([].concat(...worldIds.map(handQuestions)).filter((q) => !taken.has(q.id)));
      qs.push(...pickWeighted(rest, 14 - qs.length));
      qs.forEach((q) => used.add(q.id));
      qs.push(...blanksFor(worldIds, 4, used));
      const allV = shuffle(VERSES).slice(0, 2);
      allV.forEach((x) => qs.push(chapterQuestion(x.c, x.v)));
    } else if (mode === "daily") {
      const missed = Object.values(S.mistakes).map((m) => m.q).filter((q) => worldIds.includes(q.world));
      qs.push(...shuffle(missed).slice(0, 4));
      qs.forEach((q) => used.add(q.id));
      const pool = [].concat(...worldIds.map(handQuestions)).filter((q) => !used.has(q.id));
      qs.push(...pickWeighted(pool, DAILY_SIZE - qs.length - 2));
      qs.forEach((q) => used.add(q.id));
      qs.push(...blanksFor(worldIds, DAILY_SIZE - qs.length, used));
    } else {
      const handCount = mode === "boss" ? 16 : 14;
      const pool = [].concat(...worldIds.map(handQuestions));
      qs = pickWeighted(pool, Math.min(handCount, pool.length));
      qs.forEach((q) => used.add(q.id));
      qs.push(...blanksFor(worldIds, ROUND_SIZE - qs.length, used));
      if (qs.length < ROUND_SIZE) {   // tiny world: top up with any remaining hand questions
        qs.push(...shuffle(pool.filter((q) => !qs.includes(q))).slice(0, ROUND_SIZE - qs.length));
      }
    }
    return shuffle(qs).map((q) => withOptions(Object.assign({}, q)));
  }

  // ---------------------------------------------------------------------------
  // Sound effects (WebAudio, no files needed)
  // ---------------------------------------------------------------------------
  let actx = null;
  function tone(freq, dur, type = "sine", when = 0, vol = 0.18) {
    if (!S.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + when;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* ignore */ }
  }
  const SFX = {
    good() { tone(660, 0.12, "triangle"); tone(990, 0.18, "triangle", 0.1); },
    combo() { tone(784, 0.1, "square", 0, 0.08); tone(1047, 0.1, "square", 0.08, 0.08); tone(1319, 0.2, "square", 0.16, 0.08); },
    bad() { tone(200, 0.25, "sawtooth", 0, 0.12); tone(150, 0.3, "sawtooth", 0.12, 0.1); },
    click() { tone(520, 0.05, "triangle", 0, 0.08); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", i * 0.13)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "sine", i * 0.2)); },
    hit() { tone(120, 0.15, "square", 0, 0.12); tone(80, 0.2, "sawtooth", 0.05, 0.1); },
    coin() { tone(988, 0.08, "square", 0, 0.06); tone(1319, 0.2, "square", 0.07, 0.06); }
  };

  // ---------------------------------------------------------------------------
  // Text-to-speech with word-by-word highlighting
  // ---------------------------------------------------------------------------
  const TTS = {
    ok: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    items: [], idx: 0, playing: false, paused: false, timers: [], utter: null,
    boundaryWorks: false, onEnd: null, onState: null, repeat: false,
    voices() {
      if (!this.ok) return [];
      try { return speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang)); } catch (e) { return []; }
    },
    voice() {
      const vs = this.voices();
      if (!vs.length) return null;
      return vs.find((v) => v.name === S.settings.voice) ||
        vs.find((v) => /en-US/i.test(v.lang) && /(Samantha|Google US|Aria|Jenny|Natural)/i.test(v.name)) ||
        vs.find((v) => /en-US/i.test(v.lang)) || vs[0];
    },
    // items: [{ el, text }]
    play(items, opts = {}) {
      if (!this.ok) { toast("Audio is not supported on this browser 😢"); return; }
      this.stop(true);
      this.items = items; this.idx = opts.start || 0; this.onEnd = opts.onEnd || null; this.onState = opts.onState || null;
      this.onItemEnd = opts.onItemEnd || null;
      this.playing = true; this.paused = false;
      this._emit();
      this._speak();
    },
    _emit() { if (this.onState) this.onState(this.playing, this.paused); },
    _speak() {
      if (!this.playing) return;
      if (this.idx >= this.items.length) {
        if (this.repeat && this.items.length) { this.idx = 0; } else { this._finish(); return; }
      }
      const it = this.items[this.idx];
      $$(".verse.active").forEach((e) => e.classList.remove("active"));
      if (it.el) {
        it.el.classList.add("active");
        it.el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const u = new SpeechSynthesisUtterance(it.text);
      const v = this.voice();
      if (v) u.voice = v;
      u.lang = (v && v.lang) || "en-US";
      u.rate = S.settings.rate;
      let gotBoundary = false, t0 = 0;
      this.pausedDuring = false;
      u.onboundary = (e) => {
        if (this.utter !== u) return;
        if (e.name && e.name !== "word") return;
        gotBoundary = true; this.boundaryWorks = true;
        this._clearTimers();
        markWord(it.el, e.charIndex);
      };
      u.onstart = () => {
        if (this.utter !== u) return;
        t0 = performance.now();
        // Most phone voices never send word events: estimate the timing right away
        // (if real word events arrive, they replace the estimate).
        if (!this.boundaryWorks) this._fallback(it, 0, 0);
        else this.timers.push(setTimeout(() => { if (!gotBoundary && this.utter === u) this._fallback(it, 0, performance.now() - t0); }, 600));
      };
      u.onend = () => {
        if (this.utter !== u) return;
        // Learn this voice's real speed so the highlight keeps up with the audio.
        const secs = (performance.now() - t0) / 1000;
        if (!gotBoundary && t0 && !this.pausedDuring && secs > 1) {
          const measured = speechLen(it.text) / secs / S.settings.rate;
          if (measured > 6 && measured < 40) this.cps1 = this.cps1 * 0.3 + measured * 0.7;
        }
        this._clearTimers(); markWord(it.el, -1);
        if (this.onItemEnd) this.onItemEnd(it);
        this.idx++;
        setTimeout(() => this._speak(), 250);
      };
      u.onerror = (e) => {
        if (this.utter !== u) return;
        if (e.error === "interrupted" || e.error === "canceled") return;
        this._clearTimers(); this.idx++; this._speak();
      };
      this.utter = u;
      try { speechSynthesis.speak(u); } catch (e) { this.ok = false; this._finish(); }
    },
    cps1: 17,   // speech speed in "characters per second" at rate 1 (re-measured after every verse)
    _fallback(it, fromChar, elapsedMs) {
      if (!it.el) return;
      const cps = this.cps1 * S.settings.rate;
      const base = speechLen(it.text.slice(0, fromChar));
      $$(".w", it.el).forEach((span) => {
        const st = +span.dataset.s;
        if (st < fromChar) return;
        const delay = ((speechLen(it.text.slice(0, st)) - base) / cps) * 1000 - (elapsedMs || 0);
        this.timers.push(setTimeout(() => markWord(it.el, st), Math.max(0, delay)));
      });
    },
    _clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; },
    pause() {
      if (!this.playing || this.paused) return;
      this.paused = true; this.pausedDuring = true; this._clearTimers();
      try { speechSynthesis.pause(); } catch (e) { /* ignore */ } this._emit();
    },
    resume() {
      if (!this.playing || !this.paused) return;
      this.paused = false;
      try { speechSynthesis.resume(); } catch (e) { /* ignore */ }
      const it = this.items[this.idx];
      if (it && !this.boundaryWorks && it.el) {
        const cur = $(".w.hl", it.el);
        this._fallback(it, cur ? +cur.dataset.s : 0, 0);
      }
      this._emit();
    },
    stop(silent) {
      this.utter = null; this._clearTimers();
      if (this.ok) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
      const was = this.playing;
      this.playing = false; this.paused = false;
      $$(".w.hl").forEach((e) => e.classList.remove("hl"));
      $$(".verse.active").forEach((e) => e.classList.remove("active"));
      if (!silent) this._emit();
      return was;
    },
    _finish() {
      this.playing = false; this.utter = null;
      $$(".verse.active").forEach((e) => e.classList.remove("active"));
      this._emit();
      if (this.onEnd) this.onEnd();
    }
  };
  if (TTS.ok) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) { TTS.ok = false; } }

  function speechLen(text) {
    return text.length + (text.match(/[,;]/g) || []).length * 3 + (text.match(/[.:?!]/g) || []).length * 6;
  }

  // Keep a "next" button locked until the verse audio has played to the end.
  // A safety timer opens it anyway, so a child is never stuck if speech fails on a device.
  function gateUntilHeard(btn, getItems) {
    const label = btn.innerHTML;
    let open = false;
    const unlock = () => {
      if (open) return; open = true; clearTimeout(safety);
      if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; btn.classList.add("pop"); }
    };
    const items = getItems();
    const est = items.reduce((a, i) => a + speechLen(i.text), 0) / (TTS.cps1 * S.settings.rate) * 1000;
    const safety = setTimeout(unlock, est * 2 + 10000);
    if (!TTS.ok) { unlock(); return () => {}; }
    btn.disabled = true; btn.innerHTML = "🎧 Listen first…";
    return () => TTS.play(getItems(), { onEnd: unlock });
  }

  function markWord(el, charIndex) {
    if (!el) return;
    const spans = $$(".w", el);
    spans.forEach((s) => s.classList.remove("hl"));
    if (charIndex < 0) return;
    let cur = null;
    for (const s of spans) { if (+s.dataset.s <= charIndex) cur = s; else break; }
    if (cur) cur.classList.add("hl");
  }

  // Render a verse as clickable word spans (data-s = char index used by speech boundaries).
  function verseHTML(c, v, extraClass = "") {
    const text = verseText(c, v);
    let html = "", last = 0; const re = /\S+/g; let m;
    while ((m = re.exec(text))) {
      html += esc(text.slice(last, m.index)) + '<span class="w" data-s="' + m.index + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return '<div class="verse ' + extraClass + '" data-c="' + c + '" data-v="' + v + '"><span class="vn">' + c + ":" + v + '</span><div class="vt">' + html + "</div></div>";
  }

  // ---------------------------------------------------------------------------
  // Rewards, levels, badges
  // ---------------------------------------------------------------------------
  const xpForLevel = (L) => 50 * L * (L - 1);
  function levelInfo() {
    let L = 1; while (S.xp >= xpForLevel(L + 1)) L++;
    const a = xpForLevel(L), b = xpForLevel(L + 1);
    let rank = RANKS[0][1]; RANKS.forEach(([lv, r]) => { if (L >= lv) rank = r; });
    return { L, rank, into: S.xp - a, need: b - a, pct: Math.round(((S.xp - a) / (b - a)) * 100) };
  }
  function addXP(n) {
    const before = levelInfo().L;
    S.xp += n;
    const after = levelInfo();
    if (after.L > before) {
      setTimeout(() => {
        SFX.win(); confetti(50);
        modal("⭐", "Level " + after.L + "!", "You are now a <b>" + esc(after.rank) + "</b>. Keep going, " + esc(S.name) + "!");
      }, 600);
    }
  }
  function addCoins(n) { S.coins += n; }
  function touchStreak() {
    const t = today();
    if (S.streak.last === t) return;
    if (S.streak.last && dayDiff(S.streak.last, t) === 1) S.streak.count++;
    else S.streak.count = 1;
    S.streak.last = t;
  }

  const BADGES = [
    { id: "first", e: "🎉", name: "First Steps", desc: "Finish your first round", test: () => S.history.length >= 1 },
    { id: "study1", e: "📖", name: "Bible Reader", desc: "Study your first passage", test: () => WORLDS.some((w) => S.worlds[w.id].studied) },
    { id: "listen10", e: "🎧", name: "Good Listener", desc: "Listen to 10 passages", test: () => S.listened >= 10 },
    { id: "perfect", e: "💯", name: "Perfect Round", desc: "Get 20 out of 20", test: () => S.perfects >= 1 },
    { id: "combo10", e: "🔥", name: "On Fire", desc: "10 right answers in a row", test: () => S.bestCombo >= 10 },
    { id: "combo20", e: "☄️", name: "Unstoppable", desc: "20 right answers in a row", test: () => S.bestCombo >= 20 },
    { id: "boss1", e: "⚔️", name: "Boss Slayer", desc: "Defeat your first boss", test: () => S.bossesBeaten >= 1 },
    { id: "boss3", e: "🛡️", name: "Brave Warrior", desc: "Defeat 3 different bosses", test: () => WORLDS.filter((w) => S.worlds[w.id].beaten).length >= 3 },
    { id: "allboss", e: "🗺️", name: "World Explorer", desc: "Defeat all " + WORLDS.length + " world bosses", test: () => WORLDS.every((w) => S.worlds[w.id].beaten) },
    { id: "final", e: "🏆", name: "Bible Champion", desc: "Defeat the Grand Champion", test: () => S.finalBeaten },
    { id: "fix10", e: "🩹", name: "Mistake Fixer", desc: "Master 10 missed questions", test: () => S.fixed >= 10 },
    { id: "fix50", e: "🧠", name: "Super Memory", desc: "Master 50 missed questions", test: () => S.fixed >= 50 },
    { id: "streak3", e: "📅", name: "3-Day Streak", desc: "Study 3 days in a row", test: () => S.streak.count >= 3 },
    { id: "streak7", e: "🌟", name: "7-Day Streak", desc: "Study 7 days in a row", test: () => S.streak.count >= 7 },
    { id: "stars18", e: "✨", name: "Star Collector", desc: "Collect 12 boss stars", test: () => WORLDS.reduce((a, w) => a + S.worlds[w.id].stars, 0) >= 12 },
    { id: "q500", e: "🎯", name: "500 Answers", desc: "Answer 500 questions right", test: () => S.totalCorrect >= 500 },
    { id: "shop", e: "🛍️", name: "New Look", desc: "Buy a new avatar", test: () => S.owned.length >= 2 },
    { id: "arcade10", e: "🎮", name: "Arcade Star", desc: "Play 10 mini-games", test: () => !!S.arcade && S.arcade.plays >= 10 }
  ];
  function checkBadges() {
    const fresh = [];
    BADGES.forEach((b) => { if (!S.badges.includes(b.id) && b.test()) { S.badges.push(b.id); fresh.push(b); } });
    return fresh;
  }
  function announceBadges() {
    const fresh = checkBadges();
    fresh.forEach((b, i) => setTimeout(() => { toast(b.e + " New badge: " + b.name + "!", "gold"); SFX.coin(); }, 400 + i * 1200));
    if (fresh.length) save();
    return fresh;
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  const app = $("#app");
  let reported = 0;
  function report(err, where) {
    try {
      if (reported++ > 20 || !opts.reportError) return;
      const e = err || {};
      opts.reportError(String(e.message || e).slice(0, 500), (where || "") + "\n" + String(e.stack || "").slice(0, 1500));
    } catch (x) { /* never let reporting break the game */ }
  }
  function toast(msg, kind = "") {
    const t = document.createElement("div");
    t.className = "toast " + kind; t.innerHTML = msg;
    $("#toast-layer").appendChild(t);
    setTimeout(() => t.remove(), /Something went wrong/.test(msg) ? 12000 : 2800);
  }
  function confetti(n = 70) {
    const layer = $("#fx-layer");
    const bits = ["🎉", "⭐", "✨", "🎊", "💛", "💜", "🟣", "🟡", "🟢"];
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "confetti";
      s.textContent = bits[rand(bits.length)];
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDuration = 1.6 + Math.random() * 1.8 + "s";
      s.style.animationDelay = Math.random() * 0.5 + "s";
      s.style.fontSize = 16 + rand(20) + "px";
      layer.appendChild(s);
      setTimeout(() => s.remove(), 4200);
    }
  }
  function floatXP(text, x, y) {
    const f = document.createElement("div");
    f.className = "float-xp"; f.textContent = text;
    f.style.left = x + "px"; f.style.top = y + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }
  function modal(emoji, title, body, buttons) {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = '<div class="modal"><span class="e">' + emoji + "</span><h2>" + title + '</h2><p class="muted">' + body + '</p><div class="row" style="justify-content:center;margin-top:14px"></div></div>';
    const row = $(".row", back);
    (buttons || [{ label: "Awesome!", cls: "good" }]).forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "btn " + (b.cls || ""); btn.innerHTML = b.label;
      btn.onclick = () => { back.remove(); if (b.onClick) b.onClick(); };
      row.appendChild(btn);
    });
    document.body.appendChild(back);
  }

  function renderTopbar() {
    const li = levelInfo();
    $("#topbar").innerHTML =
      '<button class="me" data-top="home" aria-label="Home"><span class="avatar">' + S.avatar + '</span><span class="who"><b>' + esc(S.name) + "</b><small>" + esc(li.rank) + "</small></span></button>" +
      '<div class="xpbar"><div class="lbl"><span>Level ' + li.L + "</span><span>" + li.into + " / " + li.need + ' XP</span></div><div class="bar"><i style="width:' + li.pct + '%"></i></div></div>' +
      '<div class="pills"><button class="pill" data-top="shop" title="Coins">🪙 ' + S.coins + '</button><span class="pill" title="Days in a row">🔥 ' + (S.streak.count || 0) + "</span></div>";
    $("[data-top=home]", $("#topbar")).onclick = () => go("home");
    $("[data-top=shop]", $("#topbar")).onclick = () => go("shop");
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  let cleanup = null;
  function go(screen, params = {}) {
    if (cleanup) { cleanup(); cleanup = null; }
    try { TTS.stop(true); stopVideo(); } catch (e) { report(e, "go:stop"); }
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    try {
      renderTopbar();
      (SCREENS[screen] || SCREENS.home)(params);
    } catch (e) {
      report(e, "screen:" + screen);
      toast("⚠️ Something went wrong opening this screen: " + esc(String(e && e.message || e).slice(0, 120)));
    }
  }

  function worldUnlocked(id) {
    if (S.settings.unlockAll || id === 1) return true;
    return !!S.worlds[id - 1] && S.worlds[id - 1].beaten;
  }
  function bossUnlocked(id) { return S.settings.unlockAll || S.worlds[id].practiceBest >= PRACTICE_PASS || S.worlds[id].beaten; }
  function finalUnlocked() { return S.settings.unlockAll || WORLDS.every((w) => S.worlds[w.id].beaten); }
  function unlockedWorldIds() {
    const ids = WORLDS.filter((w) => worldUnlocked(w.id)).map((w) => w.id);
    return ids.length ? ids : [1];
  }
  const starStr = (n) => "⭐".repeat(n) + '<span style="opacity:.25">' + "⭐".repeat(3 - n) + "</span>";

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  const SCREENS = {};

  SCREENS.home = function () {
    const mistakes = Object.keys(S.mistakes).length;
    const dailyDone = S.dailyDone === today();
    const currentId = (WORLDS.find((w) => worldUnlocked(w.id) && !S.worlds[w.id].beaten) || {}).id;
    let nodes = "";
    WORLDS.forEach((w, i) => {
      const st = S.worlds[w.id], un = worldUnlocked(w.id);
      const status = !un ? "🔒 Locked" : st.beaten ? "Boss defeated!" : st.practiceBest >= PRACTICE_PASS ? "Boss is waiting! 👊" : st.studied ? "Practice time ⚔️" : "Start by studying 📖";
      if (i) nodes += '<div class="connector"></div>';
      nodes += '<div class="node-wrap"><button class="node ' + (un ? "" : "locked ") + (w.id === currentId ? "current" : "") + '" data-world="' + w.id + '">' +
        '<span class="orb" style="background:' + w.color + '">' + (un ? w.icon : "🔒") + "</span>" +
        '<span class="info"><small>World ' + w.id + " · " + rangeLabel(w.range) + "</small><b>" + esc(w.name) + "</b><small>" + status + '</small><span class="stars">' + starStr(st.stars) + "</span></span></button></div>";
    });
    const fu = finalUnlocked();
    nodes += '<div class="connector"></div><div class="node-wrap"><button class="node final ' + (fu ? "" : "locked ") + (fu && !S.finalBeaten ? "current" : "") + '" data-final="1">' +
      '<span class="orb">' + (fu ? FINAL.emoji : "🔒") + '</span><span class="info"><small>FINAL BOSS · ' + esc(PASSAGE.title) + '</small><b>' + esc(FINAL.name) + "</b><small>" +
      (S.finalBeaten ? "🏆 You are a Bible Champion! Best: " + S.finalBest + "/20" : fu ? "Ready for the final test?" : "Defeat all " + WORLDS.length + " bosses to unlock") + "</small></span></button></div>";

    app.innerHTML =
      '<div class="hero"><div><h1>Hi, ' + esc(S.name) + "! 👋</h1><p>Your quest: " + esc(PASSAGE.title) + " for the Adventurer Bible Game.</p></div></div>" +
      '<div class="quick">' +
      '<button class="tile ' + (dailyDone ? "done" : "") + '" data-act="daily"><span class="ico">🎁</span><b>Daily Quest</b><small>' + (dailyDone ? "Done today! ✅" : "10 questions · +30 🪙") + "</small></button>" +
      '<button class="tile" data-act="review"><span class="ico">🩹</span><b>Fix Mistakes</b><small>Read, listen, retry</small>' + (mistakes ? '<span class="badge">' + mistakes + "</span>" : "") + "</button>" +
      '<button class="tile" data-act="read"><span class="ico">🎧</span><b>Read &amp; Listen</b><small>All chapters</small></button>' +
      '<button class="tile" data-act="progress"><span class="ico">📈</span><b>My Progress</b><small>See how you improve</small></button>' +
      '<button class="tile" data-act="badges"><span class="ico">🏅</span><b>Badges</b><small>' + S.badges.length + " / " + BADGES.length + "</small></button>" +
      '<button class="tile" data-act="arcade"><span class="ico">🎮</span><b>Arcade</b><small>Mini-games</small></button>' +
      '<button class="tile" data-act="team"><span class="ico">🏆</span><b>My Team</b><small>Who is the most ready?</small></button>' +
      '<button class="tile" data-act="shop"><span class="ico">🛍️</span><b>Avatar Shop</b><small>Spend your coins</small></button>' +
      "</div>" +
      '<h2 class="title-white">🗺️ Quest Map</h2><div class="map"><div class="map-path">' + nodes + "</div></div>" +
      '<div class="center"><button class="back" data-act="settings">⚙️ Settings</button></div>';

    $$("[data-world]").forEach((b) => b.onclick = () => {
      const id = +b.dataset.world;
      if (!worldUnlocked(id)) { SFX.bad(); toast("🔒 Defeat the boss of World " + (id - 1) + " first!"); return; }
      SFX.click(); go("world", { id });
    });
    $("[data-final]").onclick = () => {
      if (!finalUnlocked()) { SFX.bad(); toast("🔒 Defeat all " + WORLDS.length + " world bosses first!"); return; }
      go("finalIntro");
    };
    $$("[data-act]").forEach((b) => b.onclick = () => {
      SFX.click();
      const a = b.dataset.act;
      if (a === "daily") startQuiz({ mode: "daily", worlds: unlockedWorldIds() });
      else if (a === "review") go("reviewHub");
      else if (a === "read") go("reader", { range: [[VERSES[0].c, VERSES[0].v], [VERSES[VERSES.length - 1].c, VERSES[VERSES.length - 1].v]], title: PASSAGE.title });
      else go(a);
    });
  };

  SCREENS.world = function ({ id }) {
    const w = WORLDS.find((x) => x.id === id), st = S.worlds[id];
    const bu = bossUnlocked(id);
    const canTrain = st.studied || S.settings.unlockAll;
    app.innerHTML =
      '<button class="back" data-back>← Map</button>' +
      '<div class="world-head"><span class="orb" style="background:' + w.color + '">' + w.icon + '</span><div><small>World ' + w.id + " · " + rangeLabel(w.range) + '</small><h1 class="title-white">' + esc(w.name) + "</h1><div>" + esc(w.story) + "</div></div></div>" +
      '<div class="card steps">' +
      step(st.studied, false, "📖", "1. Study", "Listen to all of " + rangeLabel(w.range) + " and follow the words as they light up. Then training unlocks!", '<button class="btn" data-study>' + (st.studied ? "Study again" : "Start") + "</button>") +
      step(st.practiceBest >= PRACTICE_PASS, !canTrain, "⚔️", "2. Training Round", canTrain ? "20 questions. Get " + PRACTICE_PASS + " right to unlock the boss. Best: " + st.practiceBest + "/20" : "🔒 First listen to the whole passage in Study (step 1)", '<button class="btn' + (canTrain ? "" : " is-locked") + '" data-practice>' + (canTrain ? "Train" : "🔒 Train") + "</button>") +
      step(false, !canTrain, "🎮", "Bonus: Mini-games", canTrain ? "Verse Catcher, Verse Builder, Story Order and Who Said It? Play to remember the verses!" : "🔒 Unlocks after you study this world", '<button class="btn gold' + (canTrain ? "" : " is-locked") + '" data-games>' + (canTrain ? "Play" : "🔒 Play") + "</button>") +
      step(st.beaten, !bu, w.boss.emoji, "3. Boss: " + esc(w.boss.name), bu ? "The boss has " + BOSS_PASS + " HP and you have " + BOSS_HEARTS + " hearts. " + starStr(st.stars) : "🔒 Get " + PRACTICE_PASS + "/20 in the Training Round first (your best: " + st.practiceBest + "/20)", '<button class="btn bad' + (bu ? "" : " is-locked") + '" data-boss>' + (bu ? "Fight!" : "🔒 Fight!") + "</button>") +
      "</div>";
    function step(done, locked, ico, title, txt, btn) {
      return '<div class="step ' + (done ? "done " : "") + (locked ? "locked" : "") + '"><span class="num">' + (done ? "✅" : ico) + '</span><div class="txt"><b>' + title + '</b><div class="muted">' + txt + "</div></div>" + btn + "</div>";
    }
    $("[data-back]").onclick = () => go("home");
    $("[data-study]").onclick = () => go("reader", { range: w.range, title: w.name, worldId: id });
    const needStudy = () => { SFX.click(); modal("🎧", "Listen first!", "Listen to the whole passage in <b>Step 1: Study</b>. When every verse has a ✓, training and the games unlock.", [
      { label: "📖 Go to Study", cls: "good", onClick: () => go("reader", { range: w.range, title: w.name, worldId: id }) }, { label: "OK", cls: "ghost" }]); };
    $("[data-practice]").onclick = () => canTrain ? startQuiz({ mode: "practice", worlds: [id] }) : needStudy();
    $("[data-games]").onclick = () => canTrain ? go("arcade", { id }) : needStudy();
    $("[data-boss]").onclick = () => {
      if (bu) return go("bossIntro", { id });
      if (!canTrain) return needStudy();
      SFX.click();
      modal(w.boss.emoji, "The boss is locked!", "To unlock " + esc(w.boss.name) + ", get <b>" + PRACTICE_PASS + " out of 20</b> in the Training Round. Your best so far: <b>" + st.practiceBest + "/20</b>.", [
        { label: "⚔️ Go to Training", cls: "good", onClick: () => startQuiz({ mode: "practice", worlds: [id] }) }, { label: "OK", cls: "ghost" }]);
    };
  };

  SCREENS.bossIntro = function ({ id }) {
    const w = WORLDS.find((x) => x.id === id);
    app.innerHTML =
      '<button class="back" data-back>← Back</button>' +
      '<div class="card center"><div style="font-size:110px">' + w.boss.emoji + "</div><h1>" + esc(w.boss.name) + '</h1><p class="taunt">“' + esc(w.boss.taunt) + '”</p>' +
      "<p>The boss has <b>" + BOSS_PASS + " HP</b>. Every right answer is a ⚔️ sword hit! You have <b>" + BOSS_HEARTS + " ❤️</b>" + (S.settings.timer ? " and <b>" + QUESTION_TIME + " seconds</b> per question ⏱️" : "") + ".</p>" +
      '<div class="rules"><span>🛡️ <b>3 right in a row</b> = Shield of Faith (blocks a mistake)</span><span>✨ <b>Holy Strike</b> = double damage. You get more by mastering verses!</span><span>⭐⭐⭐ win without losing a heart</span></div>' +
      '<button class="btn big bad" data-go>⚔️ Battle!</button></div>';
    $("[data-back]").onclick = () => go("world", { id });
    $("[data-go]", app).onclick = () => startQuiz({ mode: "boss", worlds: [id] });
  };

  SCREENS.finalIntro = function () {
    app.innerHTML =
      '<button class="back" data-back>← Map</button>' +
      '<div class="card center"><div style="font-size:120px">' + FINAL.emoji + "</div><h1>" + esc(FINAL.name) + '</h1><p class="taunt">“' + esc(FINAL.taunt) + '”</p>' +
      "<p>The FINAL TEST: <b>20 questions</b> from all of " + esc(PASSAGE.title) + ", including which chapter each verse is in.<br>" + BOSS_HEARTS + " ❤️ · the champion has " + BOSS_PASS + " HP. Beat it to become a <b>Bible Champion</b> 🏆<br>🛡️ 3 right in a row = shield · ✨ Holy Strike = double damage</p>" +
      '<button class="btn big gold" data-go>👑 Final Battle!</button></div>';
    $("[data-back]").onclick = () => go("home");
    $("[data-go]", app).onclick = () => startQuiz({ mode: "final", worlds: WORLDS.map((w) => w.id) });
  };

  // ---------------- Reader ----------------
  // ---------------- YouTube read-along ----------------
  // The chapter videos are played with the official YouTube player. Each verse's start time
  // (set once with "Sync" and shared by everyone) lets us highlight the verse and the word being read.
  let videoCtl = null;
  function stopVideo() { if (videoCtl) { videoCtl.destroy(); videoCtl = null; } }
  let ytPromise = null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (ytPromise) return ytPromise;
    ytPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
    return ytPromise;
  }
  function timingsFor(videoId) { return TIMINGS[videoId] || (TIMINGS[videoId] = {}); }

  SCREENS.reader = function ({ range, title, worldId, focus, back }) {
    const verses = versesInRange(range);
    const chapters = Array.from(new Set(verses.map((x) => x.c)));
    const videoChapters = chapters.filter((c) => C.videos && C.videos[c]);
    let mode = videoChapters.length && S.settings.readMode !== "voice" ? "video" : "voice";
    let html = "", lastC = null;
    verses.forEach((x) => {
      if (x.c !== lastC) { html += '<div class="chap-title">Acts ' + x.c + "</div>"; lastC = x.c; }
      html += verseHTML(x.c, x.v, focus && focus.c === x.c && x.v >= focus.v1 && x.v <= focus.v2 ? "focus" : "");
    });
    const rates = [[0.7, "🐢 Slow"], [0.9, "🙂 Normal"], [1.1, "🐇 Fast"]];
    app.innerHTML =
      '<button class="back" data-back>← Back</button>' +
      '<h1 class="title-white">📖 ' + esc(title || rangeLabel(range)) + '</h1><p class="title-white" style="margin-top:-6px;opacity:.85">' + rangeLabel(range) + " · tap any verse to listen from there</p>" +
      (videoChapters.length ? '<div class="seg mode-seg"><button data-mode="video">🎬 Video</button><button data-mode="voice">🔊 Robot voice</button></div>' : "") +
      '<div class="card video-card" data-videocard hidden>' +
      '<div class="row chap-tabs">' + videoChapters.map((c) => '<button class="toggle" data-vchap="' + c + '">Acts ' + c + "</button>").join("") + "</div>" +
      '<div class="yt-wrap"><div data-yt></div></div>' +
      '<div class="row video-bar"><span class="muted" data-vstatus></span><span class="spacer"></span><button class="toggle" data-sync>🎯 Sync verses</button></div>' +
      '<div class="sync-panel" data-syncpanel hidden><p class="muted">Play the video. Tap the big button the moment each verse <b>starts</b>. This is saved for everyone on the team.</p>' +
      '<div class="row"><button class="btn big gold" data-tap>👆 Verse starts now</button><button class="btn small ghost" data-undo>↩ Undo</button></div></div>' +
      "</div>" +
      '<div class="reader-controls" data-voicebar>' +
      '<button class="btn small good" data-play>▶ Play</button>' +
      '<button class="btn small ghost" data-stop>⏹ Stop</button>' +
      '<span class="seg" data-rates>' + rates.map(([r, l]) => '<button data-rate="' + r + '" class="' + (Math.abs(S.settings.rate - r) < 0.01 ? "on" : "") + '">' + l + "</button>").join("") + "</span>" +
      '<button class="toggle" data-repeat>🔁 Repeat</button>' +
      '<span class="spacer"></span><span class="version-tag">' + esc(versionLabel()) + "</span></div>" +
      '<div class="row" style="margin-bottom:10px"><button class="toggle" data-hide>🙈 Memory mode</button></div>' +
      '<div class="card" data-verses>' + html + "</div>" +
      '<div class="reader-foot"><div class="heard-pill" data-heard></div>' +
      (worldId ? '<button class="btn big" data-train disabled>⚔️ Go to training</button>' : "") + "</div>";

    const box = $("[data-verses]");
    const verseEl = (c, v) => $('.verse[data-c="' + c + '"][data-v="' + v + '"]', box);
    const items = () => $$(".verse", box).map((el) => ({ el, text: verseText(+el.dataset.c, +el.dataset.v) }));
    const playBtn = $("[data-play]");
    let listenedAll = false;
    const onState = (playing, paused) => {
      playBtn.innerHTML = playing && !paused ? "⏸ Pause" : playing && paused ? "▶ Resume" : "▶ Play";
    };
    // A passage counts as studied only when every verse was heard (robot voice or video).
    const heard = new Set();
    const already = worldId && S.worlds[worldId].studied;
    function showHeard() {
      const el = $("[data-heard]");
      if (!el) return;
      const done = heard.size >= verses.length;
      el.className = "heard-pill" + (done || already ? " done" : "");
      el.innerHTML = done ? "🎧 You listened to all " + verses.length + " verses! 🎉"
        : "🎧 Listened: <b>" + heard.size + " / " + verses.length + "</b> verses" + (already ? " · ✅ already studied" : " — listen to all to unlock training");
      const tr = $("[data-train]");
      if (tr) tr.disabled = !(done || already || S.settings.unlockAll);
    }
    function markHeard(c, v) {
      const k = vkey(c, v);
      if (heard.has(k) || !verses.some((x) => x.c === c && x.v === v)) return;
      heard.add(k);
      const el = verseEl(c, v);
      if (el) el.classList.add("heard");
      showHeard();
      if (heard.size === verses.length) onEnd();
    }
    const onItemEnd = (it) => { if (it.el) markHeard(+it.el.dataset.c, +it.el.dataset.v); };
    const onEnd = () => {
      if (listenedAll || heard.size < verses.length) return;
      listenedAll = true;
      S.listened++; addXP(10); save(); renderTopbar();
      toast("🎧 Great listening! +10 XP");
      announceBadges();
      if (worldId && !S.worlds[worldId].studied) markStudied();
    };
    playBtn.onclick = () => {
      if (TTS.playing && !TTS.paused) TTS.pause();
      else if (TTS.playing && TTS.paused) TTS.resume();
      else {
        const all = items();
        const startEl = $(".verse.focus", box);
        TTS.play(all, { start: startEl ? all.findIndex((i) => i.el === startEl) : 0, onEnd, onState, onItemEnd });
      }
    };
    $("[data-stop]").onclick = () => TTS.stop();
    $$("[data-rate]").forEach((b) => b.onclick = () => {
      S.settings.rate = +b.dataset.rate; save();
      $$("[data-rate]").forEach((x) => x.classList.toggle("on", x === b));
      if (TTS.playing) { const i = TTS.idx; TTS.play(items(), { start: i, onEnd, onState, onItemEnd }); }
    });
    $("[data-repeat]").onclick = (e) => { TTS.repeat = !TTS.repeat; e.currentTarget.classList.toggle("on", TTS.repeat); };
    TTS.repeat = false;
    $("[data-hide]").onclick = (e) => {
      const on = !e.currentTarget.classList.contains("on");
      e.currentTarget.classList.toggle("on", on);
      $$(".verse", box).forEach((v) => v.classList.toggle("hide", on));
      if (on) toast("🙈 Memory mode: try to say the verse, tap words to peek!");
    };

    // ---- video mode ----
    let player = null, poll = null, vChap = null, vId = null, lastKey = null, syncing = false, syncIdx = 0;
    const chapVerses = () => verses.filter((x) => x.c === vChap);
    function status(t) { const s = $("[data-vstatus]"); if (s) s.textContent = t; }
    function sortedTimes() {
      const T = timingsFor(vId);
      return chapVerses().filter((x) => T[vkey(x.c, x.v)] != null).map((x) => ({ x, t: +T[vkey(x.c, x.v)] })).sort((a, b) => a.t - b.t);
    }
    function describe() {
      const n = sortedTimes().length, total = chapVerses().length;
      if (syncing) {
        const nx = chapVerses()[syncIdx];
        status(nx ? "Next to tap: " + vkey(nx.c, nx.v) : "All verses synced! 🎉");
      } else status(n ? (n < total ? "Synced " + n + "/" + total + " verses" : "Verses light up as the video reads ✨") : "Verses not synced yet — tap 🎯 Sync verses");
    }
    function tick() {
      if (!player || !player.getCurrentTime) return;
      const t = player.getCurrentTime();
      const list = sortedTimes();
      let cur = -1;
      for (let i = 0; i < list.length; i++) { if (list[i].t <= t + 0.05) cur = i; else break; }
      if (cur < 0) { if (lastKey) { $$(".verse.active", box).forEach((e) => e.classList.remove("active")); lastKey = null; } return; }
      const { x, t: st } = list[cur];
      const el = verseEl(x.c, x.v);
      const key = vkey(x.c, x.v);
      if (key !== lastKey) {
        $$(".verse.active", box).forEach((e) => { e.classList.remove("active"); markWord(e, -1); });
        if (el) { el.classList.add("active"); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
        lastKey = key;
      }
      const next = list[cur + 1] ? list[cur + 1].t : Math.min(st + verseText(x.c, x.v).length / 14, player.getDuration ? player.getDuration() : st + 20);
      const frac = Math.max(0, Math.min(1, (t - st) / Math.max(0.5, next - st)));
      if (el) markWord(el, Math.floor(frac * verseText(x.c, x.v).length));
      if (frac >= 0.9 && player.getPlayerState && player.getPlayerState() === 1) markHeard(x.c, x.v);
    }
    function openChapter(c, seekTo) {
      vChap = c; vId = C.videos[c];
      $$("[data-vchap]").forEach((b) => b.classList.toggle("on", +b.dataset.vchap === c));
      syncIdx = 0; lastKey = null;
      loadYT().then((YT) => {
        if (!$("[data-yt]")) return;
        if (player && player.loadVideoById) {
          player.cueVideoById({ videoId: vId, startSeconds: seekTo || 0 });
        } else {
          player = new YT.Player($("[data-yt]"), {
            videoId: vId, width: "100%", height: "100%",
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(seekTo || 0) },
            events: { onStateChange: (e) => { if (e.data === 0) { chapVerses().forEach((x) => markHeard(x.c, x.v)); } } }
          });
        }
        clearInterval(poll); poll = setInterval(tick, 200);
        describe();
      });
    }
    videoCtl = { destroy() { clearInterval(poll); try { player && player.destroy && player.destroy(); } catch (e) { /* ignore */ } player = null; } };
    function setMode(m) {
      mode = m; S.settings.readMode = m; save();
      $$("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
      $("[data-videocard]").hidden = m !== "video";
      $("[data-voicebar]").hidden = m !== "voice";
      if (m === "video") {
        TTS.stop(true);
        if (!vChap) {
          const fc = focus && videoChapters.includes(focus.c) ? focus.c : videoChapters[0];
          const T = timingsFor(C.videos[fc]);
          const firstV = focus && focus.c === fc ? focus.v1 : verses.find((x) => x.c === fc).v;
          openChapter(fc, T[vkey(fc, firstV)] ? +T[vkey(fc, firstV)] : 0);
        }
      } else if (player && player.pauseVideo) player.pauseVideo();
    }
    $$("[data-mode]").forEach((b) => b.onclick = () => setMode(b.dataset.mode));
    $$("[data-vchap]").forEach((b) => b.onclick = () => openChapter(+b.dataset.vchap, 0));
    $("[data-sync]").onclick = (e) => {
      syncing = !syncing;
      e.currentTarget.classList.toggle("on", syncing);
      $("[data-syncpanel]").hidden = !syncing;
      if (syncing) {
        const T = timingsFor(vId);
        const cv = chapVerses();
        syncIdx = Math.max(0, cv.findIndex((x) => T[vkey(x.c, x.v)] == null));
        if (syncIdx < 0 || cv.findIndex((x) => T[vkey(x.c, x.v)] == null) < 0) syncIdx = 0;
      }
      describe();
    };
    $("[data-tap]").onclick = () => {
      if (!player || !player.getCurrentTime) return;
      const cv = chapVerses();
      const x = cv[syncIdx];
      if (!x) { toast("All verses of this chapter are synced 🎉"); return; }
      const t = Math.max(0, player.getCurrentTime() - 0.25);
      timingsFor(vId)[vkey(x.c, x.v)] = +t.toFixed(2);
      if (opts.saveTiming) opts.saveTiming(x.c, x.v, vId, +t.toFixed(2));
      SFX.click();
      syncIdx++;
      describe(); tick();
    };
    $("[data-undo]").onclick = () => {
      if (syncIdx <= 0) return;
      syncIdx--;
      const x = chapVerses()[syncIdx];
      delete timingsFor(vId)[vkey(x.c, x.v)];
      describe();
    };

    box.addEventListener("click", (e) => {
      const verse = e.target.closest(".verse");
      if (!verse) return;
      if (verse.classList.contains("hide") && e.target.classList.contains("w")) { e.target.classList.add("peek"); return; }
      const c = +verse.dataset.c, v = +verse.dataset.v;
      if (mode === "video") {
        if (c !== vChap && C.videos[c]) { openChapter(c, 0); return; }
        const t = timingsFor(vId)[vkey(c, v)];
        if (t != null && player && player.seekTo) { player.seekTo(+t, true); player.playVideo(); }
        else toast("This verse is not synced yet — use 🎯 Sync verses or 🔊 Robot voice");
        return;
      }
      const all = items();
      TTS.play(all, { start: all.findIndex((i) => i.el === verse), onEnd, onState, onItemEnd });
    });
    function markStudied() {
      if (!S.worlds[worldId].studied) {
        S.worlds[worldId].studied = true; addXP(30); addCoins(10); touchStreak(); save(); renderTopbar();
        SFX.coin(); toast("📖 Study complete! +30 XP +10 🪙", "gold");
        announceBadges();
      }
    }
    if (worldId) {
      $("[data-train]").onclick = () => { if (heard.size >= verses.length) markStudied(); startQuiz({ mode: "practice", worlds: [worldId] }); };
    }
    $("[data-back]").onclick = () => back ? back() : worldId ? go("world", { id: worldId }) : go("home");
    setMode(mode);
    showHeard();
    const f = $(".verse.focus", box);
    if (f) setTimeout(() => f.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };

  // ---------------- Quiz ----------------
  function startQuiz({ mode, worlds, questions, onDone }) {
    let qs;
    try { qs = questions || buildRound(mode, worlds); } catch (e) {
      report(e, "buildRound:" + mode);
      toast("⚠️ Could not build the questions: " + esc(String(e && e.message || e).slice(0, 120)));
      return;
    }
    if (!qs.length) { toast("No questions yet!"); return; }
    go("quiz", { mode, worlds, qs, onDone });
  }

  SCREENS.quiz = function ({ mode, worlds, qs, onDone }) {
    const isBoss = mode === "boss" || mode === "final";
    const boss = mode === "final" ? FINAL : mode === "boss" ? WORLDS.find((w) => w.id === worlds[0]).boss : null;
    const st = { i: 0, correct: 0, combo: 0, bestCombo: 0, hearts: BOSS_HEARTS, xp: 0, coins: 0, missed: [], answered: false, timer: null, t0: 0,
      bossHP: BOSS_PASS, shield: 0, specials: 0, power: false };
    if (isBoss) {
      // ✨ Holy Strike charges: 1 to start, +1 for every 4 verses already mastered in this battle (max 3)
      const vs = [].concat(...worlds.map((id) => versesInRange(WORLDS.find((w) => w.id === id).range)));
      const mastered = vs.filter((x) => { const t = S.verseStats[vkey(x.c, x.v)]; return t && t.r + t.w >= 2 && t.r / (t.r + t.w) >= 0.8; }).length;
      st.specials = 1 + Math.min(2, Math.floor(mastered / 4));
    }
    const modeName = { practice: "Training", boss: "Boss Battle", final: "Final Battle", daily: "Daily Quest", review: "Fix Mistakes" }[mode];

    function header() {
      const pct = Math.round((st.i / qs.length) * 100);
      let h = '<div class="quiz-top"><button class="back" data-quit style="margin:0">✕</button><div class="prog"><div style="font-weight:800;margin-bottom:4px">' + modeName + " · " + (st.i + 1) + " / " + qs.length + '</div><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<span class="combo ' + (st.combo >= 3 ? "hot" : "") + '">🔥 x' + st.combo + '</span><span class="combo">✅ ' + st.correct + "</span></div>";
      if (isBoss) {
        h += '<div class="boss-arena rpg" data-arena><div class="side boss-side"><span class="boss-emoji" data-boss>' + boss.emoji + '</span><b>' + esc(boss.name) + '</b>' +
          '<div class="hp"><i data-bosshp style="width:' + Math.round((st.bossHP / BOSS_PASS) * 100) + '%"></i></div><small data-hptext>HP ' + st.bossHP + " / " + BOSS_PASS + "</small></div>" +
          '<div class="vs">VS</div>' +
          '<div class="side hero-side"><span class="hero" data-hero>' + S.avatar + '</span><b>' + esc(S.name) + '</b>' +
          '<div class="hearts" data-hearts>' + Array.from({ length: BOSS_HEARTS }, (_, k) => '<span class="' + (k < st.hearts ? "" : "lost") + '">❤️</span>').join("") + "</div>" +
          '<div class="powers"><span class="shield' + (st.shield ? " on" : "") + '" data-shield>🛡️ ' + st.shield + "</span>" +
          '<button class="special' + (st.power ? " on" : "") + '" data-special ' + (st.specials ? "" : "disabled") + ">✨ " + st.specials + "</button></div></div></div>";
      }
      return h;
    }

    function render() {
      const q = qs[st.i];
      st.answered = false;
      let body;
      if (q.type === "blank") {
        body = '<div class="q-text verseish">' + esc(q.before) + '<span class="blank">?</span>' + esc(q.after) + "</div>";
      } else if (q.type === "chapter") {
        body = '<div class="q-text">' + esc(q.prompt) + '</div><div class="q-text verseish">“' + esc(q.quote) + "”</div>";
      } else {
        body = '<div class="q-text">' + esc(q.prompt) + "</div>";
      }
      const kind = q.type === "blank" ? "Complete the verse" : q.type === "chapter" ? "Where is it?" : "";
      app.innerHTML = header() +
        (isBoss && S.settings.timer ? '<div class="timer"><i data-timer></i></div>' : "") +
        '<div class="card q-card"><span class="q-ref">' + (q.type === "chapter" ? "Acts ?:?" : refLabel(q.c, q.v1, q.v2)) + '</span><span class="q-kind">' + kind + "</span>" + body +
        '<div class="options">' + q.options.map((o, k) => '<button class="opt" data-k="' + k + '"><span class="key">' + "ABCD"[k] + "</span><span>" + esc(o) + "</span></button>").join("") + "</div>" +
        '<div data-fb></div></div>';
      $("[data-quit]").onclick = quit;
      $$(".opt").forEach((b) => b.onclick = (e) => answer(+b.dataset.k, e));
      const sp = $("[data-special]");
      if (sp) sp.onclick = () => {
        if (st.answered || !st.specials) return;
        st.power = !st.power; sp.classList.toggle("on", st.power);
        if (st.power) { SFX.combo(); toast("✨ Holy Strike ready! Your next right answer does DOUBLE damage!"); }
      };
      st.t0 = Date.now();
      if (window.__abgTest) window.__abgTest.answer = q.answer;   // only set by the automated test page
      if (isBoss && S.settings.timer) startTimer();
    }

    function startTimer() {
      const bar = $("[data-timer]");
      bar.style.transition = "none"; bar.style.width = "100%";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.transition = "width " + QUESTION_TIME + "s linear"; bar.style.width = "0%";
      }));
      clearTimeout(st.timer);
      st.timer = setTimeout(() => { if (!st.answered) answer(-1); }, QUESTION_TIME * 1000);
    }

    function answer(k, ev) {
      if (st.answered) return;
      st.answered = true;
      clearTimeout(st.timer);
      const tb = $("[data-timer]"); if (tb) { const w = getComputedStyle(tb).width; tb.style.transition = "none"; tb.style.width = w; }
      const q = qs[st.i];
      const chosen = k >= 0 ? q.options[k] : null;
      const right = chosen === q.answer;
      $$(".opt").forEach((b, j) => {
        b.disabled = true;
        if (q.options[j] === q.answer) b.classList.add("right");
        else if (j === k) b.classList.add("wrong");
        else b.classList.add("dim");
      });
      recordAnswer(q, right);
      const fb = $("[data-fb]");
      if (right) {
        st.correct++; st.combo++; st.bestCombo = Math.max(st.bestCombo, st.combo);
        const fast = Date.now() - st.t0 < 8000;
        let gain = 10 + (st.combo >= 3 ? 5 : 0) + (fast && isBoss ? 5 : 0);
        st.xp += gain; st.coins += 1;
        if (st.combo >= 3 && st.combo % 5 === 0) SFX.combo(); else SFX.good();
        const r = (ev && ev.currentTarget || $(".opt.right")).getBoundingClientRect();
        floatXP("+" + gain + " XP" + (fast && isBoss ? " ⚡" : ""), r.left + r.width / 2 - 40, r.top);
        if (isBoss) {
          const dmg = st.power ? 2 : 1;
          if (st.power) { st.specials--; st.power = false; }
          st.bossHP = Math.max(0, st.bossHP - dmg);
          attackAnim(dmg);
          if (st.combo % 3 === 0 && st.shield < 2) { st.shield++; setTimeout(() => toast("🛡️ " + st.combo + " in a row! You got a Shield of Faith!"), 500); }
          refreshBattle();
        }
        const praise = ["Great job!", "Awesome!", "You got it!", "Super!", "Amazing!", "Well done!", "Excellent!"][rand(7)];
        fb.innerHTML = '<div class="feedback good"><h3>✅ ' + praise + (st.combo >= 3 ? " 🔥 " + st.combo + " in a row!" : "") + "</h3></div>";
        $$(".combo")[0].textContent = "🔥 x" + st.combo; $$(".combo")[0].classList.toggle("hot", st.combo >= 3);
        $$(".combo")[1].textContent = "✅ " + st.correct;
        setTimeout(next, isBoss && st.bossHP <= 0 ? 1600 : 1100);
      } else {
        st.combo = 0;
        st.missed.push(q);
        SFX.bad();
        if (isBoss) {
          if (st.shield > 0) { st.shield--; bossAttackAnim(true); setTimeout(() => toast("🛡️ Your shield blocked the attack!"), 300); }
          else { st.hearts--; bossAttackAnim(false); }
          refreshBattle();
        }
        $$(".combo")[0].textContent = "🔥 x0"; $$(".combo")[0].classList.remove("hot");
        const verses = [];
        for (let v = q.v1; v <= q.v2; v++) verses.push(verseHTML(q.c, v));
        fb.innerHTML = '<div class="feedback bad"><h3>' + (k < 0 ? "⏰ Time's up!" : "❌ Not quite!") + " The answer is: " + esc(q.answer) + '</h3><div class="muted" style="font-weight:700">Let\'s learn it — ' + refLabel(q.c, q.v1, q.v2) + ":</div>" +
          '<div data-fbverses>' + verses.join("") + "</div>" +
          '<div class="row"><button class="btn small good" data-listen>🔊 Listen</button><span class="spacer"></span><button class="btn" data-next>Next ➜</button></div></div>';
        if (isBoss && st.hearts <= 0) { $("[data-next]").textContent = "See results"; }
        const listen = gateUntilHeard($("[data-next]"), () => $$("[data-fbverses] .verse").map((el) => ({ el, text: verseText(+el.dataset.c, +el.dataset.v) })));
        $("[data-listen]").onclick = listen;
        $("[data-next]").onclick = () => { TTS.stop(true); next(); };
        listen();
        setTimeout(() => fb.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      }
    }

    function refreshBattle() {
      const hp = $("[data-bosshp]"); if (hp) hp.style.width = Math.round((st.bossHP / BOSS_PASS) * 100) + "%";
      const ht = $("[data-hptext]"); if (ht) ht.textContent = "HP " + st.bossHP + " / " + BOSS_PASS;
      $$("[data-hearts] span").forEach((h, k) => h.classList.toggle("lost", k >= st.hearts));
      const sh = $("[data-shield]"); if (sh) { sh.textContent = "🛡️ " + st.shield; sh.classList.toggle("on", st.shield > 0); }
      const sp = $("[data-special]"); if (sp) { sp.textContent = "✨ " + st.specials; sp.disabled = !st.specials; sp.classList.toggle("on", st.power); }
    }
    function attackAnim(dmg) {
      const arena = $("[data-arena]"); if (!arena) return;
      SFX.hit();
      const shot = document.createElement("span");
      shot.className = "shot"; shot.textContent = dmg > 1 ? "🌟" : "⚔️";
      arena.appendChild(shot);
      setTimeout(() => {
        shot.remove();
        const be = $("[data-boss]"); if (!be) return;
        be.classList.remove("hit"); void be.offsetWidth; be.classList.add("hit");
        const pop = document.createElement("span"); pop.className = "dmg"; pop.textContent = "-" + dmg + (dmg > 1 ? " CRITICAL!" : "");
        be.parentNode.appendChild(pop); setTimeout(() => pop.remove(), 900);
        if (st.bossHP <= 0) be.classList.add("dead");
      }, 420);
    }
    function bossAttackAnim(blocked) {
      const arena = $("[data-arena]"); if (!arena) return;
      arena.classList.remove("shake"); void arena.offsetWidth; arena.classList.add("shake");
      const hero = $("[data-hero]");
      const fx = document.createElement("span"); fx.className = "boom"; fx.textContent = blocked ? "🛡️" : "💥";
      if (hero) hero.parentNode.appendChild(fx);
      setTimeout(() => fx.remove(), 800);
    }

    function next() {
      if (isBoss && st.hearts <= 0) return finish(false);
      if (isBoss && st.bossHP <= 0) return finish(true);
      st.i++;
      if (st.i >= qs.length) return finish(true);
      render();
    }

    function quit() {
      clearTimeout(st.timer);
      modal("🤔", "Leave this round?", "Your answers so far are saved, but this round won't count.", [
        { label: "Keep playing", cls: "good", onClick: () => { if (isBoss && S.settings.timer && !st.answered) startTimer(); } },
        { label: "Leave", cls: "ghost", onClick: () => go(mode === "review" ? "reviewHub" : mode === "practice" || mode === "boss" ? "world" : "home", { id: worlds && worlds[0] }) }
      ]);
    }

    function finish(completed) {
      clearTimeout(st.timer);
      const total = qs.length, score = st.correct;
      const won = isBoss ? completed && st.hearts > 0 && st.bossHP <= 0 : true;
      const stars = isBoss && won ? (st.hearts >= BOSS_HEARTS ? 3 : st.hearts >= 3 ? 2 : 1) : 0;
      let bonusXP = 0, bonusCoins = 0, unlockMsg = "";
      if (mode === "practice") {
        const w = S.worlds[worlds[0]];
        const firstPass = w.practiceBest < PRACTICE_PASS && score >= PRACTICE_PASS;
        w.practiceBest = Math.max(w.practiceBest, score);
        if (firstPass) { bonusXP += 50; unlockMsg = "👊 The boss is unlocked!"; }
      }
      if (mode === "boss") {
        const w = S.worlds[worlds[0]];
        w.bossBest = Math.max(w.bossBest, completed ? score : 0);
        if (won) {
          const first = !w.beaten;
          w.beaten = true; w.stars = Math.max(w.stars, stars);
          S.bossesBeaten++;
          bonusXP += first ? 150 : 50; bonusCoins += first ? 40 : 15;
          const nextW = WORLDS.find((x) => x.id === worlds[0] + 1);
          if (first) unlockMsg = nextW ? "🗺️ World " + nextW.id + " — " + nextW.name + " is unlocked!" : "🐲 The FINAL BOSS is unlocked!";
        }
      }
      if (mode === "final") {
        S.finalBest = Math.max(S.finalBest, completed ? score : 0);
        if (won) { const first = !S.finalBeaten; S.finalBeaten = true; bonusXP += first ? 400 : 100; bonusCoins += first ? 150 : 30; }
      }
      if (mode === "daily" && S.dailyDone !== today()) { S.dailyDone = today(); bonusCoins += 30; bonusXP += 20; }
      if (score === total && total >= ROUND_SIZE) { S.perfects++; bonusXP += 50; }
      S.bestCombo = Math.max(S.bestCombo, st.bestCombo);
      touchStreak();
      if (mode !== "review") S.history.push({ d: today(), t: Date.now(), mode, w: worlds && worlds.length === 1 ? worlds[0] : 0, s: score, n: total, won });
      if (S.history.length > 300) S.history = S.history.slice(-300);
      addXP(st.xp + bonusXP); addCoins(st.coins + bonusCoins);
      save();
      const fresh = announceBadges();
      if (onDone) return onDone({ score, total, missed: st.missed, xp: st.xp + bonusXP, coins: st.coins + bonusCoins });
      go("results", { mode, worlds, score, total, won, stars, missed: st.missed, xp: st.xp + bonusXP, coins: st.coins + bonusCoins, unlockMsg, completed, freshBadges: fresh });
    }

    cleanup = () => clearTimeout(st.timer);
    render();
  };

  function recordAnswer(q, right) {
    S.totalAnswered++; if (right) S.totalCorrect++;
    const qs = S.qStats[q.id] || (S.qStats[q.id] = { seen: 0, correct: 0 });
    qs.seen++; if (right) qs.correct++;
    for (let v = q.v1; v <= q.v2; v++) {
      const k = vkey(q.c, v);
      const vs = S.verseStats[k] || (S.verseStats[k] = { r: 0, w: 0 });
      if (right) vs.r++; else vs.w++;
    }
    const m = S.mistakes[q.id];
    if (!right) {
      const stored = Object.assign({}, q); delete stored.options;
      S.mistakes[q.id] = { q: stored, box: 0, added: today() };
    } else if (m) {
      m.box++;
      if (m.box >= 2) { delete S.mistakes[q.id]; S.fixed++; toast("🩹 Mistake fixed forever! Great memory!"); }
    }
    save();
  }

  // ---------------- Mini-games (Arcade) ----------------
  // Three games built only from the passage text, so they work for every passage:
  //   🌠 Verse Catcher – words fall from the sky, tap the next word of the verse
  //   🧩 Verse Builder – rebuild a verse from shuffled pieces
  //   📜 Story Order   – put the story's verses in the right order
  const GAMES = [
    { id: "catcher", e: "🌠", name: "Verse Catcher", desc: "Tap the next word as the words fall from the sky!" },
    { id: "builder", e: "🧩", name: "Verse Builder", desc: "Put the pieces of the verse back together." },
    { id: "order", e: "📜", name: "Story Order", desc: "What happened first? Put the story in order." },
    { id: "whosaid", e: "🗣️", name: "Who Said It?", desc: "Read the words. Who said them?" }
  ];
  function arcadeUnlocked(id) { return S.settings.unlockAll || S.worlds[id].studied; }
  function arcadeState() { return S.arcade || (S.arcade = { plays: 0, best: {} }); }
  function wordsOf(c, v) { return verseText(c, v).split(/\s+/).filter(Boolean); }
  function pickVerse(worldId, minWords) {
    const w = WORLDS.find((x) => x.id === worldId);
    const vs = versesInRange(w.range);
    const ok = vs.filter((x) => wordsOf(x.c, x.v).length >= minWords);
    const list = ok.length ? ok : vs;
    // prefer verses the player has not mastered yet
    const weak = list.filter((x) => { const st = S.verseStats[vkey(x.c, x.v)]; return !st || st.r < 2 || st.w > st.r; });
    const from = weak.length && Math.random() < 0.7 ? weak : list;
    return from[rand(from.length)];
  }
  function gameHeader(title, worldId, extra) {
    return '<div class="quiz-top"><button class="back" data-gback style="margin:0">✕</button><div class="prog"><div style="font-weight:800">' + title + "</div>" +
      '<small style="opacity:.85">' + esc(WORLDS.find((w) => w.id === worldId).name) + "</small></div>" + (extra || "") + "</div>";
  }
  function finishGame(game, worldId, verses, stars, xp, msg, again) {
    const a = arcadeState();
    a.plays++;
    a.best[game + worldId] = Math.max(a.best[game + worldId] || 0, stars);
    verses.forEach((x) => {
      const k = vkey(x.c, x.v);
      const vs = S.verseStats[k] || (S.verseStats[k] = { r: 0, w: 0 });
      if (stars >= 2) vs.r++; else if (stars === 0) vs.w++;
    });
    const coins = stars * 3;
    touchStreak(); addXP(xp); addCoins(coins); save(); renderTopbar();
    const vhtml = verses.map((x) => verseHTML(x.c, x.v)).join("");
    app.innerHTML = '<div class="result-hero"><span class="big-emoji">' + (stars >= 2 ? "🏆" : stars === 1 ? "🙂" : "💪") + "</span><h1>" + msg + "</h1>" +
      '<div class="stars">' + "⭐".repeat(stars) + '<span style="opacity:.25">' + "⭐".repeat(3 - stars) + "</span></div></div>" +
      '<div class="rewards"><span class="reward">+' + xp + ' XP</span><span class="reward">+' + coins + " 🪙</span></div>" +
      '<div class="card"><h3>📖 Listen to the verse' + (verses.length > 1 ? "s" : "") + '</h3><div data-gverses>' + vhtml + "</div>" +
      '<div class="row" style="margin-top:10px"><button class="btn small good" data-glisten>🔊 Listen</button></div></div>' +
      '<div class="row" style="justify-content:center"><button class="btn big" data-gagain>🔄 Play again</button><button class="btn big ghost" data-gback>🎮 Games</button></div>';
    if (stars >= 2) { SFX.win(); confetti(60); } else SFX.click();
    const play = () => TTS.play($$("[data-gverses] .verse").map((el) => ({ el, text: verseText(+el.dataset.c, +el.dataset.v) })));
    $("[data-glisten]").onclick = play;
    $("[data-gagain]").onclick = again;
    $("[data-gback]").onclick = () => go("arcade", { id: worldId });
    setTimeout(play, 500);
    announceBadges();
  }

  SCREENS.arcade = function ({ id } = {}) {
    if (!id) {
      const open = WORLDS.filter((w) => arcadeUnlocked(w.id));
      app.innerHTML = '<button class="back" data-back>← Map</button><h1 class="title-white">🎮 Arcade</h1>' +
        '<p class="title-white" style="opacity:.85">Mini-games unlock when you study a world.</p>' +
        '<div class="card">' + (open.length ? WORLDS.map((w) => {
          const un = arcadeUnlocked(w.id);
          return '<div class="step' + (un ? "" : " locked") + '"><span class="num" style="background:' + w.color + ';color:#fff">' + (un ? w.icon : "🔒") + '</span><div class="txt"><b>' + esc(w.name) + '</b><div class="muted">' + rangeLabel(w.range) + "</div></div>" +
            '<button class="btn small" data-aw="' + w.id + '" ' + (un ? "" : "disabled") + ">Play</button></div>";
        }).join("") : '<div class="center"><div style="font-size:60px">📖</div><h2>Study a world first!</h2><p class="muted">Open a world on the map and listen to its passage. Then its games unlock here.</p></div>') + "</div>";
      $("[data-back]").onclick = () => go("home");
      $$("[data-aw]").forEach((b) => b.onclick = () => go("arcade", { id: +b.dataset.aw }));
      return;
    }
    const w = WORLDS.find((x) => x.id === id), a = arcadeState();
    app.innerHTML = '<button class="back" data-back>← Back</button>' +
      '<div class="world-head"><span class="orb" style="background:' + w.color + '">🎮</span><div><small>' + rangeLabel(w.range) + '</small><h1 class="title-white">' + esc(w.name) + "</h1><div>Pick a game!</div></div></div>" +
      '<div class="grid three">' + GAMES.map((g) => {
        const best = a.best[g.id + id] || 0;
        return '<button class="tile game-tile" data-game="' + g.id + '"><span class="ico">' + g.e + "</span><b>" + g.name + "</b><small>" + g.desc + '</small><div class="stars" style="margin-top:6px">' + starStr(best) + "</div></button>";
      }).join("") + "</div>";
    $("[data-back]").onclick = () => go("world", { id });
    $$("[data-game]").forEach((b) => b.onclick = () => { SFX.click(); go(b.dataset.game, { id }); });
  };

  // 🌠 Verse Catcher
  SCREENS.catcher = function ({ id }) {
    const x = pickVerse(id, 7);
    const tokens = wordsOf(x.c, x.v);
    const MAXW = 16;
    let pos = Math.max(0, tokens.length - MAXW);   // long verses: the first part is shown already
    const startPos = pos;
    let hearts = 3, score = 0, combo = 0, speed = 55, wave = null, raf = 0, last = 0, over = false;
    const pool = Array.from(new Set([].concat(...versesInRange(WORLDS.find((w) => w.id === id).range).map((v) => wordsOf(v.c, v.v).map(clean)))))
      .filter((wd) => wd.length >= 2);
    app.innerHTML = gameHeader("🌠 Verse Catcher", id, '<span class="combo" data-hearts></span><span class="combo" data-score>⭐ 0</span>') +
      '<div class="card catcher-verse"><span class="q-ref">' + refLabel(x.c, x.v, x.v) + '</span><div data-cverse class="q-text verseish"></div></div>' +
      '<div class="arena" data-arena><div class="arena-floor"></div></div><p class="title-white center" style="opacity:.85">Tap the NEXT word of the verse before it hits the ground!</p>';
    const arena = $("[data-arena]");
    function drawVerse() {
      $("[data-cverse]").innerHTML = tokens.map((t, i) => i < pos ? '<span class="got' + (i >= startPos && i === pos - 1 ? " new" : "") + '">' + esc(t) + "</span>"
        : '<span class="gap">' + "_".repeat(Math.min(Math.max(clean(t).length, 2), 8)) + "</span>").join(" ");
      $("[data-hearts]").textContent = "❤️".repeat(hearts) + "🖤".repeat(3 - hearts);
      $("[data-score]").textContent = "⭐ " + score;
    }
    function clearWave() { if (wave) wave.items.forEach((it) => it.el.remove()); wave = null; }
    function newWave() {
      if (over) return;
      clearWave();
      const target = clean(tokens[pos]) || tokens[pos];
      const lower = target.toLowerCase();
      const cands = shuffle(pool.filter((p) => p.toLowerCase() !== lower)).sort((a, b) => Math.abs(a.length - target.length) - Math.abs(b.length - target.length));
      const opts = shuffle([target].concat(shuffle(cands.slice(0, 6)).slice(0, 2)));
      const lanes = shuffle([0, 1, 2]);
      wave = { y: -50, items: opts.map((wd, i) => {
        const el = document.createElement("button");
        el.className = "falling"; el.textContent = wd;
        el.style.left = (4 + lanes[i] * 32.5) + "%";
        el.style.transform = "translateY(-50px)";
        el.onclick = () => tap(wd === target, el);
        arena.appendChild(el);
        return { el, ok: wd === target };
      }) };
    }
    function tap(ok, el) {
      if (over || !wave) return;
      if (ok) {
        pos++; combo++; score += 10 + Math.min(combo, 10) * 2;
        speed = Math.min(150, speed + 5);
        if (combo % 5 === 0) SFX.combo(); else SFX.good();
        const r = el.getBoundingClientRect(); floatXP("+" + (10 + Math.min(combo, 10) * 2), r.left, r.top);
        clearWave(); drawVerse();
        if (pos >= tokens.length) return end(true);
        setTimeout(newWave, 250);
      } else {
        combo = 0; hearts--; SFX.bad();
        el.classList.add("bad"); el.disabled = true;
        drawVerse();
        if (hearts <= 0) end(false);
      }
    }
    function miss() {
      combo = 0; hearts--; SFX.bad();
      pos++;   // show the word so the child learns it
      clearWave(); drawVerse();
      if (hearts <= 0) return end(false);
      if (pos >= tokens.length) return end(true);
      setTimeout(newWave, 500);
    }
    function frame(ts) {
      if (over) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (wave) {
        wave.y += speed * dt;
        wave.items.forEach((it) => { it.el.style.transform = "translateY(" + wave.y + "px)"; });
        if (wave.y > arena.clientHeight - 56) miss();
      }
      raf = requestAnimationFrame(frame);
    }
    function end(won) {
      over = true; cancelAnimationFrame(raf); clearWave();
      const total = tokens.length - startPos;
      const stars = won ? (hearts === 3 ? 3 : hearts === 2 ? 2 : 1) : 0;
      finishGame("catcher", id, [x], stars, Math.round(score / 2) + (won ? 20 : 5),
        won ? "Verse caught! " + total + " words" : "Out of hearts!", () => go("catcher", { id }));
    }
    cleanup = () => { over = true; cancelAnimationFrame(raf); };
    $("[data-gback]").onclick = () => go("arcade", { id });
    drawVerse();
    setTimeout(newWave, 600);
    raf = requestAnimationFrame(frame);
  };

  // 🧩 Verse Builder
  SCREENS.builder = function ({ id }) {
    const x = pickVerse(id, 8);
    const tokens = wordsOf(x.c, x.v);
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 3) chunks.push(tokens.slice(i, i + 3).join(" "));
    if (chunks.length > 1 && chunks[chunks.length - 1].split(" ").length === 1) chunks[chunks.length - 2] += " " + chunks.pop();
    let step = 0, mistakes = 0;
    const order = shuffle(chunks.map((c, i) => i));
    app.innerHTML = gameHeader("🧩 Verse Builder", id, '<span class="combo" data-miss>❌ 0</span>') +
      '<div class="card"><span class="q-ref">' + refLabel(x.c, x.v, x.v) + '</span><div class="q-text verseish built" data-built><span class="muted">Tap the first piece…</span></div></div>' +
      '<div class="pieces">' + order.map((i) => '<button class="piece" data-piece="' + i + '">' + esc(chunks[i]) + "</button>").join("") + "</div>";
    $("[data-gback]").onclick = () => go("arcade", { id });
    $$("[data-piece]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.piece;
      if (i === step) {
        SFX.good(); b.remove();
        step++;
        $("[data-built]").innerHTML = chunks.slice(0, step).map((c, k) => '<span class="got' + (k === step - 1 ? " new" : "") + '">' + esc(c) + "</span>").join(" ");
        if (step >= chunks.length) {
          const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : mistakes <= 4 ? 1 : 0;
          setTimeout(() => finishGame("builder", id, [x], stars, 15 + stars * 10, stars ? "Verse built!" : "You finished it!", () => go("builder", { id })), 500);
        }
      } else {
        mistakes++; SFX.bad();
        b.classList.remove("bad"); void b.offsetWidth; b.classList.add("bad");
        $("[data-miss]").textContent = "❌ " + mistakes;
      }
    });
  };

  // 📜 Story Order
  SCREENS.order = function ({ id }) {
    const w = WORLDS.find((v) => v.id === id);
    const vs = versesInRange(w.range);
    const k = Math.min(5, vs.length);
    const picked = shuffle(vs.map((_, i) => i)).slice(0, k).sort((a, b) => a - b).map((i) => vs[i]);
    const snippet = (v) => { const ws = wordsOf(v.c, v.v); return ws.slice(0, 11).join(" ") + (ws.length > 11 ? "…" : ""); };
    let step = 0, mistakes = 0;
    app.innerHTML = gameHeader("📜 Story Order", id, '<span class="combo" data-miss>❌ 0</span>') +
      '<p class="title-white">Tap the parts of the story in the order they happened. First one first!</p>' +
      '<div class="card" data-done><span class="muted">Your story will appear here…</span></div>' +
      '<div class="order-cards">' + shuffle(picked.map((v, i) => i)).map((i) => '<button class="order-card" data-oc="' + i + '">' + esc(snippet(picked[i])) + "</button>").join("") + "</div>";
    $("[data-gback]").onclick = () => go("arcade", { id });
    $$("[data-oc]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.oc;
      if (i === step) {
        SFX.good(); b.remove(); step++;
        $("[data-done]").innerHTML = picked.slice(0, step).map((v, n) => '<div class="order-row"><span class="n">' + (n + 1) + '</span><span><small class="muted">' + v.c + ":" + v.v + "</small> " + esc(snippet(v)) + "</span></div>").join("");
        if (step >= picked.length) {
          const stars = mistakes === 0 ? 3 : mistakes <= 1 ? 2 : mistakes <= 3 ? 1 : 0;
          setTimeout(() => finishGame("order", id, picked, stars, 15 + stars * 10, stars ? "Story in order!" : "You finished it!", () => go("order", { id })), 500);
        }
      } else {
        mistakes++; SFX.bad();
        b.classList.remove("bad"); void b.offsetWidth; b.classList.add("bad");
        $("[data-miss]").textContent = "❌ " + mistakes;
      }
    });
  };

  // 🗣️ Who Said It?
  const QUOTES = C.quotes || [];
  function quoteText(q) {
    const t = verseText(q.c, q.v);
    let at = -1;
    for (let i = 0; i <= q.n; i++) { at = t.indexOf("“", at + 1); if (at < 0) return ""; }
    const end = t.indexOf("”", at + 1);
    let s = t.slice(at + 1, end < 0 ? t.length : end).trim().replace(/[,;:]$/, "");
    if (s.length > 170) s = s.slice(0, 165).replace(/\s+\S*$/, "") + "…";
    return s;
  }
  function speakerEmoji(name) {
    const n = name.toLowerCase();
    const map = [["jesus", "✝️"], ["the lord", "✨"], ["spirit", "🕊️"], ["voice", "☁️"], ["angel", "👼"], ["two men", "👼"],
      ["peter", "🎣"], ["paul", "📜"], ["saul", "📜"], ["barnabas", "🤝"], ["stephen", "🌟"], ["philip", "🛞"], ["ananias", "🙏"],
      ["cornelius", "🛡️"], ["eunuch", "🐪"], ["simon", "🪄"], ["sapphira", "💰"], ["gamaliel", "📚"], ["james", "⚖️"],
      ["lydia", "🟣"], ["jailer", "🔑"], ["slave girl", "🔮"], ["macedonia", "🌅"], ["priest", "🏛️"], ["ruler", "🏛️"],
      ["council", "🏛️"], ["magistrate", "⚖️"], ["officer", "💂"], ["witness", "🗯️"], ["pharisee", "📜"], ["praying", "🙏"]];
    const hit = map.find(([k]) => n.includes(k));
    return hit ? hit[1] : "👥";
  }
  SCREENS.whosaid = function ({ id }) {
    const w = WORLDS.find((x) => x.id === id);
    const inWorld = (q) => worldOfVerse(q.c, q.v) && worldOfVerse(q.c, q.v).id === id;
    const usable = QUOTES.filter((q) => quoteText(q).length >= 8);
    let pool = usable.filter(inWorld);
    if (pool.length < 4) pool = pool.concat(shuffle(usable.filter((q) => !inWorld(q) && arcadeUnlocked(worldOfVerse(q.c, q.v).id))).slice(0, 6 - pool.length));
    if (!pool.length) { toast("No quotes in this world yet"); go("arcade", { id }); return; }
    const rounds = shuffle(pool).slice(0, 8);
    const speakers = Array.from(new Set(QUOTES.map((q) => q.speaker)));
    const extra = ["Peter", "Paul", "An angel of the Lord", "Moses", "The high priest", "Barnabas", "Stephen", "Philip"];
    let i = 0, right = 0;
    function show() {
      const q = rounds[i];
      const wrong = shuffle(Array.from(new Set(speakers.concat(extra))).filter((s) => s !== q.speaker)).slice(0, 3);
      const opts = shuffle([q.speaker].concat(wrong));
      app.innerHTML = gameHeader("🗣️ Who Said It?", id, '<span class="combo">' + (i + 1) + " / " + rounds.length + '</span><span class="combo">✅ ' + right + "</span>") +
        '<div class="bubble">“' + esc(quoteText(q)) + '”<span class="bubble-tail"></span></div>' +
        '<div class="speakers">' + opts.map((s, k) => '<button class="speaker" data-sp="' + k + '"><span class="e">' + speakerEmoji(s) + "</span><span>" + esc(s) + "</span></button>").join("") + "</div>" +
        '<div data-fb></div>';
      $("[data-gback]").onclick = () => go("arcade", { id });
      $$("[data-sp]").forEach((b) => b.onclick = () => {
        const ok = opts[+b.dataset.sp] === q.speaker;
        $$("[data-sp]").forEach((x) => { x.disabled = true; if (opts[+x.dataset.sp] === q.speaker) x.classList.add("right"); });
        const k = vkey(q.c, q.v);
        const vs = S.verseStats[k] || (S.verseStats[k] = { r: 0, w: 0 });
        if (ok) { right++; vs.r++; SFX.good(); } else { vs.w++; b.classList.add("wrong"); SFX.bad(); }
        $("[data-fb]").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '"><h3>' + (ok ? "✅ Yes! " : "❌ It was ") + esc(q.speaker) + " — " + refLabel(q.c, q.v, q.v) + "</h3>" +
          verseHTML(q.c, q.v) + '<div class="row"><button class="btn small good" data-listen>🔊 Listen</button><span class="spacer"></span><button class="btn" data-next>Next ➜</button></div></div>';
        const items = () => $$("[data-fb] .verse").map((el) => ({ el, text: verseText(+el.dataset.c, +el.dataset.v) }));
        const listen = ok ? () => TTS.play(items()) : gateUntilHeard($("[data-next]"), items);
        $("[data-listen]").onclick = listen;
        $("[data-next]").onclick = () => { TTS.stop(true); i++; if (i < rounds.length) show(); else end(); };
        if (!ok) listen();
      });
    }
    function end() {
      const pct = right / rounds.length;
      const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
      const verses = rounds.map((q) => ({ c: q.c, v: q.v })).slice(0, 3);
      finishGame("whosaid", id, verses, stars, 10 + right * 5, right + " / " + rounds.length + " right!", () => go("whosaid", { id }));
    }
    show();
  };

  // ---------------- Results ----------------
  SCREENS.results = function (r) {
    const pct = Math.round((r.score / r.total) * 100);
    const isBoss = r.mode === "boss" || r.mode === "final";
    let emoji, title;
    if (isBoss) { emoji = r.won ? "🏆" : "💔"; title = r.won ? (r.mode === "final" ? "YOU ARE A BIBLE CHAMPION!" : "Boss defeated!") : "The boss won this time..."; }
    else { emoji = pct >= 90 ? "🌟" : pct >= 70 ? "😄" : pct >= 50 ? "🙂" : "💪"; title = pct >= 90 ? "Amazing!" : pct >= 70 ? "Great work!" : pct >= 50 ? "Good try!" : "Keep practicing!"; }
    const missedHTML = r.missed.map((q, i) =>
      '<div class="miss"><div class="q"><small>' + refLabel(q.c, q.v1, q.v2) + "</small>" +
      (q.type === "blank" ? esc(q.before) + "<b>____</b>" + esc(q.after) : q.type === "chapter" ? "“" + esc(q.quote) + "”" : esc(q.prompt)) +
      '<div class="ok">✔ ' + esc(q.answer) + '</div></div><button class="btn small ghost" data-revq="' + i + '">📖 Read</button></div>').join("");
    app.innerHTML =
      '<div class="result-hero"><span class="big-emoji">' + emoji + "</span><h1>" + title + '</h1><div class="score">' + r.score + " / " + r.total + "</div>" +
      (isBoss && r.won ? '<div class="stars">' + "⭐".repeat(r.stars) + '<span style="opacity:.25">' + "⭐".repeat(3 - r.stars) + "</span></div>" : "") +
      (isBoss && !r.won ? "<p>Hit the boss " + BOSS_PASS + " times to win. " + (r.completed ? "" : "You ran out of hearts! ") + "Fix your mistakes and try again — you can do it! 💪</p>" : "") +
      "</div>" +
      '<div class="rewards"><span class="reward">+' + r.xp + ' XP</span><span class="reward">+' + r.coins + " 🪙</span>" + (r.unlockMsg ? '<span class="reward">' + r.unlockMsg + "</span>" : "") + "</div>" +
      '<div class="card">' +
      (r.missed.length ? "<h2>🩹 Let's fix " + r.missed.length + " mistake" + (r.missed.length > 1 ? "s" : "") + '</h2><p class="muted">Read and listen to each verse, then answer again. Answer a mistake right 2 times and it is fixed forever!</p>' +
        '<button class="btn big good wide" data-fix>🎧 Fix my mistakes now</button><div style="margin-top:12px">' + missedHTML + "</div>"
        : "<h2>🎯 No mistakes! Perfect!</h2>") +
      "</div>" +
      '<div class="row" style="justify-content:center"><button class="btn big" data-again>🔄 Play again</button><button class="btn big ghost" data-home>🗺️ Map</button></div>';
    if ((isBoss && r.won) || pct >= 90) { SFX.win(); confetti(r.mode === "final" ? 140 : 80); }
    else if (isBoss) SFX.lose();
    $$("[data-revq]").forEach((b) => b.onclick = () => {
      const q = r.missed[+b.dataset.revq];
      go("reader", { range: [[q.c, Math.max(q.v1 - 1, firstV(q.c))], [q.c, Math.min(q.v2 + 1, lastV(q.c))]], title: "Review " + refLabel(q.c, q.v1, q.v2), focus: q, back: () => go("results", r) });
    });
    const fix = $("[data-fix]"); if (fix) fix.onclick = () => go("reviewSession", { list: r.missed.map((q) => q.id) });
    $("[data-again]").onclick = () => {
      if (r.mode === "boss") go("bossIntro", { id: r.worlds[0] });
      else if (r.mode === "final") go("finalIntro");
      else startQuiz({ mode: r.mode, worlds: r.worlds });
    };
    $("[data-home]").onclick = () => go(r.mode === "practice" || r.mode === "boss" ? "world" : "home", { id: r.worlds && r.worlds[0] });
  };
  function firstV(c) { return VERSES.find((x) => x.c === c).v; }
  function lastV(c) { return VERSES.filter((x) => x.c === c).pop().v; }

  // ---------------- Review ----------------
  SCREENS.reviewHub = function () {
    const list = Object.values(S.mistakes);
    const byWorld = {};
    list.forEach((m) => { (byWorld[m.q.world] = byWorld[m.q.world] || []).push(m); });
    app.innerHTML =
      '<button class="back" data-back>← Map</button><h1 class="title-white">🩹 Fix Mistakes</h1>' +
      '<div class="card">' + (list.length
        ? "<p>You have <b>" + list.length + "</b> question" + (list.length > 1 ? "s" : "") + " to fix. For each one you will <b>read and listen</b> to the verse first, then answer again. Get it right <b>2 times</b> and it's fixed forever! 💪</p>" +
          '<button class="btn big good wide" data-all>🎧 Fix up to 10 now</button>' +
          WORLDS.filter((w) => byWorld[w.id]).map((w) => '<div class="step" style="margin-top:14px"><span class="num" style="background:' + w.color + ';color:#fff">' + w.icon + '</span><div class="txt"><b>' + esc(w.name) + '</b><div class="muted">' + byWorld[w.id].length + ' to fix</div></div><button class="btn small" data-w="' + w.id + '">Fix</button></div>').join("")
        : '<div class="center"><div style="font-size:70px">🎉</div><h2>No mistakes to fix!</h2><p class="muted">Play a round and any wrong answers will show up here for review.</p></div>') +
      "</div>";
    $("[data-back]").onclick = () => go("home");
    const all = $("[data-all]");
    if (all) all.onclick = () => go("reviewSession", { list: shuffle(list).slice(0, 10).map((m) => m.q.id) });
    $$("[data-w]").forEach((b) => b.onclick = () => go("reviewSession", { list: shuffle(byWorld[+b.dataset.w]).slice(0, 10).map((m) => m.q.id) }));
  };

  SCREENS.reviewSession = function ({ list }) {
    const items = list.map((id) => S.mistakes[id]).filter(Boolean).map((m) => m.q);
    if (!items.length) { go("reviewHub"); return; }
    let i = 0, right = 0;
    const missedAgain = [];
    function showVerse() {
      const q = items[i];
      const verses = [];
      for (let v = q.v1; v <= q.v2; v++) verses.push(verseHTML(q.c, v, "focus"));
      app.innerHTML =
        '<div class="quiz-top"><button class="back" data-quit style="margin:0">✕</button><div class="prog"><div style="font-weight:800;margin-bottom:4px">Fix Mistakes · ' + (i + 1) + " / " + items.length + '</div><div class="bar"><i style="width:' + Math.round((i / items.length) * 100) + '%"></i></div></div></div>' +
        '<div class="card"><span class="q-ref">' + refLabel(q.c, q.v1, q.v2) + '</span><h2>👂 Step 1: Listen and follow the words</h2>' +
        '<div data-rv>' + verses.join("") + "</div>" +
        '<div class="row" style="margin-top:14px"><button class="btn good" data-listen>🔊 Listen again</button><button class="btn small ghost" data-ctx>📖 Read the whole story</button><span class="spacer"></span><button class="btn big" data-ready>I\'m ready! ➜</button></div></div>';
      const play = gateUntilHeard($("[data-ready]"), () => $$("[data-rv] .verse").map((el) => ({ el, text: verseText(+el.dataset.c, +el.dataset.v) })));
      $("[data-listen]").onclick = play;
      $("[data-ready]").onclick = () => { TTS.stop(true); ask(); };
      $("[data-quit]").onclick = () => go("reviewHub");
      $("[data-ctx]").onclick = () => {
        const w = worldOfVerse(q.c, q.v1);
        go("reader", { range: w.range, title: w.name, focus: q, back: () => { showVerseAgain(); } });
      };
      setTimeout(play, 400);
    }
    function showVerseAgain() { if (cleanup) { cleanup(); cleanup = null; } TTS.stop(true); renderTopbar(); showVerse(); }
    function ask() {
      const q = withOptions(Object.assign({}, items[i]));
      startQuiz({
        mode: "review", worlds: [q.world], questions: [q],
        onDone: (res) => {
          if (res.score) right++; else missedAgain.push(q);
          i++;
          if (i < items.length) { if (cleanup) { cleanup(); cleanup = null; } renderTopbar(); showVerse(); }
          else done();
        }
      });
    }
    function done() {
      addXP(right * 5); save(); renderTopbar();
      app.innerHTML =
        '<div class="result-hero"><span class="big-emoji">🩹</span><h1>Review complete!</h1><div class="score">' + right + " / " + items.length + "</div><p>" +
        (missedAgain.length ? "Some still need practice. They will come back later!" : "You remembered them all! 🎉") + "</p></div>" +
        '<div class="rewards"><span class="reward">+' + right * 5 + ' bonus XP</span><span class="reward">🩹 ' + Object.keys(S.mistakes).length + " left to fix</span></div>" +
        '<div class="row" style="justify-content:center"><button class="btn big good" data-more>Fix more</button><button class="btn big ghost" data-home>🗺️ Map</button></div>';
      if (!missedAgain.length) { SFX.win(); confetti(60); }
      $("[data-more]").onclick = () => go("reviewHub");
      $("[data-home]").onclick = () => go("home");
      announceBadges();
    }
    showVerse();
  };

  // ---------------- Progress ----------------
  SCREENS.progress = function () {
    const li = levelInfo();
    const acc = S.totalAnswered ? Math.round((S.totalCorrect / S.totalAnswered) * 100) : 0;
    const hist = S.history.slice(-20);
    const chart = lineChart(hist.map((h) => Math.round((h.s / h.n) * 100)), hist.map((h) => h.mode));
    const worldBars = WORLDS.map((w) => {
      const vs = versesInRange(w.range);
      let r = 0, t = 0;
      vs.forEach((x) => { const s = S.verseStats[vkey(x.c, x.v)]; if (s) { r += s.r; t += s.r + s.w; } });
      const p = t ? Math.round((r / t) * 100) : 0;
      return '<div class="wbar"><span class="name">' + w.icon + " " + esc(w.name) + '</span><span class="bar"><i style="width:' + p + '%"></i></span><span class="pct">' + (t ? p + "%" : "–") + "</span></div>";
    }).join("");
    const heat = VERSES.map((x) => {
      const s = S.verseStats[vkey(x.c, x.v)];
      let cls = "";
      if (s && s.r + s.w) { const p = s.r / (s.r + s.w); cls = p >= 0.8 ? "l3" : p >= 0.5 ? "l2" : "l1"; }
      return '<button class="' + cls + '" data-c="' + x.c + '" data-v="' + x.v + '" title="Acts ' + x.c + ":" + x.v + '">' + x.c + ":" + x.v + "</button>";
    }).join("");
    const mastered = VERSES.filter((x) => { const s = S.verseStats[vkey(x.c, x.v)]; return s && s.r + s.w >= 2 && s.r / (s.r + s.w) >= 0.8; }).length;
    app.innerHTML =
      '<button class="back" data-back>← Map</button><h1 class="title-white">📈 My Progress</h1>' +
      '<div class="card"><div class="grid three">' +
      '<div class="stat"><b>' + li.L + "</b><small>Level · " + esc(li.rank) + "</small></div>" +
      '<div class="stat"><b>' + acc + '%</b><small>Correct answers</small></div>' +
      '<div class="stat"><b>' + S.totalCorrect + '</b><small>Right answers</small></div>' +
      '<div class="stat"><b>' + mastered + ' / 100</b><small>Verses mastered</small></div>' +
      '<div class="stat"><b>' + WORLDS.filter((w) => S.worlds[w.id].beaten).length + (S.finalBeaten ? " + 🏆" : "") + '</b><small>Bosses defeated</small></div>' +
      '<div class="stat"><b>' + (S.streak.count || 0) + ' 🔥</b><small>Days in a row</small></div>' +
      "</div></div>" +
      '<div class="card"><h2>📊 My last rounds</h2>' + (hist.length ? chart : '<p class="muted">Play some rounds to see your chart grow!</p>') + "</div>" +
      '<div class="card"><h2>🗺️ How well I know each world</h2>' + worldBars + "</div>" +
      '<div class="card"><h2>🧩 Verse map</h2><p class="muted">Each square is one verse. Tap a square to read and listen to it.</p><div class="heat">' + heat + "</div>" +
      '<div class="legend"><span><i style="background:#c9c6dc"></i>Not tested yet</span><span><i style="background:#ef4b5c"></i>Needs practice</span><span><i style="background:#ffb020"></i>Getting there</span><span><i style="background:#19b37d"></i>Mastered</span></div></div>';
    $("[data-back]").onclick = () => go("home");
    $$(".heat button").forEach((b) => b.onclick = () => {
      const c = +b.dataset.c, v = +b.dataset.v;
      const w = worldOfVerse(c, v);
      go("reader", { range: w.range, title: w.name, focus: { c, v1: v, v2: v }, back: () => go("progress") });
    });
  };

  function lineChart(vals, modes) {
    const W = 640, H = 220, P = 30;
    const n = vals.length;
    const x = (i) => P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
    const y = (v) => H - P - (v / 100) * (H - 2 * P);
    let grid = "";
    [0, 50, 80, 100].forEach((g) => {
      grid += '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="' + (g === 80 ? "#19b37d" : "#e6e3f7") + '" stroke-dasharray="' + (g === 80 ? "6 6" : "0") + '"/>' +
        '<text x="4" y="' + (y(g) + 4) + '" font-size="12" fill="#6d6a93">' + g + "%</text>";
    });
    const pts = vals.map((v, i) => x(i) + "," + y(v)).join(" ");
    const area = n > 1 ? '<polygon points="' + x(0) + "," + y(0) + " " + pts + " " + x(n - 1) + "," + y(0) + '" fill="rgba(108,76,255,.12)"/>' : "";
    const dots = vals.map((v, i) => '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="6" fill="' + (modes[i] === "boss" || modes[i] === "final" ? "#ef4b5c" : "#6c4cff") + '" stroke="#fff" stroke-width="2"><title>' + v + "%</title></circle>").join("");
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Scores of the last rounds">' + grid + area +
      '<polyline points="' + pts + '" fill="none" stroke="#6c4cff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>' + dots +
      '<text x="' + (W - P) + '" y="' + (y(80) - 6) + '" text-anchor="end" font-size="12" fill="#19b37d" font-weight="700">Boss goal 80%</text></svg>' +
      '<div class="legend"><span><i style="background:#6c4cff"></i>Training / Daily</span><span><i style="background:#ef4b5c"></i>Boss battles</span></div>';
  }

  // ---------------- Badges & Shop ----------------
  SCREENS.badges = function () {
    app.innerHTML = '<button class="back" data-back>← Map</button><h1 class="title-white">🏅 Badges (' + S.badges.length + "/" + BADGES.length + ")</h1>" +
      '<div class="card"><div class="grid three">' + BADGES.map((b) => {
        const has = S.badges.includes(b.id);
        return '<div class="badge-card ' + (has ? "" : "locked") + '"><span class="e">' + b.e + "</span><b>" + esc(b.name) + "</b><small>" + esc(b.desc) + "</small></div>";
      }).join("") + "</div></div>";
    $("[data-back]").onclick = () => go("home");
  };

  SCREENS.shop = function () {
    app.innerHTML = '<button class="back" data-back>← Map</button><h1 class="title-white">🛍️ Avatar Shop</h1><p class="title-white">You have <b>🪙 ' + S.coins + "</b> coins. Earn coins by answering questions and beating bosses!</p>" +
      '<div class="card"><div class="grid three">' + AVATARS.map((a, i) => {
        const owned = S.owned.includes(a.e), sel = S.avatar === a.e;
        return '<div class="shop-item ' + (sel ? "sel" : "") + '"><span class="e">' + a.e + "</span><b>" + esc(a.name) + '</b><div style="margin-top:8px">' +
          (sel ? '<button class="btn small good" disabled>Using</button>' : owned ? '<button class="btn small" data-use="' + i + '">Use</button>' :
            '<button class="btn small gold" data-buy="' + i + '" ' + (S.coins < a.price ? "disabled" : "") + ">🪙 " + a.price + "</button>") + "</div></div>";
      }).join("") + "</div></div>";
    $("[data-back]").onclick = () => go("home");
    $$("[data-use]").forEach((b) => b.onclick = () => { S.avatar = AVATARS[+b.dataset.use].e; save(); SFX.click(); go("shop"); });
    $$("[data-buy]").forEach((b) => b.onclick = () => {
      const a = AVATARS[+b.dataset.buy];
      if (S.coins < a.price) return;
      S.coins -= a.price; S.owned.push(a.e); S.avatar = a.e; save();
      SFX.coin(); confetti(30); toast(a.e + " New avatar: " + a.name + "!", "gold");
      announceBadges(); go("shop");
    });
  };

  // ---------------- Team leaderboard ----------------
  SCREENS.team = function () {
    app.innerHTML = '<button class="back" data-back>← Map</button><h1 class="title-white">🏆 My Team</h1>' +
      '<p class="title-white" style="opacity:.85">Everyone studies their own passage. Rank = how much of YOUR passage you have mastered.</p>' +
      '<div class="card" data-board><p class="muted">Loading…</p></div>';
    $("[data-back]").onclick = () => go("home");
    flush();
    Promise.resolve(opts.loadTeam ? opts.loadTeam() : []).then((rows) => {
      const box = $("[data-board]");
      if (!box) return;
      if (!rows.length) { box.innerHTML = '<p class="muted">No players yet.</p>'; return; }
      rows.sort((a, b) => (b.mastery - a.mastery) || (b.xp - a.xp));
      box.innerHTML = rows.map((r, i) => {
        const me = r.id === opts.userId;
        const medal = ["🥇", "🥈", "🥉"][i] || "#" + (i + 1);
        return '<div class="team-row' + (me ? " mine" : "") + '"><span class="rank">' + medal + '</span><span class="avatar">' + esc(r.avatar || "🧒") + "</span>" +
          '<span class="who"><b>' + esc(r.display_name) + (me ? " (you)" : "") + "</b><small>" + esc(r.passage_title || "") + " · Level " + r.level + " · 🔥 " + r.streak + " · ⚔️ " + r.bosses + "</small>" +
          '<span class="bar"><i style="width:' + r.mastery + '%"></i></span></span><span class="pct">' + r.mastery + "%</span></div>";
      }).join("");
    }).catch(() => { const box = $("[data-board]"); if (box) box.innerHTML = '<p class="muted">Could not load the team. Check your internet.</p>'; });
  };

  // ---------------- Settings ----------------
  SCREENS.settings = function () {
    const voices = TTS.voices();
    const cur = TTS.voice();
    app.innerHTML =
      '<button class="back" data-back>← Map</button><h1 class="title-white">⚙️ Settings</h1>' +
      '<div class="card"><h2>Game</h2>' +
      '<label class="switch"><input type="checkbox" data-timer ' + (S.settings.timer ? "checked" : "") + "> ⏱️ Timer in boss battles (" + QUESTION_TIME + "s per question)</label>" +
      '<label class="switch"><input type="checkbox" data-sound ' + (S.settings.sound ? "checked" : "") + "> 🔊 Sound effects</label>" +
      '<label class="switch"><input type="checkbox" data-unlock ' + (S.settings.unlockAll ? "checked" : "") + "> 🔓 Unlock all worlds and bosses</label></div>" +
      '<div class="card"><h2>Robot voice</h2>' +
      (TTS.ok ? '<label class="field"><span>Voice (English)</span><select data-voice>' + voices.map((v) => '<option value="' + esc(v.name) + '" ' + (cur && cur.name === v.name ? "selected" : "") + ">" + esc(v.name + " (" + v.lang + ")") + "</option>").join("") + "</select></label>" +
        '<button class="btn small" data-test>🔊 Test voice</button>'
        : '<p class="muted">This browser does not support speech. Use the 🎬 Video mode.</p>') + "</div>" +
      '<div class="card"><h2>Account</h2><p class="muted">Passage: <b>' + esc(PASSAGE.title) + "</b> · Rounds played: " + S.history.length + " · Accuracy: " + (S.totalAnswered ? Math.round((S.totalCorrect / S.totalAnswered) * 100) : 0) + "%</p>" +
      '<div class="row"><button class="btn ghost" data-passage>📖 Change passage</button><button class="btn ghost" data-signout>🚪 Sign out</button><button class="btn bad" data-reset>🗑️ Reset my progress</button></div></div>';

    $("[data-back]").onclick = () => go("home");
    $("[data-timer]").onchange = (e) => { S.settings.timer = e.target.checked; save(); };
    $("[data-sound]").onchange = (e) => { S.settings.sound = e.target.checked; save(); };
    $("[data-unlock]").onchange = (e) => { S.settings.unlockAll = e.target.checked; save(); };
    const vs = $("[data-voice]");
    if (vs) vs.onchange = (e) => { S.settings.voice = e.target.value; save(); };
    const tb = $("[data-test]");
    if (tb) tb.onclick = () => TTS.play([{ el: null, text: verseText(VERSES[0].c, VERSES[0].v) }]);
    $("[data-signout]").onclick = () => { flush(); if (opts.onSignOut) opts.onSignOut(); };
    $("[data-passage]").onclick = () => { flush(); if (opts.onChangePassage) opts.onChangePassage(); };
    $("[data-reset]").onclick = () => modal("⚠️", "Reset your progress?", "All progress, coins and badges for this passage will be deleted.", [
      { label: "Cancel", cls: "ghost" },
      { label: "Reset", cls: "bad", onClick: () => { const name = S.name, avatar = S.avatar; S = defaultState(); S.name = name; S.avatar = avatar; save(); go("home"); } }
    ]);
  };

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function onKey(e) {
    if (e.target.matches("input, textarea, select")) return;
    const k = "1234abcd".indexOf(e.key.toLowerCase());
    if (k >= 0) { const b = $$(".opt")[k % 4]; if (b && !b.disabled) b.click(); }
    if (e.key === "Enter") { const n = $("[data-next]"); if (n) n.click(); }
  }
  document.addEventListener("keydown", onKey);
  // Show unexpected errors on screen (instead of a button silently doing nothing) so players can report them.
  const onErr = (e) => {
    const msg = (e && (e.message || (e.reason && (e.reason.message || String(e.reason))))) || "unknown error";
    if (/ResizeObserver|Script error/i.test(msg)) return;
    report(e && (e.error || e.reason) || { message: msg }, "window");
    toast("⚠️ Something went wrong: " + esc(String(msg).slice(0, 140)) + " — please send a screenshot!");
  };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  const onHide = () => { if (document.visibilityState === "hidden" && saveTimer) flush(); };
  document.addEventListener("visibilitychange", onHide);
  window.__abg = { buildRound, blankQuestion, state: () => S };  // handy for debugging / tests
  go("home");
  if (!opts.initialState) save();   // first run: create the cloud copy
  return {
    destroy() {
      if (saveTimer) flush();
      if (cleanup) { cleanup(); cleanup = null; }
      TTS.stop(true); stopVideo();
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onErr);
      document.removeEventListener("visibilitychange", onHide);
    }
  };
}

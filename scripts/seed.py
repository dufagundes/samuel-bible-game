"""Build the seed SQL for passages, worlds, questions and (optionally) verses.

Usage:
  python3 scripts/seed.py [--verses /path/to/verses.json] > seed.sql

verses.json is {"c:v": "text"} for the book of Acts. It is NOT stored in this repository
(the NKJV is copyrighted); it is loaded straight into the database, where only signed-in
players can read it.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def q(s):
    """SQL string literal."""
    return "'" + str(s).replace("'", "''") + "'"


def arr(items):
    return "array[" + ",".join(q(x) for x in items) + "]::text[]"


def key(c, v):
    return (c, v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verses")
    args = ap.parse_args()

    data = json.load(open(os.path.join(ROOT, "content", "passages.json"), encoding="utf-8"))
    verses = json.load(open(args.verses, encoding="utf-8")) if args.verses else None
    order = None
    if verses:
        order = sorted((tuple(map(int, k.split(":"))) for k in verses))
        index = {cv: i for i, cv in enumerate(order)}

    out = ["begin;"]
    # Player profiles reference passages, so passages are upserted (never deleted).
    out.append("delete from public.questions; delete from public.worlds;")
    for p in data["passages"]:
        (sc, sv), (ec, ev) = p["range"]
        vids = {k: v for k, v in data["videos"].items() if sc <= int(k) <= ec}
        out.append(
            "insert into public.passages (id,title,start_c,start_v,end_c,end_v,sort,videos) values (%s,%s,%d,%d,%d,%d,%d,%s::jsonb)"
            " on conflict (id) do update set title=excluded.title, start_c=excluded.start_c, start_v=excluded.start_v,"
            " end_c=excluded.end_c, end_v=excluded.end_v, sort=excluded.sort, videos=excluded.videos;"
            % (q(p["id"]), q(p["title"]), sc, sv, ec, ev, p["sort"], q(json.dumps(vids)))
        )
        prev_end = None
        for i, w in enumerate(p["worlds"]):
            (wc1, wv1), (wc2, wv2) = w["range"]
            if verses:
                # worlds must be contiguous and cover the passage exactly
                start_i, end_i = index[(wc1, wv1)], index[(wc2, wv2)]
                expected = index[(sc, sv)] if prev_end is None else prev_end + 1
                if start_i != expected:
                    sys.exit("world gap/overlap in %s world %d" % (p["id"], i + 1))
                prev_end = end_i
            boss = data["bosses"][i % len(data["bosses"])]
            color = data["colors"][i % len(data["colors"])]
            out.append(
                "insert into public.worlds (passage_id,idx,name,start_c,start_v,end_c,end_v,icon,color,story,boss) values (%s,%d,%s,%d,%d,%d,%d,%s,%s,%s,%s::jsonb);"
                % (q(p["id"]), i + 1, q(w["name"]), wc1, wv1, wc2, wv2, q(w["icon"]), q(color), q(w["story"]), q(json.dumps(boss)))
            )
        if verses and prev_end != index[(ec, ev)]:
            sys.exit("worlds do not reach the end of %s" % p["id"])
        qfile = os.path.join(ROOT, "content", "questions", p["id"] + ".json")
        if os.path.exists(qfile):
            for item in json.load(open(qfile, encoding="utf-8")):
                out.append(
                    "insert into public.questions (passage_id,world_idx,ref,prompt,answer,wrong) values (%s,%d,%s,%s,%s,%s);"
                    % (q(p["id"]), item["world"], q(item["ref"]), q(item["prompt"]), q(item["answer"]), arr(item["wrong"]))
                )
    if verses:
        rows = ["('Acts',%d,%d,%s)" % (c, v, q(verses["%d:%d" % (c, v)])) for c, v in order]
        for i in range(0, len(rows), 200):
            out.append("insert into public.verses (book,c,v,text) values " + ",".join(rows[i:i + 200]) + " on conflict (book,c,v) do update set text=excluded.text;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()

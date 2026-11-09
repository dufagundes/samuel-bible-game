"""Convert a pipe-separated question list into content/questions/<passage>.json and validate it.

Input lines:  world|ref|prompt|answer|wrong1|wrong2|wrong3
Checks: the ref is inside the passage and inside the given world, options are distinct.

Usage: python3 scripts/build_questions.py <passage-id> <questions.txt>
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cv(ref_part, chap):
    return (chap, int(ref_part))


def main():
    pid, src = sys.argv[1], sys.argv[2]
    data = json.load(open(os.path.join(ROOT, "content", "passages.json"), encoding="utf-8"))
    passage = next(p for p in data["passages"] if p["id"] == pid)
    worlds = [tuple(map(tuple, w["range"])) for w in passage["worlds"]]
    out, errors = [], []
    for n, line in enumerate(open(src, encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [x.strip() for x in line.split("|")]
        if len(parts) != 7:
            errors.append("line %d: expected 7 fields, got %d" % (n, len(parts)))
            continue
        w, ref, prompt, answer, *wrong = parts
        w = int(w)
        c, vs = ref.split(":")
        v1, v2 = (vs.split("-") + [vs])[:2]
        a, b = (int(c), int(v1)), (int(c), int(v2))
        lo, hi = worlds[w - 1]
        if not (lo <= a <= hi and lo <= b <= hi):
            real = [i + 1 for i, (l, h) in enumerate(worlds) if l <= a <= h]
            errors.append("line %d: %s is not in world %d (belongs to %s)" % (n, ref, w, real))
        opts = [answer] + wrong
        if len({o.lower() for o in opts}) != 4:
            errors.append("line %d: duplicate options" % n)
        out.append({"world": w, "ref": ref, "prompt": prompt, "answer": answer, "wrong": wrong})
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    dest = os.path.join(ROOT, "content", "questions", pid + ".json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    per = {}
    for q in out:
        per[q["world"]] = per.get(q["world"], 0) + 1
    print("%s: %d questions, per world %s" % (pid, len(out), dict(sorted(per.items()))))


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Copy the unredacted skills from _vault-local into the PUBLIC repo, generalizing
every client name and named individual to a role descriptor.

The repo is public. The vault (one level above the repo) is not. This script is the
only sanctioned path between them, so the two copies can never drift by hand.

Run:  python redact-skills.py            # write + verify
      python redact-skills.py --check    # verify only, no writes
"""
import io, os, re, sys, shutil

VAULT = r"c:\Clients\Creative Adbundance\_vault-local\skills"
REPO  = r"c:\Clients\Creative Adbundance\Creative-Adbundance\.claude\skills"

SKILLS = ['ad-concept-generator', 'ad-script-writer', 'batch-shoot-package', 'audience-harvest']

# Ordered longest-first so a longer phrase is consumed before its substring.
# Each entry: (regex, replacement). Case-sensitive by design; the names are proper nouns.
RULES = [
    # --- product lines pending clearance (name the client, so they go first) ---
    (r"\bSolstice by Nurx\b",            "an unreleased product line"),
    (r"\bReviveRx Cream\b",              "a pending-clearance cream"),

    # --- named individuals ---
    (r"\bEric Mann's\b",                 "the agency principal's"),
    (r"\bEric Mann\b",                   "the agency principal"),
    (r"\bEric x Ricardo\b",              "the principal x Ricardo"),
    (r"\bEric's\b",                      "the principal's"),
    (r"\(Eric:",                         "(the principal:"),
    (r"\bEric requested\b",              "the principal requested"),
    (r"\bMatt on the ([A-Za-z ]+?) kickoff\b", r"the client's growth lead on the \1 kickoff"),
    (r"\bMatt on ([A-Za-z ]+?) kickoff\b",     r"the client's growth lead on the \1 kickoff"),
    (r"\bSantiago on ([A-Za-z ]+?) kickoff\b", r"the client's brand lead on the \1 kickoff"),

    # --- client accounts (possessives before bare names) ---
    (r"\bNurx's\b",                      "the telehealth account's"),
    (r"\bNurx Batch\b",                  "the telehealth account's Batch"),
    (r"\bNurx anti-aging\b",             "the telehealth account, anti-aging"),
    (r"\bNurx bi-weekly\b",              "the telehealth account's bi-weekly"),
    (r"\bNurx feedback\b",               "telehealth-account feedback"),
    (r"\bNurx\b",                        "the telehealth account"),

    (r"\bARMRA Batch\b",                 "the colostrum brand's Batch"),
    (r"\bARMRA's\b",                     "the colostrum brand's"),
    (r"\bARMRA\b",                       "the colostrum brand"),

    (r"\bPersonal Chef USA\b",           "the meal-service account"),
    (r"\bPath Social's\b",               "a social-growth tool's"),
    (r"\bPath Social\b",                 "a social-growth tool"),
    (r"\bPlixi's\b",                     "a social-growth tool's"),
    (r"\bPlixi\b",                       "a social-growth tool"),
    (r"\bHuckleberry's\b",               "the parenting app's"),
    (r"\bHuckleberry\b",                 "the parenting app"),
    (r"\bMistplay's\b",                  "a mobile-games app's"),
    (r"\bMistplay\b",                    "a mobile-games app"),
    (r"\bRip Van Batch\b",               "the snack brand's Batch"),
    (r"\bRip Van's\b",                   "the snack brand's"),
    (r"\bRip Van\b",                     "the snack brand"),
    (r"\bInado's\b",                     "a home-security brand's"),
    (r"\bInado\b",                       "a home-security brand"),
    (r"\bThreadBeast\b",                 "an apparel-subscription brand"),
]

# Nothing matching these may survive in the repo copy.
FORBIDDEN = [
    'Nurx', 'Plixi', 'Path Social', 'Huckleberry', 'ARMRA', 'Mistplay', 'Rip Van',
    'Personal Chef', 'Inado', 'Eric Mann', 'Solstice', 'ReviveRx', 'ThreadBeast',
]

def redact(text):
    for pat, rep in RULES:
        text = re.sub(pat, rep, text)
    return text

def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != 'node_modules']
        for fn in filenames:
            yield os.path.join(dirpath, fn)

def main():
    check_only = '--check' in sys.argv
    total, changed, copied = 0, 0, 0
    problems = []

    for skill in SKILLS:
        src_root = os.path.join(VAULT, skill)
        dst_root = os.path.join(REPO, skill)
        if not os.path.isdir(src_root):
            print('!! missing vault skill: %s' % skill); return 1
        for src in walk(src_root):
            rel = os.path.relpath(src, src_root)
            dst = os.path.join(dst_root, rel)
            total += 1
            if src.lower().endswith(('.md', '.json', '.js', '.py', '.ps1', '.txt')):
                raw = io.open(src, encoding='utf-8').read()
                out = redact(raw)
                if out != raw:
                    changed += 1
                for word in FORBIDDEN:
                    if word.lower() in out.lower():
                        problems.append('%s -> still contains %r' % (rel, word))
                if not check_only:
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    io.open(dst, 'w', encoding='utf-8', newline='\n').write(out)
                    copied += 1
            else:
                if not check_only:
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copy2(src, dst)
                    copied += 1

    print('scanned %d files, redacted %d, wrote %d' % (total, changed, copied))
    if problems:
        print('\n!! REDACTION FAILED, %d leak(s):' % len(problems))
        for p in problems:
            print('   ' + p)
        return 1
    print('verified: no client name survives in the repo copy')
    return 0

if __name__ == '__main__':
    sys.exit(main())

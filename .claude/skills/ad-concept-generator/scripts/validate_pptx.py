import sys, zipfile, xml.etree.ElementTree as ET
p = sys.argv[1]
z = zipfile.ZipFile(p)
bad = z.testzip()
if bad: print("CORRUPT ZIP ENTRY:", bad); sys.exit(1)
malformed = []
for n in z.namelist():
    if n.endswith(".xml") or n.endswith(".rels"):
        try: ET.fromstring(z.read(n))
        except Exception as e: malformed.append((n, str(e)))
slides = [n for n in z.namelist() if n.startswith("ppt/slides/slide")]
print(f"OK  parts={len(z.namelist())}  slides={len(slides)}  malformed={len(malformed)}")
for n, e in malformed: print("  MALFORMED", n, e)
sys.exit(1 if malformed else 0)

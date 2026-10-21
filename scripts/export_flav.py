#!/usr/bin/env python3
"""Exportiert die USDA-Flavonoid-Datenbank 3.3 (Access) nach rohdaten/flav.json.
Benötigt: pip install access-parser"""
import json
from pathlib import Path

from access_parser import AccessParser

RAW = Path(__file__).resolve().parent.parent / "rohdaten"
db = AccessParser(str(RAW / "flav" / "Flav_R03-3.accdb"))
nd = db.parse_table("NUTR_DEF")
cls = dict(zip(nd["Nutr_no"], nd["Flav_Class"]))
d = db.parse_table("FLAV_DAT")
out = {}
for ndb, n, v in zip(d["NDB_No"], d["Nutr_no"], d["Flav_Val"]):
    if v is None:
        continue
    c = cls[n].strip()
    out.setdefault(ndb, {})
    out[ndb][c] = round(out[ndb].get(c, 0) + v, 3)
(RAW / "flav.json").write_text(json.dumps(out))
print(f"{len(out)} Lebensmittel mit Flavonoid-Daten")

#!/usr/bin/env python3
"""Baut data/lebensmittel.json (kuratierte deutsche Liste) und data/usda.json
(alle ~7800 USDA-SR-Legacy-Lebensmittel, englisch) aus den Rohdaten.

Rohdaten (nicht im Repo, siehe README):
  rohdaten/sr/FoodData_Central_sr_legacy_food_csv_2018-04/*.csv
  rohdaten/flav.json  (aus der USDA-Flavonoid-Datenbank 3.3 exportiert)
"""
import csv
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SR = next((ROOT / "rohdaten" / "sr").glob("FoodData_Central_sr_legacy_food_csv_*"))
OUT = ROOT / "data"

# App-Schlüssel -> USDA-Nährstoff-IDs (erste vorhandene gewinnt)
NUTRIENTS = {
    "kcal": [1008], "protein": [1003], "fat": [1004], "carbs": [1005],
    "fiber": [1079], "sugar": [2000, 1063], "water": [1051], "alcohol": [1018],
    "caffeine": [1057],
    "satfat": [1258], "mufa": [1292], "pufa": [1293], "trans": [1257],
    "chol": [1253], "la": [1316, 1269], "ala": [1404, 1270],
    "epa": [1278], "dha": [1272], "dpa": [1280],
    "ca": [1087], "fe": [1089], "mg": [1090], "p": [1091], "k": [1092],
    "na": [1093], "zn": [1095], "cu": [1098], "mn": [1101], "se": [1103],
    "vitA": [1106], "retinol": [1105], "betaCarotene": [1107],
    "alphaCarotene": [1108], "cryptoxanthin": [1120], "lycopene": [1122],
    "lutein": [1123], "vitE": [1109], "vitD": [1114], "vitK": [1185],
    "vitC": [1162], "b1": [1165], "b2": [1166], "niacin": [1167],
    "b5": [1170], "b6": [1175], "folate": [1187, 1177], "b12": [1178],
    "choline": [1180],
    "trp": [1210], "thr": [1211], "ile": [1212], "leu": [1213], "lys": [1214],
    "met": [1215], "cys": [1216], "phe": [1217], "tyr": [1218], "val": [1219],
    "his": [1221],
}
AMINO = ["trp", "thr", "ile", "leu", "lys", "met", "cys", "phe", "tyr", "val", "his"]
FATTY = ["satfat", "mufa", "pufa", "trans", "la", "ala", "epa", "dha", "dpa"]
GRAM_TO_MG = set(AMINO) | {"la", "ala", "epa", "dha", "dpa"}
FLAV_KEYS = {"Anthocyanidins": "anthocyanins", "Flavan-3-ols": "flavan3ols",
             "Flavanones": "flavanones", "Flavones": "flavones", "Flavonols": "flavonols"}
# Durch US-Anreicherung von Mehl verfälschte Nährstoffe (Folat: wir nutzen ohnehin nur Nahrungsfolat)
ENRICHED = ["b1", "b2", "niacin", "fe"]
# Grobe Iod-Schätzwerte (µg/100 g) je Kategorie, falls in der Liste nichts steht
IOD_DEFAULT = {"Obst": 1, "Gemüse": 2, "Hülsenfrüchte": 2, "Getreide & Brot": 4,
               "Milchprodukte & Eier": 10, "Käse": 20, "Fleisch & Wurst": 3,
               "Fisch": 30, "Nüsse & Samen": 2, "Öle & Fette": 0, "Getränke": 0.5,
               "Snacks & Süßes": 3, "Sonstiges": 1, "Gerichte": 8}


def sig(x, n=3):
    if x == 0:
        return 0
    d = n - int(math.floor(math.log10(abs(x)))) - 1
    v = round(x, max(d, 0))
    return int(v) if v == int(v) else v


def load():
    foods = {}
    with open(SR / "food.csv") as f:
        for r in csv.DictReader(f):
            foods[r["fdc_id"]] = {"desc": r["description"], "cat": r["food_category_id"]}
    with open(SR / "sr_legacy_food.csv") as f:
        for r in csv.DictReader(f):
            foods[r["fdc_id"]]["ndb"] = r["NDB_number"].zfill(5)
    wanted = {i for ids in NUTRIENTS.values() for i in ids}
    raw = {}
    with open(SR / "food_nutrient.csv") as f:
        for r in csv.DictReader(f):
            nid = int(r["nutrient_id"])
            if nid in wanted:
                raw.setdefault(r["fdc_id"], {})[nid] = float(r["amount"])
    cats = {}
    with open(SR / "food_category.csv") as f:
        for r in csv.DictReader(f):
            cats[r["id"]] = r["description"]
    portions = {}
    with open(SR / "food_portion.csv") as f:
        for r in csv.DictReader(f):
            label = " ".join(x for x in (r["amount"], r["portion_description"] or r["modifier"]) if x).strip()
            portions.setdefault(r["fdc_id"], []).append((label, float(r["gram_weight"])))
    flav = json.loads((ROOT / "rohdaten" / "flav.json").read_text())
    return foods, raw, cats, portions, flav


def nutrients_for(fdc, raw, foods, flav):
    src = raw.get(fdc, {})
    out = {}
    for key, ids in NUTRIENTS.items():
        for i in ids:
            if i in src:
                v = src[i] * (1000 if key in GRAM_TO_MG else 1)
                out[key] = v
                break
    # Fehlende Werte, die sachlich null sind
    if out.get("protein", 1) < 0.1:
        for k in AMINO:
            out.setdefault(k, 0)
    if out.get("fat", 1) < 0.1:
        for k in FATTY + ["chol", "vitE", "vitD", "vitA", "retinol"]:
            out.setdefault(k, 0)
    out.setdefault("alcohol", 0)
    # Niacin-Äquivalente: Niacin + Tryptophan/60
    if "niacin" in out:
        trp = out.get("trp", out.get("protein", 0) * 1000 * 0.011)
        out["niacinNE"] = out["niacin"] + trp / 60
    ndb = foods[fdc].get("ndb")
    if ndb in flav:
        for cls, key in FLAV_KEYS.items():
            out[key] = flav[ndb].get(cls, 0)
    return out


def round_all(n):
    return {k: sig(v) for k, v in n.items() if v is not None}


def parse_list():
    entries = []
    cat = None
    for line in (ROOT / "scripts" / "lebensmittel.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        if line.startswith("## "):
            cat = line[3:].strip()
            continue
        parts = [p.strip() for p in line.split("|")]
        parts += [""] * (6 - len(parts))
        name, kat, desc, port, alias, extra = parts[:6]
        portions = []
        for p in filter(None, port.split(",")):
            unit, g = p.split("=")
            portions.append([unit.strip(), float(g)])
        entries.append({
            "name": name, "cat": kat or cat, "desc": desc, "portions": portions,
            "aliases": [a.strip() for a in alias.split(",") if a.strip()],
            "extra": extra.split(),
        })
    return entries


def find(desc, index):
    d = desc.lower()
    if d in index:
        return index[d]
    cands = [(len(k), v) for k, v in index.items() if k.startswith(d)]
    if not cands:
        cands = [(len(k), v) for k, v in index.items() if d in k]
    return min(cands)[1] if cands else None


def main():
    foods, raw, cats, portions, flav = load()
    index = {v["desc"].lower(): k for k, v in foods.items()}

    # Nicht angereicherte Mehle: ihre Werte ersetzen die US-Anreicherung (Mehlanteil x Mehlwert)
    flours = {key: nutrients_for(find(desc, index), raw, foods, flav) for key, desc in (
        ("w", "Wheat flour, white, all-purpose, unenriched"),
        ("rd", "Rye flour, dark"), ("rm", "Rye flour, medium"))}

    out, missing = [], []
    for i, e in enumerate(parse_list()):
        n = {}
        fdc = None
        if e["desc"] != "-":
            fdc = find(e["desc"], index)
            if not fdc:
                missing.append(e["name"] + " <- " + e["desc"])
                continue
            n = nutrients_for(fdc, raw, foods, flav)
        tags, est = [], []
        for x in e["extra"]:
            if x in ("kreuz", "allium"):
                tags.append(x)
            elif x.startswith("enr="):
                flour, share = x[4:].split(":")
                for k in ENRICHED:
                    n[k] = flours[flour][k] * float(share)
                if "niacin" in n:
                    n["niacinNE"] = n["niacin"] + n.get("trp", 0) / 60
            elif x.startswith("flav="):
                ndb, _, fac = x[5:].partition(":")
                src = flav.get(ndb, {}) if ndb != "0" else {}
                for cls, key in FLAV_KEYS.items():
                    n[key] = src.get(cls, 0) * float(fac or 1)
            elif x.startswith("bg="):
                n["betaGlucan"] = float(x[3:])
            elif x.startswith("iod="):
                n["iod"] = float(x[4:])
            elif x.startswith("set:"):
                k, v = x[4:].split("=")
                v = float(v)
                old = n.get(k)
                n[k] = v
                if old:
                    group = FATTY + ["chol"] if k == "fat" else AMINO if k == "protein" else []
                    for g in group:
                        if g in n:
                            n[g] *= v / old
        if "iod" not in n:
            n["iod"] = IOD_DEFAULT.get(e["cat"], 2)
            est.append("iod")
        # Getreide, Süßes und Gerichte enthalten kaum Flavonoide – fehlende Werte als 0 zählen
        if e["cat"] in ("Getreide & Brot", "Snacks & Süßes", "Gerichte") and "flavonols" not in n:
            for key in FLAV_KEYS.values():
                n[key] = 0
        if "betaGlucan" not in n:
            n["betaGlucan"] = 0
        item = {
            "id": f"de{i}", "name": e["name"], "cat": e["cat"],
            "aliases": e["aliases"], "portions": e["portions"],
            "n": round_all(n), "src": foods[fdc]["desc"] if fdc else "eigene Angabe",
        }
        if "fl" in e["extra"]:
            item["liquid"] = True
        if tags:
            item["tags"] = tags
        if est:
            item["est"] = est
        out.append(item)

    if missing:
        print("NICHT GEFUNDEN:", *missing, sep="\n  ", file=sys.stderr)
    OUT.mkdir(exist_ok=True)
    (OUT / "lebensmittel.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out)} kuratierte Lebensmittel")

    # Vollständige USDA-Liste für die erweiterte Suche
    usda = []
    for fdc, f in foods.items():
        if fdc not in raw:
            continue
        n = round_all(nutrients_for(fdc, raw, foods, flav))
        if "kcal" not in n:
            continue
        port = [[re.sub(r"\s+", " ", l)[:40], sig(g)] for l, g in portions.get(fdc, [])[:4] if g > 0]
        usda.append({"id": f"us{fdc}", "name": f["desc"], "cat": cats.get(f["cat"], ""),
                     "portions": port, "n": n})
    (OUT / "usda.json").write_text(json.dumps(usda, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(usda)} USDA-Lebensmittel")


if __name__ == "__main__":
    main()

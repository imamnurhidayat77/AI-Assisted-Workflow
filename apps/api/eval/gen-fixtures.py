#!/usr/bin/env python3
"""Generate E2 ground-truth fixtures: real content, deterministic keys.

- tender/sales/quotation/general: real .txt/.csv content (values in keys.json).
- sales .xlsx: written by gen-xlsx.ts (same keys).
- ocr_*.png: rendered text (PIL) for offline Tesseract recall scoring.
Idempotent: rewrites eval/fixtures/* + eval/fixtures/keys.json.
"""
import csv
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
FIX.mkdir(parents=True, exist_ok=True)

keys = []


def kv_txt(path, lines):
    (FIX / path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def add(entry):
    keys.append(entry)


# --- 6 tender .txt -----------------------------------------------------------
tenders = [
    ("tender_auckland_2026.txt", "TND-2026-001", "NZ Transport Agency",
     "Auckland Smart Road Upgrade", "24 Nov 2026", "NZD 1,250,000", "Smartstud road studs"),
    ("tender_wellington_tunnel.txt", "TND-2026-002", "Wellington Infrastructure",
     "Wellington Tunnel Safety Upgrade", "03 Dec 2026", "NZD 840,000", "Tunnel markers"),
    ("tender_christchurch_ped.txt", "TND-2026-003", "Christchurch City Council",
     "Christchurch Pedestrian Safety", "15 Dec 2026", "NZD 420,000", "Smartped"),
    ("nzta_brisbane_crossing.txt", "TND-2026-004", "Brisbane City Council",
     "Brisbane Active Crossing Program", "08 Jan 2027", "AUD 690,000", "Smartped"),
    ("tender_oslo_visibility.txt", "TND-2026-005", "Norwegian Roads Authority",
     "Oslo Winter Road Visibility", "19 Jan 2027", "EUR 580,000", "Smartstud"),
    ("tender_singapore_guidance.txt", "TND-2026-006", "Land Transport Authority",
     "Singapore Tunnel Guidance", "28 Jan 2027", "SGD 1,100,000", "Tunnel markers"),
]
for fn, tid, agency, name, closes, value, product in tenders:
    kv_txt(fn, [
        f"{agency} — {name}",
        f"Tender ID: {tid}",
        f"Closes: {closes}",
        f"Estimated value: {value}",
        f"Product: {product}",
        "Requirements: 14 clauses; site briefing 10 Nov 2026; 4,800 units SRS-8",
    ])
    add({"file": fn, "branch": "tender", "expectKind": "Government Tender",
         "expectValues": [tid, agency, closes, value.replace(" ", ""), product.split()[0]]})

# --- 5 sales: 3 .csv + 2 .xlsx (xlsx via gen-xlsx.ts) --------------------------
sales_rows = [
    ["period", "region", "sku", "units", "growth"],
    ["Q3 2026", "NZ", "Smartstud SRS-8", "4820", "+22%"],
    ["Q3 2026", "AU", "Smartstud SRS-8", "3560", "+14%"],
    ["Q3 2026", "Pacific", "Smartped P-2", "1210", "+6%"],
]
for fn in ["sales_q3_2026.csv", "sales_nz_au.csv", "sales_distributor_q3.csv"]:
    with open(FIX / fn, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(sales_rows)
    add({"file": fn, "branch": "sales", "expectKind": "Distributor Sales",
         "expectValues": ["Q3 2026", "Smartstud SRS-8", "4820", "22%"]})
for fn in ["sales_pacific.xlsx", "sales_annual.xlsx"]:
    add({"file": fn, "branch": "sales", "expectKind": "Distributor Sales",
         "expectValues": ["Q3 2026", "Smartstud SRS-8", "4820", "22%"]})

# --- 5 quotation .txt ----------------------------------------------------------
quots = [
    ("Smartstud_Quotation_1042.txt", "Q-1042", "NZD 84,500", "6", "TND-2026-001"),
    ("quotation_wellington_2071.txt", "Q-2071", "NZD 132,000", "9", "TND-2026-002"),
    ("quotation_brisbane_3090.txt", "Q-3090", "AUD 96,750", "7", "TND-2026-004"),
    ("quotation_oslo_4110.txt", "Q-4110", "EUR 58,200", "4", "TND-2026-005"),
    ("quotation_spot_5001.txt", "Q-5001", "NZD 12,300", "2", "TND-2026-003"),
]
for fn, qno, total, items, linked in quots:
    kv_txt(fn, [
        f"Quotation {qno} — Smart City Street Ltd",
        f"Total: {total}",
        f"Line items: {items}",
        "Status: Awaiting approval",
        f"Linked tender: {linked}",
        "Valid until: 30 Nov 2026",
    ])
    add({"file": fn, "branch": "quotation", "expectKind": "Quotation",
         "expectValues": [qno, total.replace(" ", ""), linked]})

# --- 2 general -----------------------------------------------------------------
kv_txt("meeting_notes_oct.txt", [
    "Weekly ops sync — 28 Oct 2026",
    "Attendees: Isaac, Mei, Sam",
    "Follow up: distributor NZ onboarding checklist",
])
add({"file": "meeting_notes_oct.txt", "branch": "general", "expectKind": "General Document",
     "expectValues": ["Isaac"]})
with open(FIX / "misc_log.csv", "w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows([["date", "event"], ["2026-10-01", "stocktake"], ["2026-10-02", "delivery"]])
add({"file": "misc_log.csv", "branch": "general", "expectKind": "General Document",
     "expectValues": ["stocktake"]})

# --- 2 OCR .png (PIL) ------------------------------------------------------------
def render_png(path, lines):
    img = Image.new("RGB", (1400, 120 + 110 * len(lines)), "white")
    d = ImageDraw.Draw(img)
    for i, ln in enumerate(lines):
        d.text((60, 60 + 110 * i), ln, fill="black")
    img.save(FIX / path)


render_png("ocr_quotation_1042.png", ["Quotation Q-1042", "Total NZD 84,500", "Auckland Smart Road"])
add({"file": "ocr_quotation_1042.png", "branch": "ocr", "expectKind": "ocr",
     "expectTextContains": ["Q-1042", "84500", "Auckland"]})
render_png("ocr_tender_notice.png", ["TND-2026-002 Wellington Tunnel", "Closes 03 Dec 2026", "NZD 840,000"])
add({"file": "ocr_tender_notice.png", "branch": "ocr", "expectKind": "ocr",
     "expectTextContains": ["TND-2026-002", "Wellington", "840000"]})

# Merge-safe: ganti hanya entri milik set ini, pertahankan milik set lain
# (mis. 20 fixture paralel TND-FX/Q-200x) agar regenerasi tidak menghapus.
mine = [{"file": e["file"], "kind": e["expectKind"],
         **({"expectValues": e["expectValues"]} if "expectValues" in e else {}),
         **({"ocr": True, "expectTextContains": e["expectTextContains"]} if e.get("branch") == "ocr" else {})}
        for e in keys]
managed = {m["file"] for m in mine}
merged = []
kp = FIX / "keys.json"
if kp.exists():
    try:
        prev = json.loads(kp.read_text(encoding="utf-8"))
        prev_list = prev.get("fixtures", prev if isinstance(prev, list) else [])
        merged = [p for p in prev_list if p.get("file") not in managed]
    except (json.JSONDecodeError, AttributeError):
        merged = []
merged.extend(mine)
kp.write_text(json.dumps({"fixtures": merged,
                          "note": "SIMULATED data, not real company data."}, indent=2) + "\n", encoding="utf-8")
print(f"merged {len(mine)} keys (total {len(merged)}) → {kp}")

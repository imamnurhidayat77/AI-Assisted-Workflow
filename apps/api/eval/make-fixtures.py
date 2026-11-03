"""Generate 20-file ground-truth set untuk E2 (extraction accuracy, NFR-02).

Regenerasi: /tmp/fixturegen/bin/python apps/api/eval/make-fixtures.py
  (butuh fpdf2 + openpyxl sekali saja; python-docx sudah ada di sistem)
Output: apps/api/eval/fixtures/ (20 file + keys.json).
Semua data SIMULASI — bukan data perusahaan asli (lih. docs/03-test-evaluation-plan.md).

Aturan nama file (penting): klasifikasi kind di services/documents.ts
berbasis substring nama — tender*/sales*/quot* harus memicu kind yang benar,
file general TIDAK BOLEH mengandung substring itu. Isi ASCII-only agar
lolos pdf-parse/mammoth/sheetjs tanpa artefak encoding.
"""
import csv
import json
import os
import shutil

from fpdf import FPDF
from openpyxl import Workbook
from docx import Document

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


def save_pdf(name, lines):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    for ln in lines:
        pdf.cell(w=0, h=6, text=ln, new_x="LMARGIN", new_y="NEXT")
    pdf.output(os.path.join(OUT, name))


def save_docx(name, lines):
    doc = Document()
    for ln in lines:
        doc.add_paragraph(ln)
    doc.save(os.path.join(OUT, name))


def save_csv(name, rows):
    with open(os.path.join(OUT, name), "w", newline="") as f:
        csv.writer(f).writerows(rows)


def save_xlsx(name, rows):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    wb.save(os.path.join(OUT, name))


WRITERS = {"pdf": save_pdf, "docx": save_docx, "csv": save_csv, "xlsx": save_xlsx}

TENDERS = [
    ("TND-FX-001", "NZ Transport Agency", "New Zealand", "24 Nov 2026", "NZD 1,250,000", "Smartstud", "4800 units SRS-8"),
    ("TND-FX-002", "Wellington Infrastructure", "New Zealand", "03 Dec 2026", "NZD 840,000", "Tunnel markers", "1200 units TM-4"),
    ("TND-FX-003", "Christchurch City Council", "New Zealand", "15 Dec 2026", "NZD 420,000", "Smartped", "650 units SP-2"),
    ("TND-FX-004", "Brisbane City Council", "Australia", "08 Jan 2027", "AUD 690,000", "Smartped", "900 units SP-2"),
    ("TND-FX-005", "Norwegian Roads Authority", "Norway", "19 Jan 2027", "EUR 580,000", "Smartstud", "3100 units SRS-8"),
    ("TND-FX-006", "Land Transport Authority", "Singapore", "28 Jan 2027", "SGD 1,100,000", "Tunnel markers", "2000 units TM-4"),
]

SALES_ROWS = [
    ["Region", "Distributor", "SKU", "Units", "Revenue"],
    ["NZ", "Auckland Roads Ltd", "SRS-8", "4200", "NZD 310000"],
    ["NZ", "Capital Safety Supplies", "SP-2", "900", "NZD 54000"],
    ["AU", "Brisbane Traffic Systems", "SP-2", "1500", "AUD 120000"],
    ["AU", "Outback Road Gear", "SRS-8", "2600", "AUD 210000"],
    ["Pacific", "Suva Island Works", "TM-4", "700", "FJD 68000"],
]

QUOTS = [
    ("Q-2001", "NZD 84,500", "6", "TND-FX-001"),
    ("Q-2002", "NZD 41,200", "3", "TND-FX-002"),
    ("Q-2003", "AUD 57,900", "4", "TND-FX-004"),
    ("Q-2004", "EUR 33,750", "2", "TND-FX-005"),
    ("Q-2005", "SGD 96,000", "5", "TND-FX-006"),
]


def specs():
    out = []
    for tid, agency, country, close, value, product, units in TENDERS:
        lines = ["GOVERNMENT TENDER NOTICE", f"Tender ID: {tid}", f"Agency: {agency}",
                 f"Country: {country}", f"Closing date: {close}", f"Estimated value: {value}",
                 f"Product: {product}", f"Quantity: {units}",
                 "Briefing: mandatory site briefing one week before closing."]
        out.append((f"Tender_{tid}.pdf", "pdf", lines, "Government Tender", [tid, agency, close, product]))
    for n in ("NZ", "AU", "Pacific"):
        rows = [r for r in SALES_ROWS if r[0] in ("Region", n)]
        for ext in ("xlsx", "csv"):
            out.append((f"Distributor_Sales_{n}_Q3.{ext}", ext, rows, "Distributor Sales",
                        [n, rows[1][1], rows[1][2], rows[1][4]]))
    for i, (qno, total, items, linked) in enumerate(QUOTS):
        lines = ["SALES QUOTATION", f"Quotation No: {qno}", f"Total: {total}",
                 f"Line items: {items}", "Status: Awaiting approval", f"Linked tender: {linked}"]
        ext = "pdf" if i < 3 else "docx"
        out.append((f"Quotation_{qno}.{ext}", ext, lines, "Quotation", [qno, total, linked]))
    out.append(("Team_Memo_Oct.pdf", "pdf",
                ["INTERNAL MEMO", "Subject: October roster freeze",
                 "All leave requests for December close on 15 Nov 2026."],
                "General Document", ["October roster freeze", "15 Nov 2026"]))
    out.append(("Leave_Policy_2026.docx", "docx",
                ["LEAVE POLICY 2026", "Annual leave: 20 days per year.", "Sick leave: 10 days per year."],
                "General Document", ["20 days per year", "10 days per year"]))
    out.append(("Site_Notes.csv", "csv",
                [["Site", "Note"], ["Depot A", "restock TM-4 before Friday"], ["Depot B", "calibrate tester unit 3"]],
                "General Document", ["Depot A", "restock TM-4 before Friday"]))
    return out


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    keys = []
    for name, ext, content, kind, must_contain in specs():
        WRITERS[ext](name, content)
        keys.append({"file": name, "kind": kind, "mustContain": must_contain})
    with open(os.path.join(OUT, "keys.json"), "w") as f:
        json.dump({"fixtures": keys, "note": "SIMULATED data, not real company data."}, f, indent=2)
    print(f"wrote {len(keys)} fixtures + keys.json -> {OUT}")


if __name__ == "__main__":
    main()

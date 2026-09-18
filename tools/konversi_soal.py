"""
Konversi file PDF "Simulasi Soal N.pdf" menjadi data soal untuk website.

Pemakaian (dari folder proyek):
    python tools/konversi_soal.py

Membaca setiap "Simulasi Soal 1.pdf", "Simulasi Soal 2.pdf", "Simulasi Soal 3.pdf"
lalu menulis soal/tes1.js, soal/tes2.js, soal/tes3.js.
Membutuhkan PyMuPDF:  pip install pymupdf
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "soal"

RE_QUESTION = re.compile(r"^(\d+)\.\s+(.*)$")
RE_OPTION = re.compile(r"^([A-D])\.\s+(.*)$")
RE_EXPLAIN = re.compile(r"^(\d+)\.\s+([A-D])\.\s+(.*)$")


def join(a, b):
    if not a:
        return b
    if a.endswith("-") and not a.endswith(" -"):
        return a + b
    return a + " " + b


def content_lines(doc):
    """Semua baris isi (tanpa header/footer) beserta posisi x-nya."""
    for page in doc:
        lines = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                spans = line["spans"]
                text = "".join(s["text"] for s in spans).replace("​", "").strip()
                if not text or spans[0]["size"] < 8:  # header & footer halaman berukuran kecil
                    continue
                lines.append((line["bbox"][0], text))
        if not lines:
            continue
        base_x = min(x for x, _ in lines)
        for x, text in lines:
            yield x - base_x > 8, text


def parse(pdf_path):
    doc = pymupdf.open(pdf_path)
    title = doc[0].get_text().strip().splitlines()[0].strip()

    questions, section, category = [], "", ""
    state = None  # None | "stem" | "option"
    in_questions = in_explain = False
    explain_text = []

    for indented, text in content_lines(doc):
        if text.startswith("Lampiran"):
            in_questions = False
            continue
        if text.startswith("Pembahasan kompetensi"):
            in_explain = True
            continue
        if in_explain:
            explain_text.append(text)
            continue
        if text.startswith("Bagian I"):
            in_questions = True
            section = re.sub(r"^Bagian\s+[IVX\-AB]+:\s*", "", text)
            category, state = "", None
            continue
        if not in_questions or text.startswith("Pilih satu"):
            continue

        m_opt = RE_OPTION.match(text)
        m_q = RE_QUESTION.match(text)
        if m_opt and state in ("stem", "option"):
            q = questions[-1]
            if m_opt.group(1) == "ABCD"[len(q["opsi"])]:
                q["opsi"].append(m_opt.group(2))
                state = "option"
                continue
        if indented and state == "option":
            q = questions[-1]
            q["opsi"][-1] = join(q["opsi"][-1], text)
        elif m_q and int(m_q.group(1)) == len(questions) + 1:
            questions.append({
                "no": len(questions) + 1,
                "bagian": section,
                "kategori": category,
                "soal": m_q.group(2),
                "opsi": [],
            })
            state = "stem"
        elif state == "stem":
            questions[-1]["soal"] = join(questions[-1]["soal"], text)
        else:
            # Baris tanpa nomor setelah opsi = subjudul kompetensi/bidang
            category, state = text, None

    # Pembahasan: "N. X. teks..."
    explains, cur = {}, None
    for text in explain_text:
        m = RE_EXPLAIN.match(text)
        if m and int(m.group(1)) == len(explains) + 1:
            cur = int(m.group(1))
            explains[cur] = {"kunci": m.group(2), "pembahasan": m.group(3)}
        elif cur:
            explains[cur]["pembahasan"] = join(explains[cur]["pembahasan"], text)

    for q in questions:
        info = explains.get(q["no"])
        if not info:
            sys.exit(f"{pdf_path.name}: pembahasan soal {q['no']} tidak ditemukan")
        if len(q["opsi"]) != 4:
            sys.exit(f"{pdf_path.name}: soal {q['no']} memiliki {len(q['opsi'])} opsi")
        q["kunci"] = info["kunci"]
        q["pembahasan"] = info["pembahasan"]

    paket = pdf_path.stem.split()[-1]
    return {
        "judul": f"{title.split(':')[0]} — Paket {paket}",
        "durasiMenit": len(questions),  # 1 menit per soal
        "soal": questions,
    }


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for i in (1, 2, 3):
        pdf = ROOT / f"Simulasi Soal {i}.pdf"
        if not pdf.exists():
            print(f"Lewati: {pdf.name} tidak ada")
            continue
        data = parse(pdf)
        js = (
            "window.BANK_SOAL = window.BANK_SOAL || {};\n"
            f"window.BANK_SOAL[{i}] = {json.dumps(data, ensure_ascii=False, indent=1)};\n"
        )
        (OUT_DIR / f"tes{i}.js").write_text(js, encoding="utf-8")
        print(f"{pdf.name}: {len(data['soal'])} soal -> soal/tes{i}.js")


if __name__ == "__main__":
    main()

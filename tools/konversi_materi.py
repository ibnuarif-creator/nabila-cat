"""
Konversi file PDF materi belajar menjadi data untuk halaman "Materi" di website.

Pemakaian (dari folder proyek):
    python tools/konversi_materi.py

Membaca "Materi Belajar*.pdf" lalu menulis soal/materi.js.
Membutuhkan PyMuPDF:  pip install pymupdf
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "soal" / "materi.js"

RE_NUMBERED = re.compile(r"^(\d+)\.\s+")


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def spans_html(spans):
    """Gabungkan span menjadi HTML sederhana; teks tebal menjadi <strong>."""
    out = ""
    for s in spans:
        text = esc(s["text"].replace("​", ""))
        if not text:
            continue
        out += f"<strong>{text}</strong>" if s["flags"] & 16 and text.strip() else text
    return out


def join_html(a, b):
    a = a.rstrip()
    if re.search(r"[A-Za-z]-$", a) and not a.endswith(" -"):
        return a + b.lstrip()  # kata terpotong: "undang-" + "undang"
    return a + " " + b.lstrip()


def plain(html):
    return re.sub(r"<[^>]+>", "", html)


def cell(text):
    text = re.sub(r"(?<=[A-Za-z])-\n(?=[a-z])", "-", text or "")  # "Kata-\nkata" -> "Kata-kata"
    return " ".join(text.replace("​", "").split())


def page_items(page):
    """Hasilkan item (y, jenis, data) untuk satu halaman: baris teks dan tabel."""
    tables = page.find_tables().tables
    boxes = [pymupdf.Rect(t.bbox) for t in tables]
    items = []
    for t, box in zip(tables, boxes):
        rows = [[cell(c) for c in row] for row in t.extract()]
        rows = [r for r in rows if any(r)]
        if rows:
            items.append((box.y0, "table", rows))

    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip() or s["text"] == " "]
            if not spans:
                continue
            size = max(s["size"] for s in spans)
            if size < 8:  # header dan footer halaman
                continue
            r = pymupdf.Rect(line["bbox"])
            if any(box.intersects(r) and box.contains(r.tl + (1, 1)) for box in boxes):
                continue
            items.append((r.y0, "line", {"x": r.x0, "y": r.y0, "y1": r.y1, "size": size, "spans": spans}))
    items.sort(key=lambda it: it[0])
    return items


def parse(pdf_path):
    doc = pymupdf.open(pdf_path)
    title_parts, sections = [], []
    cur_section = None
    blocks = None  # blok milik bagian aktif
    para = None    # paragraf/butir yang sedang dibangun
    last_y = None

    def new_section(title):
        nonlocal cur_section, blocks, para
        cur_section = {"judul": title, "blok": []}
        sections.append(cur_section)
        blocks = cur_section["blok"]
        para = None

    for page in doc:
        last_y = None
        for _, kind, data in page_items(page):
            if kind == "table":
                prev = blocks[-1] if blocks else None
                rows = data
                # Tabel yang bersambung ke halaman berikutnya (header berulang)
                if prev and prev["t"] == "table" and prev["rows"][0] == rows[0]:
                    prev["rows"].extend(rows[1:])
                elif prev and prev["t"] == "table" and para is None and len(rows[0]) == len(prev["rows"][0]) and last_y is None:
                    prev["rows"].extend(rows)
                else:
                    blocks.append({"t": "table", "rows": rows})
                para = None
                last_y = None
                continue

            size, spans = data["size"], data["spans"]
            html = spans_html(spans).strip()
            text = plain(html)

            if size >= 20:
                title_parts.append(text)
                continue
            if size >= 15:  # judul bagian
                if cur_section and not cur_section["blok"] and last_y is not None and data["y"] - last_y < 30:
                    cur_section["judul"] += " " + text  # judul dua baris
                else:
                    new_section(text)
                last_y = data["y1"]
                continue
            if cur_section is None:
                new_section("Pendahuluan")
            if size >= 13:  # subjudul
                blocks.append({"t": "h", "text": text})
                para = None
                last_y = data["y1"]
                continue
            if re.match(r"^\d{4}-\d{2}-\d{2}", text):  # baris tanggal & penulis
                continue

            indented = data["x"] - 54 > 8
            gap = None if last_y is None else data["y"] - last_y
            last_y = data["y1"]

            numbered = RE_NUMBERED.match(text)
            starts_new = (
                para is None
                or (gap is not None and gap > 4.5)
                or (numbered and not indented and para.get("t") != "p")
                or (gap is None and re.search(r"[.:;!?)]$", plain(para["html"])) and not text[:1].islower())
            )
            if not starts_new and para is not None:
                para["html"] = join_html(para["html"], html)
                continue

            if indented:
                para = {"t": "li", "html": html}
            elif numbered:
                para = {"t": "ol", "html": html[numbered.end():] if html.startswith(numbered.group(0)) else html,
                        "n": int(numbered.group(1))}
            else:
                para = {"t": "p", "html": html}
            blocks.append(para)

    # Kelompokkan butir berurutan menjadi daftar
    sections = [sec for sec in sections if sec["blok"]]
    for sec in sections:
        for b in sec["blok"]:
            if "html" in b:
                b["html"] = re.sub(r"</strong>(\s?)<strong>", r"\1", b["html"])
        grouped = []
        for b in sec["blok"]:
            if b["t"] in ("li", "ol"):
                kind = "ul" if b["t"] == "li" else "ol"
                if grouped and grouped[-1]["t"] == kind:
                    grouped[-1]["items"].append(b["html"])
                else:
                    grouped.append({"t": kind, "items": [b["html"]]})
            elif b["t"] == "p":
                grouped.append({"t": "p", "html": b["html"]})
            else:
                grouped.append(b)
        sec["blok"] = grouped

    title = " ".join(title_parts).strip()
    return {"judul": title, "bagian": sections}


def main():
    pdfs = sorted(ROOT.glob("Materi*.pdf"))
    if not pdfs:
        sys.exit("File PDF materi (Materi*.pdf) tidak ditemukan")
    data = parse(pdfs[0])
    js = "window.MATERI = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(js, encoding="utf-8")
    print(f"{pdfs[0].name}: {len(data['bagian'])} bagian -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

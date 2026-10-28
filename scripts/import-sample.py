"""Convert the supplied dummy workbook to the fields needed by the rehearsal."""
import collections
import json
import pathlib
import xml.etree.ElementTree as ET
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(root / "samp.xlsx") as workbook:
    strings = ["".join(node.itertext()) for node in ET.fromstring(workbook.read("xl/sharedStrings.xml"))]
    rows = []
    for row in ET.fromstring(workbook.read("xl/worksheets/sheet1.xml")).findall(".//s:sheetData/s:row", ns):
        cells = {}
        for cell in row:
            value = cell.find("s:v", ns)
            value = value.text if value is not None else ""
            cells["".join(filter(str.isalpha, cell.get("r")))] = strings[int(value)] if cell.get("t") == "s" else value
        rows.append(cells)
    assert [rows[0].get(k) for k in ("A", "B", "D", "G", "H", "J")] == ["Ticket ID", "Name", "Model", "Flagged", "Excluded", "Branch"]
    entries = []
    for row in rows[1:]:
        if not any(row.values()):
            continue
        assert row.get("G") in ("Yes", "No") and row.get("H") in ("Yes", "No"), "Review unknown eligibility flags"
        if row["H"] == "Yes":
            continue
        assert row["G"] == "No", "Review flagged entries before importing"
        entry = dict(zip(("entry_id", "name", "vehicle", "showroom"), (row.get(k, "").strip() for k in ("A", "B", "D", "J"))))
        assert all(entry.values()), "Missing draw field"
        entries.append(entry)
    assert len({entry["entry_id"] for entry in entries}) == len(entries), "Duplicate ticket ID"
    counts = collections.Counter(entry["showroom"] for entry in entries)
    assert counts and min(counts.values()) >= 3, "Each branch needs three entries"
    (root / "lib/sample-entries.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"Imported {len(entries)} eligible entries: {dict(counts)}")

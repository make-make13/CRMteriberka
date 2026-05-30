import sqlite3
import json
import pathlib

db_path = pathlib.Path("data/crm.sqlite")
out_path = pathlib.Path("saved_pdfme_templates/cc_contract_pdfme.json")

out_path.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(db_path)
try:
    row = conn.execute(
        "SELECT template_json FROM pdf_templates WHERE id = ?",
        ("cc_contract_pdfme",)
    ).fetchone()

    if not row:
        raise RuntimeError("Шаблон cc_contract_pdfme не найден в data/crm.sqlite")

    data = json.loads(row[0])
    out_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"exported: {out_path}")
finally:
    conn.close()

# migration_add_doc_type.py
# ============================================================
# One-time migration script: adds doc_type and language columns
# to the existing 'documents' table.
#
# Safe to run on a live database — uses IF NOT EXISTS so it is
# idempotent and will not fail if the columns already exist.
#
# Usage:
#   python migration_add_doc_type.py
# ============================================================

import os
import sys

# Support both SQLite (dev) and PostgreSQL (prod) based on the env
DATABASE_URL = os.getenv(
    "SYNC_DATABASE_URL",
    "sqlite:///./quiz_app.db"
)

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    import sqlite3
    db_path = DATABASE_URL.replace("sqlite:///", "")
    print(f"[Migration] Connecting to SQLite: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # SQLite does not support IF NOT EXISTS for ADD COLUMN, so we check first
    cursor.execute("PRAGMA table_info(documents)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    if "doc_type" not in existing_columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN doc_type VARCHAR")
        print("[Migration] [OK] Added column: documents.doc_type")
    else:
        print("[Migration] [OK] Column already exists: documents.doc_type (skipped)")

    if "language" not in existing_columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN language VARCHAR")
        print("[Migration] [OK] Added column: documents.language")
    else:
        print("[Migration] [OK] Column already exists: documents.language (skipped)")

    conn.commit()
    conn.close()

else:
    # PostgreSQL path
    import psycopg2
    from urllib.parse import urlparse

    print(f"[Migration] Connecting to PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://"))
    conn.autocommit = True
    cursor = conn.cursor()

    cursor.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR"
    )
    print("[Migration] [OK] Added column (if not exists): documents.doc_type")

    cursor.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS language VARCHAR"
    )
    print("[Migration] [OK] Added column (if not exists): documents.language")

    cursor.close()
    conn.close()

print("\n[Migration] Done. Existing rows will have NULL for both new columns.")
print("           NULL is handled gracefully — the API returns 'unknown' for these.")

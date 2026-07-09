from core.database import sync_engine
from sqlalchemy import text

def run_migration():
    print("Running migration on PostgreSQL...")
    with sync_engine.connect() as conn:
        try:
            # Note: in postgres JSONB is native
            conn.execute(text("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS model_name VARCHAR;"))
            conn.execute(text("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS generation_metrics JSONB;"))
            conn.commit()
            print("Migration complete. Columns added.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    run_migration()

import asyncio
import sys
import os

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.ext.asyncio import create_async_engine
from core.config import settings

async def alter_table():
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        from sqlalchemy import text
        try:
            await conn.execute(text("ALTER TABLE documents ADD COLUMN declared_language VARCHAR;"))
            print("Column 'declared_language' added successfully.")
        except Exception as e:
            print(f"Error (column might already exist): {e}")

if __name__ == "__main__":
    asyncio.run(alter_table())

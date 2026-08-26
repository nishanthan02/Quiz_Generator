import os
import sys

# Add project root to sys.path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.qdrant_setup import get_qdrant_client, ensure_collection_exists
from core.config import settings

def reset_qdrant_collection():
    client = get_qdrant_client()
    collection_name = settings.qdrant_collection_name
    
    print(f"Checking if collection '{collection_name}' exists...")
    try:
        client.get_collection(collection_name)
        print(f"Collection '{collection_name}' exists. Deleting it...")
        client.delete_collection(collection_name)
        print(f"Collection '{collection_name}' deleted successfully.")
    except Exception as e:
        print(f"Collection '{collection_name}' does not exist or could not be fetched: {e}")
        
    print(f"Creating fresh collection '{collection_name}'...")
    ensure_collection_exists()
    print("Collection created successfully with new parameters.")

if __name__ == "__main__":
    reset_qdrant_collection()

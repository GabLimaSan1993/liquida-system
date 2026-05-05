from supabase import create_client
from src.config import SUPABASE_URL, SUPABASE_KEY


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL ou SUPABASE_KEY não configurados no arquivo .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)
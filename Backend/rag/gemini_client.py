import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY not found")

# Generation client (v1beta) — needed for gemini-2.5-flash-lite
client = genai.Client(api_key=api_key)

# Embedding client (v1) — needed for text-embedding-004
# text-embedding-004 is not available on v1beta
embed_client = genai.Client(
    api_key=api_key,
    http_options={"api_version": "v1"},
)
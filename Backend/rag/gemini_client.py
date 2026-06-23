import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError(
        "GEMINI_API_KEY not found"
    )

# Single client – default v1beta works for both
# gemini-embedding-2 (embeddings) and gemini-2.5-flash-lite (generation)
client = genai.Client(
    api_key=api_key
)
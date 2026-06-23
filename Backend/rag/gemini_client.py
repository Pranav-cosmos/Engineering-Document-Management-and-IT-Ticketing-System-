import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError(
        "GEMINI_API_KEY not found"
    )

# Generation client — uses v1beta (required for gemini-2.5-flash-lite)
client = genai.Client(
    api_key=api_key
)

# Embedding client — uses v1 (required for text-embedding-004 with task_type)
embed_client = genai.Client(
    api_key=api_key,
    http_options={"api_version": "v1"},
)
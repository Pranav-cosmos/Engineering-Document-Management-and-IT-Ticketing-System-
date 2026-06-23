import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY not found")

# Default client (v1beta) — used for text generation (gemini-2.5-flash-lite)
client = genai.Client(api_key=api_key)
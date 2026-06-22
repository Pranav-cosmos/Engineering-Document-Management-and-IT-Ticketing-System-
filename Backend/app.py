from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()   # must be before any other local imports that read env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

print("APP START")

from rag.generator import answer_question

print("GENERATOR LOADED")


# ── Lifespan: build FAISS index once at startup ──────────────────────────────

ml_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model
    print("[startup] Loading ML model …")
    ml_model = joblib.load(os.path.join(os.path.dirname(__file__), "models", "category_pipeline.pkl"))
    print("[startup] ML model loaded successfully!")
    yield   # server runs here
    # (shutdown cleanup can go here if needed)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="EDMS AI Service", lifespan=lifespan)

# Read allowed origins from env; fall back to * for local dev
frontend_url = os.getenv("FRONTEND_URL", "*")
origins = [frontend_url] if frontend_url != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────────

class TicketRequest(BaseModel):
    title: str
    description: str


class ChatRequest(BaseModel):
    question: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "EDMS AI Service Running"}


@app.post("/predict-category", tags=["Ticket AI"])
def predict_category(ticket: TicketRequest):
    text = f"{ticket.title} {ticket.description}"
    prediction = ml_model.predict([text])[0]
    probabilities = ml_model.predict_proba([text])[0]
    confidence = float(max(probabilities))
    return {"category": prediction, "confidence": round(confidence, 2)}


@app.post("/chat", tags=["RAG Chat"])
def chat(data: ChatRequest):
    return answer_question(data.question)


@app.post("/index-documents", tags=["RAG Chat"])
def index_documents():
    """
    Re-scans Supabase and rebuilds the in-memory FAISS index.
    Call this after uploading new documents so the bot picks them up
    without restarting the server.
    """
    from rag.retriever import build_index

    build_index()
    return {"status": "ok", "message": "Index rebuilt from Supabase documents."}
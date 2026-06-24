from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

print("APP START")

from rag.generator import answer_question
from rag.retriever import build_index, add_document, remove_document

print("MODULES LOADED")


# ── Lifespan ──────────────────────────────────────────────────────────────────

ml_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model

    print("[startup] Loading ML model ...")
    ml_model = joblib.load(
        os.path.join(os.path.dirname(__file__), "models", "category_pipeline.pkl")
    )
    print("[startup] ML model loaded.")

    # pgvector mode: embeddings are persisted in Supabase, nothing to build.
    build_index()
    print("[startup] Ready.")

    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="EDMS AI Service", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "*")
origins = [frontend_url] if frontend_url != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class TicketRequest(BaseModel):
    title: str
    description: str

class ChatRequest(BaseModel):
    question: str

class DocIdRequest(BaseModel):
    doc_id: str


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


@app.post("/index-document", tags=["RAG Chat"])
def index_document(data: DocIdRequest):
    """Embed a single document and store its chunks in Supabase pgvector."""
    result = add_document(data.doc_id)
    return {"status": "ok", **result}


@app.post("/remove-document", tags=["RAG Chat"])
def remove_document_endpoint(data: DocIdRequest):
    """Remove a single document's chunks from Supabase pgvector."""
    result = remove_document(data.doc_id)
    return {"status": "ok", **result}


@app.get("/test-rag", tags=["RAG Chat"])
def test_rag():
    """
    Diagnostic endpoint — hit this in a browser to test every step of
    the RAG pipeline and see exactly where it fails.
    """
    import traceback
    from supabase import create_client

    report = {}

    # 1. Check env vars
    report["env"] = {
        "GEMINI_API_KEY":           "SET" if os.getenv("GEMINI_API_KEY") else "MISSING",
        "SUPABASE_URL":             "SET" if os.getenv("SUPABASE_URL") else "MISSING",
        "SUPABASE_KEY":             "SET" if os.getenv("SUPABASE_KEY") else "MISSING",
        "SUPABASE_SERVICE_ROLE_KEY": "SET" if os.getenv("SUPABASE_SERVICE_ROLE_KEY") else "MISSING",
    }

    # 2. Check Supabase connection + document_chunks table
    try:
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", ""),
        )
        resp = sb.table("document_chunks").select("id", count="exact").limit(1).execute()
        report["supabase_table"] = {
            "status": "OK",
            "total_rows": resp.count,
            "sample": resp.data[:1] if resp.data else [],
        }
    except Exception as exc:
        report["supabase_table"] = {"status": "ERROR", "error": str(exc)}

    # 3. Test Gemini embedding
    try:
        from rag.embeddings import embed_query
        emb = embed_query("test query")
        report["embedding"] = {
            "status": "OK",
            "shape": list(emb.shape),
            "vector_dim": int(emb.shape[1]) if len(emb.shape) > 1 else int(emb.shape[0]),
        }
    except Exception as exc:
        report["embedding"] = {"status": "ERROR", "error": str(exc), "traceback": traceback.format_exc()}

    # 4. Test match_chunks RPC directly
    try:
        emb = embed_query("test")
        vector = emb[0].tolist()
        rpc_resp = sb.rpc(
            "match_chunks",
            {"query_embedding": vector, "match_count": 3, "filter_doc_id": None},
        ).execute()
        report["rpc_match_chunks"] = {
            "status": "OK",
            "rows_returned": len(rpc_resp.data or []),
            "sample_titles": [r.get("title", "") for r in (rpc_resp.data or [])[:3]],
        }
    except Exception as exc:
        report["rpc_match_chunks"] = {"status": "ERROR", "error": str(exc), "traceback": traceback.format_exc()}

    # 5. Test full search_documents pipeline
    try:
        from rag.retriever import search_documents
        results = search_documents("test query", top_k=3)
        report["search_documents"] = {
            "status": "OK",
            "results_count": len(results),
            "titles": [r.get("title", "") for r in results[:3]],
        }
    except Exception as exc:
        report["search_documents"] = {"status": "ERROR", "error": str(exc), "traceback": traceback.format_exc()}

    return report
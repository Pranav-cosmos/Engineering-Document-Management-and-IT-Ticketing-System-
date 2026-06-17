from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

from rag.generator import answer_question

app = FastAPI(
    title="EDMS AI Service"
)

model = joblib.load(
    "models/category_pipeline.pkl"
)

print("Model loaded successfully!")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TicketRequest(BaseModel):
    title: str
    description: str


class ChatRequest(BaseModel):
    question: str


@app.get("/")
def root():

    return {
        "message": "EDMS AI Service Running"
    }


@app.post(
    "/predict-category",
    tags=["Ticket AI"]
)
def predict_category(ticket: TicketRequest):

    text = (
        f"{ticket.title} "
        f"{ticket.description}"
    )

    prediction = model.predict(
        [text]
    )[0]

    probabilities = model.predict_proba(
        [text]
    )[0]

    confidence = float(
        max(probabilities)
    )

    return {
        "category": prediction,
        "confidence": round(
            confidence,
            2
        )
    }


@app.post(
    "/chat",
    tags=["RAG Chat"]
)
def chat(data: ChatRequest):

    return answer_question(
        data.question
    )
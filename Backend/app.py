from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

app = FastAPI(title="EDMS AI Service")

model = joblib.load(
    "models/category_pipeline.pkl"
)
print("Model loaded successfully!")

# Allow React frontend to call FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request schema
class TicketRequest(BaseModel):
    title: str
    description: str

# Health check
@app.get("/")
def root():
    return {
        "message": "AI Service Running"
    }

# Category prediction endpoint
@app.post("/predict-category")
def predict_category(ticket: TicketRequest):

    text = f"{ticket.title} {ticket.description}"

    prediction = model.predict([text])[0]

    probabilities = model.predict_proba([text])[0]

    confidence = float(max(probabilities))

    return {
        "category": prediction,
        "confidence": round(confidence, 2)
    }

# Priority prediction endpoint
@app.post("/predict-priority")
def predict_priority(ticket: TicketRequest):

    return {
        "priority": "High",
        "confidence": 0.89
    }   
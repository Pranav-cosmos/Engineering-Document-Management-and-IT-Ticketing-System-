from .retriever import search_documents
from .gemini_client import client


def answer_question(question: str) -> dict:
    answer = ""
    results = []

    try:
        results = search_documents(question, top_k=5)

        if not results:
            return {
                "answer": "No relevant information found in the uploaded documents.",
                "sources": []
            }

        # Build context block with document titles for attribution
        context_parts = []
        for item in results:
            title = item.get("title", "Unknown Document")
            context_parts.append(f"[Source: {title}]\n{item['chunk']}")
        context = "\n\n---\n\n".join(context_parts)

        prompt = f"""You are an Engineering Document Assistant for an EDMS (Engineering Document Management System).

Rules:
1. Answer ONLY from the provided context below.
2. Do not make up information.
3. If the answer is not in the context, say: "I could not find that information in the uploaded documents."
4. Where helpful, mention which document the information came from.
5. Make sure the Answers are presentable don't use symbols etc mantain human like writting and present in paragraph format not in bullet points or numbered lists unless needed.
Context:
{context}

Question:
{question}
"""

        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt
        )

        answer = response.text

    except Exception as e:
        answer = f"Error: {str(e)}"

    # Return serialisable sources (strip numpy floats, keep title)
    clean_sources = [
        {
            "chunk":    r.get("chunk", ""),
            "score":    round(float(r.get("score", 0)), 4),
            "title":    r.get("title", ""),
            "file_url": r.get("file_url", ""),
        }
        for r in results
    ]

    return {"answer": answer, "sources": clean_sources}
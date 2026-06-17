from retriever import search_documents
from gemini_client import client


def answer_question(question):

    answer = ""
    results = []

    try:

        results = search_documents(
            question,
            top_k=3
        )

        if not results:

            return {
                "answer": "No relevant information found.",
                "sources": []
            }

        context = "\n\n".join(
            [
                item["chunk"]
                for item in results
            ]
        )

        prompt = f"""
You are an Engineering Document Assistant.

Rules:
1. Answer only from the provided context.
2. Do not make up information.
3. If the answer is not found, say:
'I could not find that information in the uploaded documents.'

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

    return {
        "answer": answer,
        "sources": results
    }
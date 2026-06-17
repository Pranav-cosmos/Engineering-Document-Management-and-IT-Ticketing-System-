from generator import answer_question

response = answer_question(
    "What technical skills does the candidate have?"
)

print("\nANSWER:\n")
print(response["answer"])

print("\nSOURCES:\n")
for source in response["sources"]:
    print(source)
from langchain_text_splitters import RecursiveCharacterTextSplitter

def create_chunks(text):

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", " "]
    )
    
    chunks = splitter.split_text(text)
    print("Chunks created successfully!")
    return chunks
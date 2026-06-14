import os
import hashlib

from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams,
    Distance,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

import ollama

# ============================================================
# CONFIG
# ============================================================

REPO_PATH = "."
COLLECTION = "vscodeagent_repo_index"
QDRANT_URL = "http://192.168.176.1:6333"
MODEL = "bge-m3:latest"

client = QdrantClient(url=QDRANT_URL)

# ============================================================
# SKIP DIRECTORIES
# ============================================================

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    "dist",
    "build",

    # release artifacts
    "release",
    "linux-unpacked",

    # optional
    ".qdrant",
    ".ollama",
}

# ============================================================
# SKIP BINARY FILES
# ============================================================

SKIP_EXTENSIONS = {
    # images
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",

    # archives
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".rar",

    # binaries
    ".exe",
    ".dll",
    ".so",
    ".bin",
    ".AppImage",
    ".asar",
    ".pak",

    # fonts
    ".ttf",
    ".woff",
    ".woff2",

    # media
    ".mp3",
    ".wav",
    ".mp4",
    ".mov",
    ".avi",

    # models
    ".gguf",
    ".onnx",
    ".safetensors",
}

# ============================================================
# COLLECTION
# ============================================================

def init_collection(dim=1024):
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(
                size=dim,
                distance=Distance.COSINE,
            ),
        )

# ============================================================
# TEXT DETECTION
# ============================================================

def is_text_file(path):
    try:
        with open(path, "rb") as f:
            sample = f.read(4096)

        if b"\x00" in sample:
            return False

        sample.decode("utf-8")

        return True

    except Exception:
        return False

# ============================================================
# CHUNKING
# ============================================================

def chunk_text(text, chunk_size=1000):
    return [
        text[i:i + chunk_size]
        for i in range(0, len(text), chunk_size)
    ]

# ============================================================
# EMBEDDINGS
# ============================================================

def embed(text):
    response = ollama.embeddings(
        model=MODEL,
        prompt=text,
    )

    return response["embedding"]

# ============================================================
# STABLE IDS
# ============================================================

def chunk_id(path, chunk_no):
    return hashlib.md5(
        f"{path}:{chunk_no}".encode("utf-8")
    ).hexdigest()

# ============================================================
# DELETE OLD CHUNKS FOR FILE
# ============================================================

def remove_existing_file(path):
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="file",
                    match=MatchValue(value=path),
                )
            ]
        ),
    )

# ============================================================
# INDEX FILE
# ============================================================

def index_file(path):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

        if not text.strip():
            return

        chunks = chunk_text(text)

        remove_existing_file(path)

        points = []

        for i, chunk in enumerate(chunks):
            vector = embed(chunk)

            points.append(
                PointStruct(
                    id=chunk_id(path, i),
                    vector=vector,
                    payload={
                        "file": path,
                        "chunk": i,
                        "text": chunk,
                    },
                )
            )

        client.upsert(
            collection_name=COLLECTION,
            points=points,
        )

        print(
            f"Indexed: {path} ({len(chunks)} chunks)"
        )

    except Exception as e:
        print(f"Failed: {path}")
        print(e)

# ============================================================
# REPO SCAN
# ============================================================

def scan_repo():

    for root, dirs, files in os.walk(REPO_PATH):

        dirs[:] = [
            d for d in dirs
            if d not in SKIP_DIRS
        ]

        for file in files:

            full_path = os.path.join(root, file)

            _, ext = os.path.splitext(file)

            if ext in SKIP_EXTENSIONS:
                continue

            if not is_text_file(full_path):
                continue

            yield full_path

# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    init_collection()

    count = 0

    for file in scan_repo():
        index_file(file)
        count += 1

    print()
    print(f"Indexed {count} files")
    print("DONE")

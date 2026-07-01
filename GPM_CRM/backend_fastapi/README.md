FastAPI backend for GPM_CRM

To run locally (Python 3.10+):

1. Create a virtualenv and install requirements:
```
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

2. Start the app:
```
uvicorn main:app --reload --port 8000
```

3. Upload the XLSX via `POST /api/imports/upload` (multipart form file key `file`).

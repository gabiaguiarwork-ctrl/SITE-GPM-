from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Path as PathParam
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db
from .import_service import import_fileobj
from .lead_service import get_leads, get_lead_by_id, update_lead, get_kpi_summary
import uvicorn
from pathlib import Path

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    init_db()


@app.get('/api/health')
def health():
    return {"status": "ok"}


@app.post('/api/imports/upload')
async def upload_import(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail='Invalid file type')
    contents = await file.read()
    from io import BytesIO
    bio = BytesIO(contents)
    result = import_fileobj(bio, filename=file.filename)
    return {"status": "ok", "result": result}


@app.get('/api/leads')
def list_leads(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    funnel: str | None = Query(None),
    stage: str | None = Query(None),
    temperature: str | None = Query(None),
    owner: str | None = Query(None),
    q: str | None = Query(None)
):
    return get_leads(limit=limit, offset=offset, funnel=funnel, stage=stage, temperature=temperature, owner=owner, q=q)


@app.get('/api/leads/{lead_id}')
def get_lead(lead_id: int = PathParam(..., ge=1)):
    lead = get_lead_by_id(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail='Lead not found')
    return lead


@app.put('/api/leads/{lead_id}')
def replace_lead(lead_id: int = PathParam(..., ge=1), payload: dict = {}):
    lead = get_lead_by_id(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail='Lead not found')
    updated = update_lead(lead_id, payload)
    return updated


@app.get('/api/kpis')
def kpis():
    return get_kpi_summary()


@app.get('/api/kpis/summary')
def kpis_summary():
    summary = get_kpi_summary()
    return {
        'pipeline_total': summary['pipeline_total'],
        'deals_quentes': next((item for item in summary['by_temperature'] if item['temperature'] and item['temperature'].lower() == 'quente'), {'qty': 0, 'total': 0}),
        'deals_mornos': next((item for item in summary['by_temperature'] if item['temperature'] and item['temperature'].lower() == 'morno'), {'qty': 0, 'total': 0}),
        'deals_frios': next((item for item in summary['by_temperature'] if item['temperature'] and item['temperature'].lower() == 'frio'), {'qty': 0, 'total': 0}),
        'total_deals': summary['total_deals'],
        'by_unit': summary['by_unit'],
        'by_stage': summary['by_stage'],
        'top_opportunities': summary['top_opportunities']
    }


if __name__ == '__main__':
    uvicorn.run('backend_fastapi.main:app', host='0.0.0.0', port=8000, reload=True)

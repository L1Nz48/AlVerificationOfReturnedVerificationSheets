"""HTTP API (FastAPI) ครอบ Api เดิม — ให้เว็บ (React) เรียกผ่าน REST แทน pywebview js_api"""

from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .api import Api

app = FastAPI(title="AI Verification API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = Api()


class SettingsPatch(BaseModel):
    patch: dict = {}


class RunStart(BaseModel):
    operator: str = "officer"


class ConfirmBody(BaseModel):
    rows: Optional[list] = None
    operator: str = "officer"


class RejectBody(BaseModel):
    reason: str = ""
    operator: str = "officer"


@app.get("/api/ping")
def ping() -> dict:
    return api.ping()


@app.get("/api/settings")
def get_settings() -> dict:
    return api.get_settings()


@app.post("/api/settings")
def save_settings(body: SettingsPatch) -> dict:
    return api.save_settings(body.patch)


@app.post("/api/test-ai")
def test_ai() -> dict:
    return api.test_ai()


@app.post("/api/upload")
async def upload(files: List[UploadFile]) -> dict:
    dst_dir = Path(api.settings.source_dir)
    dst_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for f in files:
        dst = dst_dir / Path(f.filename).name
        dst.write_bytes(await f.read())
        saved.append(dst.name)
    result = api.scan_source()
    result["uploaded"] = saved
    return result


@app.get("/api/scan-source")
def scan_source() -> dict:
    return api.scan_source()


@app.post("/api/runs/start")
def start_run(body: RunStart) -> dict:
    return api.start_run(operator=body.operator)


@app.post("/api/runs/stop")
def stop_run() -> dict:
    return api.stop_run()


@app.get("/api/poll")
def poll() -> dict:
    return api.poll()


@app.get("/api/queue")
def get_queue() -> List[dict]:
    return api.get_queue()


@app.post("/api/documents/{doc_id}/confirm")
def confirm_case(doc_id: int, body: ConfirmBody) -> dict:
    return api.confirm_case(doc_id, body.rows, body.operator)


@app.post("/api/documents/{doc_id}/reject")
def reject_case(doc_id: int, body: RejectBody) -> dict:
    return api.reject_case(doc_id, body.reason, body.operator)


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: int) -> Optional[dict]:
    return api.get_document(doc_id)


@app.get("/api/runs")
def get_runs(limit: int = 20) -> List[dict]:
    return api.get_runs(limit)


@app.get("/api/runs/{run_id}/documents")
def get_run_documents(run_id: int) -> List[dict]:
    return api.get_run_documents(run_id)


@app.get("/api/runs/{run_id}/audit")
def get_audit(run_id: int) -> List[dict]:
    return api.get_audit(run_id)


@app.get("/api/dashboard")
def get_dashboard() -> dict:
    return api.get_dashboard()

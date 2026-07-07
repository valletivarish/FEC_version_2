from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class Reading(BaseModel):
    ts: str
    value: float


class Batch(BaseModel):
    sensor_type: str
    site_id: str = "container-1"
    unit: str = ""
    readings: list[Reading]


@router.post("/ingest", status_code=202)
async def ingest(batch: Batch, request: Request):
    # 202 Accepted: the batch is only queued here, not yet aggregated. The
    # background inbox_consumer task (see app.py) absorbs it into the
    # current window asynchronously.
    await request.app.state.inbox.put(batch)
    return {"accepted": len(batch.readings)}

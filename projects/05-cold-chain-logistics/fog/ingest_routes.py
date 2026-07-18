from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class SensorSample(BaseModel):
    ts: str
    value: float


class IntakeBatch(BaseModel):
    sensor_type: str
    site_id: str = "container-1"
    unit: str = ""
    readings: list[SensorSample]


@router.post("/ingest", status_code=202)
async def ingest(batch: IntakeBatch, request: Request):
    # 202: the batch is only queued here; intake_worker absorbs it into the open window later.
    await request.app.state.inbox.put(batch)
    return {"accepted": len(batch.readings)}

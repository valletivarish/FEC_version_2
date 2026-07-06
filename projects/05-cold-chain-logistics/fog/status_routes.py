from fastapi import APIRouter

from alerts import THRESHOLD_DESCRIPTIONS

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/thresholds")
async def thresholds():
    return {reading_type: list(rules) for reading_type, rules in THRESHOLD_DESCRIPTIONS.items()}

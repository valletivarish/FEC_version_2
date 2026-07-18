from fastapi import APIRouter

from alerts import EXCURSION_RULES

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/thresholds")
async def thresholds():
    # Exposes the real excursion rules so the numeric thresholds live in one place.
    return {reading_type: list(rules) for reading_type, rules in EXCURSION_RULES.items()}

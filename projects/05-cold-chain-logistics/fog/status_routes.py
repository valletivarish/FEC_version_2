from fastapi import APIRouter

from alerts import THRESHOLD_DESCRIPTIONS

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/thresholds")
async def thresholds():
    # Exposes the real exception rules (see alerts.THRESHOLD_DESCRIPTIONS) to
    # any API consumer, including the dashboard, so the numeric thresholds
    # live in exactly one place rather than being duplicated in the UI layer.
    return {reading_type: list(rules) for reading_type, rules in THRESHOLD_DESCRIPTIONS.items()}

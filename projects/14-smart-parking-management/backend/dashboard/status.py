"""Per-lot occupancy status badge: a plain 4-tier text/colour badge derived
from this window's occupancy percentage and active alert count.

Deliberately independent of fog's alert thresholds (fog/alerts.py) -- a lot
can drift from "normal" through "busy" to "near_full" well before its
occupied_spaces window average ever crosses 270 and trips
near_full_capacity, the same "earlier, graded signal" idea as
12-smart-building-energy's letter-grade efficiency badge, but as a 4-tier
occupancy status instead of a 5-tier A-F grade, and with any active alert
forcing the badge straight to "alert" regardless of the raw percentage.
"""

OCCUPANCY_BUSY_PCT = 75.0
OCCUPANCY_NEAR_FULL_PCT = 90.0


def occupancy_pct(occupied, capacity):
    if capacity <= 0:
        return 0.0
    return round(100.0 * occupied / capacity, 1)


def lot_status(pct, alert_count):
    if alert_count > 0:
        return "alert"
    if pct >= OCCUPANCY_NEAR_FULL_PCT:
        return "near_full"
    if pct >= OCCUPANCY_BUSY_PCT:
        return "busy"
    return "normal"

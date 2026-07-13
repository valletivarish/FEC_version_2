"""Per-lot 4-tier occupancy badge (normal/busy/near_full/alert), computed independently of fog/alerts.py's thresholds, with any active alert forcing "alert" regardless of percentage."""

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

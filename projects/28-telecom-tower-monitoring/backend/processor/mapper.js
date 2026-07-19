// Reshape a fog window into a DynamoDB item. The sort key leads with site_id so
// a single signal partition can be range-scanned per site with begins_with.
function toItem(window) {
  return {
    sensor_type: window.sensor_type,
    sort_key: `${window.site_id}#${window.window_end}`,
    site_id: window.site_id,
    unit: window.unit,
    window_start: window.window_start,
    window_end: window.window_end,
    count: window.count,
    min: window.min,
    max: window.max,
    mean: window.mean,
    last: window.last,
    spread: window.spread,
    alerts: Array.isArray(window.alerts) ? window.alerts : [],
  };
}

export { toItem };

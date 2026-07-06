import os
import sys
import time

import boto3
from boto3.dynamodb.conditions import Key

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4569")
REGION = os.getenv("AWS_REGION", "eu-west-1")
TABLE_NAME = os.getenv("TABLE_NAME", "fsc-readings")

METRIC_TYPES = ["vehicle_count", "air_quality_pm25", "noise_level", "parking_occupancy", "ambient_light"]


def main():
    deadline = time.monotonic() + float(os.getenv("VERIFY_TIMEOUT", "90"))
    table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)

    seen = set()
    while time.monotonic() < deadline and len(seen) < len(METRIC_TYPES):
        for metric in METRIC_TYPES:
            if metric in seen:
                continue
            resp = table.query(
                KeyConditionExpression=Key("sensor_type").eq(metric),
                Limit=1,
            )
            if resp.get("Items"):
                seen.add(metric)
                print(f"  ok: {metric}")
        if len(seen) < len(METRIC_TYPES):
            time.sleep(3)

    missing = [m for m in METRIC_TYPES if m not in seen]
    if missing:
        print(f"FAILED: no records for {missing}")
        sys.exit(1)
    print(f"PASSED: all {len(METRIC_TYPES)} metric types have records in {TABLE_NAME}")


if __name__ == "__main__":
    main()

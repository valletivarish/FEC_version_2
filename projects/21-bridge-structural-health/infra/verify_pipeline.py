"""End-to-end pipeline check against the LocalStack profile.

Polls DynamoDB directly for at least one item per sensor type, on the
assumption that if every type has landed a row the whole chain -- sensors,
fog node, SQS, and the ingestion Lambda -- is working. The default endpoint
and region below are LocalStack's; the live AWS deployment is confirmed
separately, by hitting the deployed dashboard API's own /api/health route
rather than querying DynamoDB directly (see readme.txt).
"""

import os
import sys
import time

import boto3
from boto3.dynamodb.conditions import Key

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4586")
REGION = os.getenv("AWS_REGION", "eu-west-1")
TABLE_NAME = os.getenv("TABLE_NAME", "bshm-readings")

SENSOR_TYPES = [
    "strain_microstrain",
    "deck_vibration_mms",
    "tilt_angle_deg",
    "traffic_load_tonnes",
    "expansion_joint_mm",
]


def main():
    deadline = time.monotonic() + float(os.getenv("VERIFY_TIMEOUT", "90"))
    table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)

    seen = set()
    while time.monotonic() < deadline and len(seen) < len(SENSOR_TYPES):
        for sensor_type in SENSOR_TYPES:
            if sensor_type in seen:
                continue
            resp = table.query(
                KeyConditionExpression=Key("sensor_type").eq(sensor_type),
                Limit=1,
            )
            if resp.get("Items"):
                seen.add(sensor_type)
                print(f"  ok: {sensor_type}")
        if len(seen) < len(SENSOR_TYPES):
            time.sleep(3)

    missing = [s for s in SENSOR_TYPES if s not in seen]
    if missing:
        print(f"FAILED: no records for {missing}")
        sys.exit(1)
    print(f"PASSED: all {len(SENSOR_TYPES)} sensor types have records in {TABLE_NAME}")


if __name__ == "__main__":
    main()

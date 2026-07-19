"""End-to-end local check: poll DynamoDB until every flood signal has at least one stored window."""
import os
import sys
import time

import boto3
from boto3.dynamodb.conditions import Key

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4579")
REGION = os.getenv("AWS_REGION", "eu-west-1")
TABLE = os.getenv("TABLE_NAME", "rfw-readings")
TIMEOUT = int(os.getenv("VERIFY_TIMEOUT", "90"))

SIGNALS = ["river_level_m", "rainfall_mmph", "flow_velocity_ms", "soil_moisture_pct", "turbidity_ntu"]

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION,
                        aws_access_key_id="test", aws_secret_access_key="test").Table(TABLE)


def _stored_signals():
    found = set()
    for signal in SIGNALS:
        response = _table.query(KeyConditionExpression=Key("sensor_type").eq(signal), Limit=1)
        if response["Items"]:
            found.add(signal)
    return found


def main():
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        found = _stored_signals()
        print(f"stored signals: {sorted(found)}", flush=True)
        if len(found) == len(SIGNALS):
            print("PASS: every signal reached DynamoDB", flush=True)
            return
        time.sleep(3)
    print("FAIL: not all signals stored within the timeout", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()

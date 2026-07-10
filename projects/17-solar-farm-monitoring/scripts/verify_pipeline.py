import argparse
import os
import sys
import time
from enum import Enum, auto

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4582")
REGION = os.getenv("AWS_REGION", "eu-west-1")


class SensorType(Enum):
    IRRADIANCE_WM2 = "irradiance_wm2"
    PANEL_TEMP_C = "panel_temp_c"
    INVERTER_OUTPUT_KW = "inverter_output_kw"
    DC_VOLTAGE_V = "dc_voltage_v"
    SOILING_INDEX_PCT = "soiling_index_pct"


class SightingState(Enum):
    PENDING = auto()
    CONFIRMED = auto()


def has_records(client, table_name, sensor_type):
    resp = client.query(
        TableName=table_name,
        KeyConditionExpression="sensor_type = :st",
        ExpressionAttributeValues={":st": {"S": sensor_type}},
        Limit=1,
    )
    return bool(resp.get("Items"))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Poll DynamoDB until every sensor type has landed at least one row.")
    parser.add_argument("--table", default=os.getenv("TABLE_NAME", "sfm-readings"))
    parser.add_argument("--timeout", type=float, default=float(os.getenv("VERIFY_TIMEOUT", "90")))
    parser.add_argument("--poll-interval", type=float, default=float(os.getenv("VERIFY_POLL_INTERVAL", "3")))
    return parser.parse_args(argv)


def poll_until_seen(client, table_name, deadline, poll_interval):
    """Repeatedly re-check every sensor type; returns {SensorType: SightingState} once done or timed out."""
    states = {sensor_type: SightingState.PENDING for sensor_type in SensorType}

    while True:
        for sensor_type, state in states.items():
            if state is SightingState.CONFIRMED:
                continue
            if has_records(client, table_name, sensor_type.value):
                states[sensor_type] = SightingState.CONFIRMED
                print(f"  ok: {sensor_type.value}")

        all_confirmed = all(state is SightingState.CONFIRMED for state in states.values())
        timed_out = time.monotonic() >= deadline
        if all_confirmed or timed_out:
            break
        time.sleep(poll_interval)

    return {sensor_type.value: (state is SightingState.CONFIRMED) for sensor_type, state in states.items()}


def main(argv=None):
    args = parse_args(argv)
    deadline = time.monotonic() + args.timeout
    client = boto3.client("dynamodb", endpoint_url=ENDPOINT, region_name=REGION)

    found = poll_until_seen(client, args.table, deadline, args.poll_interval)

    missing = sorted(rt for rt, ok in found.items() if not ok)
    if missing:
        print(f"FAILED: no records for {missing}")
        sys.exit(1)
    print(f"PASSED: all {len(SensorType)} sensor types have records in {args.table}")


if __name__ == "__main__":
    main()

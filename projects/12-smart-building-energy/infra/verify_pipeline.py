import argparse
import os
import sys
import time
from enum import Enum, auto

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4577")
REGION = os.getenv("AWS_REGION", "eu-west-1")


class SensorType(Enum):
    ENERGY_CONSUMPTION_KW = "energy_consumption_kw"
    CO2_PPM = "co2_ppm"
    OCCUPANCY_COUNT = "occupancy_count"
    HVAC_TEMP_C = "hvac_temp_c"
    WATER_USAGE_LPM = "water_usage_lpm"


class LandingState(Enum):
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
    parser.add_argument("--table", default=os.getenv("TABLE_NAME", "sbe-readings"))
    parser.add_argument("--timeout", type=float, default=float(os.getenv("VERIFY_TIMEOUT", "90")))
    parser.add_argument("--poll-interval", type=float, default=float(os.getenv("VERIFY_POLL_INTERVAL", "3")))
    return parser.parse_args(argv)


def poll_until_seen(client, table_name, deadline, poll_interval):
    """Repeatedly re-check every sensor type; returns {SensorType: LandingState} once done or timed out."""
    states = {sensor_type: LandingState.PENDING for sensor_type in SensorType}

    while True:
        for sensor_type, state in states.items():
            if state is LandingState.CONFIRMED:
                continue
            if has_records(client, table_name, sensor_type.value):
                states[sensor_type] = LandingState.CONFIRMED
                print(f"  ok: {sensor_type.value}")

        all_confirmed = all(state is LandingState.CONFIRMED for state in states.values())
        timed_out = time.monotonic() >= deadline
        if all_confirmed or timed_out:
            break
        time.sleep(poll_interval)

    return {sensor_type.value: (state is LandingState.CONFIRMED) for sensor_type, state in states.items()}


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

import argparse
import os
import sys
import time
from enum import Enum, auto

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4570")
REGION = os.getenv("AWS_REGION", "eu-west-1")


class ReadingKind(Enum):
    STORAGE_TEMPERATURE = "storage_temperature"
    HUMIDITY = "humidity"
    DOOR_OPEN_SECONDS = "door_open_seconds"
    SHOCK_VIBRATION = "shock_vibration"
    CO2_LEVEL = "co2_level"


class ArrivalState(Enum):
    AWAITED = auto()
    LANDED = auto()


def has_records(client, table_name, reading_type):
    resp = client.query(
        TableName=table_name,
        KeyConditionExpression="sensor_type = :st",
        ExpressionAttributeValues={":st": {"S": reading_type}},
        Limit=1,
    )
    return bool(resp.get("Items"))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Poll DynamoDB until every reading type has landed at least one row.")
    parser.add_argument("--table", default=os.getenv("TABLE_NAME", "fcl-readings"))
    parser.add_argument("--timeout", type=float, default=float(os.getenv("VERIFY_TIMEOUT", "90")))
    parser.add_argument("--poll-interval", type=float, default=float(os.getenv("VERIFY_POLL_INTERVAL", "3")))
    return parser.parse_args(argv)


def poll_until_landed(client, table_name, deadline, poll_interval):
    """Re-check every reading type; return {ReadingKind: ArrivalState} once all landed or timed out."""
    states = {reading_kind: ArrivalState.AWAITED for reading_kind in ReadingKind}

    while True:
        for reading_kind, state in states.items():
            if state is ArrivalState.LANDED:
                continue
            if has_records(client, table_name, reading_kind.value):
                states[reading_kind] = ArrivalState.LANDED
                print(f"  ok: {reading_kind.value}")

        all_landed = all(state is ArrivalState.LANDED for state in states.values())
        timed_out = time.monotonic() >= deadline
        if all_landed or timed_out:
            break
        time.sleep(poll_interval)

    return {reading_kind.value: (state is ArrivalState.LANDED) for reading_kind, state in states.items()}


def main(argv=None):
    args = parse_args(argv)
    deadline = time.monotonic() + args.timeout
    client = boto3.client("dynamodb", endpoint_url=ENDPOINT, region_name=REGION)

    found = poll_until_landed(client, args.table, deadline, args.poll_interval)

    missing = sorted(rt for rt, ok in found.items() if not ok)
    if missing:
        print(f"FAILED: no records for {missing}")
        sys.exit(1)
    print(f"PASSED: all {len(ReadingKind)} reading types have records in {args.table}")


if __name__ == "__main__":
    main()

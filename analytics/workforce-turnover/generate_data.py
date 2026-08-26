"""Build the public Workforce Turnover Analytics demo dataset.

The generator is deterministic and produces aggregate fictional workforce events.
It never reads an input workbook, database, employee file, or environment secret.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from datetime import date
from pathlib import Path


SEED = 410225
START_MONTH = date(2024, 1, 1)
MONTH_COUNT = 24
REGIONS = ("North", "Central", "Coastal", "West")
DEPARTMENTS = ("Operations", "Sales", "Technology", "Customer Experience", "Finance")
CONTRACT_TYPES = ("Full-time", "Part-time")
EXIT_REASONS = (
    "Career change",
    "Compensation",
    "Relocation",
    "Performance",
    "Retirement",
    "Other",
)


def month_key(offset: int) -> str:
    absolute = (START_MONTH.year * 12 + START_MONTH.month - 1) + offset
    return f"{absolute // 12:04d}-{absolute % 12 + 1:02d}"


def allocate(total: int, weights: list[float], rng: random.Random) -> list[int]:
    """Allocate fictional exit events across reasons with deterministic sampling."""
    result = [0] * len(weights)
    for index in rng.choices(range(len(weights)), weights=weights, k=total):
        result[index] += 1
    return result


def build_dataset() -> dict:
    rng = random.Random(SEED)
    reason_rng = random.Random(SEED + 1)
    monthly: list[dict] = []
    exit_reasons: list[dict] = []

    department_size = {
        "Operations": 210,
        "Sales": 120,
        "Technology": 75,
        "Customer Experience": 145,
        "Finance": 50,
    }
    department_exit_rate = {
        "Operations": 0.018,
        "Sales": 0.024,
        "Technology": 0.014,
        "Customer Experience": 0.028,
        "Finance": 0.012,
    }
    region_factor = {"North": 0.84, "Central": 1.12, "Coastal": 1.03, "West": 0.94}
    region_exit_bias = {"North": 0.001, "Central": -0.001, "Coastal": 0.002, "West": 0.0}
    contract_factor = {"Full-time": 0.84, "Part-time": 0.16}
    reason_weights = {
        "Operations": [0.25, 0.21, 0.13, 0.22, 0.07, 0.12],
        "Sales": [0.31, 0.28, 0.12, 0.15, 0.04, 0.10],
        "Technology": [0.38, 0.24, 0.14, 0.10, 0.04, 0.10],
        "Customer Experience": [0.27, 0.29, 0.15, 0.17, 0.03, 0.09],
        "Finance": [0.26, 0.20, 0.12, 0.14, 0.18, 0.10],
    }

    headcount = {}
    for region in REGIONS:
        for department in DEPARTMENTS:
            for contract_type in CONTRACT_TYPES:
                initial = department_size[department] * region_factor[region] * contract_factor[contract_type]
                headcount[(region, department, contract_type)] = max(8, round(initial + rng.uniform(-5, 5)))

    for month_index in range(MONTH_COUNT):
        month = month_key(month_index)
        seasonal = math.sin((month_index % 12) / 12 * math.tau)
        for region in REGIONS:
            for department in DEPARTMENTS:
                for contract_type in CONTRACT_TYPES:
                    key = (region, department, contract_type)
                    start = headcount[key]
                    rate = department_exit_rate[department] + region_exit_bias[region]
                    if contract_type == "Part-time":
                        rate += 0.011
                    rate += rng.uniform(-0.004, 0.004)
                    exits = min(start - 2, max(0, round(start * rate)))

                    growth_bias = 0.004 + 0.004 * seasonal
                    planned_change = round(start * growth_bias + rng.uniform(-1.4, 1.8))
                    hires = max(0, exits + planned_change)
                    end = start + hires - exits
                    headcount[key] = end

                    monthly.append(
                        {
                            "month": month,
                            "region": region,
                            "department": department,
                            "contractType": contract_type,
                            "startHeadcount": start,
                            "hires": hires,
                            "exits": exits,
                            "endHeadcount": end,
                        }
                    )

                    counts = allocate(exits, reason_weights[department], reason_rng) if exits else [0] * len(EXIT_REASONS)
                    for reason, count in zip(EXIT_REASONS, counts):
                        if count:
                            exit_reasons.append(
                                {
                                    "month": month,
                                    "region": region,
                                    "department": department,
                                    "contractType": contract_type,
                                    "reason": reason,
                                    "count": count,
                                }
                            )

    return {
        "meta": {
            "title": "Workforce Turnover Analytics",
            "version": "1.0.0",
            "generatedBy": "analytics/workforce-turnover/generate_data.py",
            "generatedOn": "2026-08-25",
            "seed": SEED,
            "period": {"start": month_key(0), "end": month_key(MONTH_COUNT - 1)},
            "notice": "Entirely synthetic aggregate data. It is not derived from any employer or person.",
        },
        "privacy": {
            "granularity": "aggregate",
            "individualRecords": False,
            "directIdentifiers": [],
            "inputSources": [],
        },
        "dimensions": {
            "regions": list(REGIONS),
            "departments": list(DEPARTMENTS),
            "contractTypes": list(CONTRACT_TYPES),
            "exitReasons": list(EXIT_REASONS),
        },
        "methodology": {
            "turnoverRate": "exits / average(start headcount, end headcount) × 100",
            "aggregation": "Period turnover divides total exits by the sum of monthly average workforce.",
        },
        "monthly": monthly,
        "exitReasons": exit_reasons,
    }


def main() -> None:
    default_output = Path(__file__).parents[2] / "frontend" / "analytics" / "workforce-turnover" / "data.json"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(build_dataset(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote synthetic aggregate dataset to {args.output}")


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import math
import random
from collections import defaultdict
from datetime import date
from pathlib import Path


SEED = 410225
START_MONTH = date(2023, 1, 1)
MONTH_COUNT = 36
FORECAST_COUNT = 6
REGION_SITES = {
    "North": (("Aster", "Retail Network", "Northfield"), ("Cedar", "Retail Network", "Northfield")),
    "Central": (("Meridian", "Corporate Office", "Central City"), ("Junction", "Retail Network", "Central City")),
    "Coastal": (("Harbor", "Retail Network", "Coastal City"), ("Bayline", "Distribution", "Coastal City")),
}
DEPARTMENTS = ("Operations", "Sales", "Technology", "Customer Experience")
DIVISIONS = {
    "Operations": "Field Operations",
    "Sales": "Commercial",
    "Technology": "Digital",
    "Customer Experience": "Service",
}
CONTRACT_TYPES = ("Full-time", "Part-time")
GENDERS = ("Women", "Men")
ROLE_LEVELS = ("Associate", "Specialist", "Lead")
REASONS = (
    ("career", "Career development", "Growth", "voluntary"),
    ("compensation", "Compensation", "Reward", "voluntary"),
    ("relocation", "Relocation", "Personal", "voluntary"),
    ("work_design", "Work design", "Experience", "voluntary"),
    ("performance", "Performance", "Performance", "involuntary"),
    ("organisation", "Organisational change", "Organisation", "involuntary"),
)


def month_key(offset: int) -> str:
    absolute = START_MONTH.year * 12 + START_MONTH.month - 1 + offset
    return f"{absolute // 12:04d}-{absolute % 12 + 1:02d}"


def add_month(month: str, offset: int) -> str:
    year, value = (int(part) for part in month.split("-"))
    absolute = year * 12 + value - 1 + offset
    return f"{absolute // 12:04d}-{absolute % 12 + 1:02d}"


def weighted_choice(items: tuple, weights: list[float], rng: random.Random):
    return rng.choices(items, weights=weights, k=1)[0]


def build_workforce(rng: random.Random) -> tuple[list[dict], list[dict]]:
    monthly: list[dict] = []
    exits: list[dict] = []
    profile_number = 1
    department_size = {"Operations": 118, "Sales": 84, "Technology": 52, "Customer Experience": 74}
    department_rate = {"Operations": 0.017, "Sales": 0.023, "Technology": 0.013, "Customer Experience": 0.027}
    scope_factor = {"Retail Network": 1.0, "Corporate Office": 0.72, "Distribution": 0.82}
    region_factor = {"North": 0.92, "Central": 1.08, "Coastal": 1.0}
    contract_factor = {"Full-time": 0.84, "Part-time": 0.16}
    gender_factor = {"Women": 0.56, "Men": 0.44}
    role_factor = {"Associate": 0.64, "Specialist": 0.27, "Lead": 0.09}
    reason_weights = {
        "Operations": [0.25, 0.20, 0.12, 0.15, 0.18, 0.10],
        "Sales": [0.30, 0.27, 0.11, 0.15, 0.11, 0.06],
        "Technology": [0.38, 0.24, 0.12, 0.14, 0.08, 0.04],
        "Customer Experience": [0.27, 0.28, 0.13, 0.17, 0.10, 0.05],
    }
    headcount: dict[tuple, int] = {}
    for region, sites in REGION_SITES.items():
        for site, scope, city in sites:
            for department in DEPARTMENTS:
                for contract in CONTRACT_TYPES:
                    for gender in GENDERS:
                        for role in ROLE_LEVELS:
                            key = (region, site, scope, city, department, contract, gender, role)
                            initial = (
                                department_size[department]
                                * scope_factor[scope]
                                * region_factor[region]
                                * contract_factor[contract]
                                * gender_factor[gender]
                                * role_factor[role]
                            )
                            headcount[key] = max(2, round(initial + rng.uniform(-1.5, 1.5)))

    for month_index in range(MONTH_COUNT):
        month = month_key(month_index)
        season = math.sin((month_index % 12) / 12 * math.tau)
        for key in sorted(headcount):
            region, site, scope, city, department, contract, gender, role = key
            start = headcount[key]
            rate = department_rate[department]
            rate += {"North": 0.001, "Central": -0.001, "Coastal": 0.002}[region]
            rate += 0.010 if contract == "Part-time" else 0
            rate += 0.003 if role == "Associate" else -0.002 if role == "Lead" else 0
            rate += rng.uniform(-0.004, 0.004)
            exit_count = min(max(0, start - 1), max(0, round(start * rate + rng.random() * 0.35)))
            planned_change = round(start * (0.003 + season * 0.003) + rng.uniform(-0.65, 0.9))
            hires = max(0, exit_count + planned_change)
            end = start + hires - exit_count
            headcount[key] = end
            row = {
                "month": month,
                "scope": scope,
                "region": region,
                "site": site,
                "department": department,
                "division": DIVISIONS[department],
                "city": city,
                "gender": gender,
                "contractType": contract,
                "roleLevel": role,
                "startHeadcount": start,
                "hires": hires,
                "exits": exit_count,
                "endHeadcount": end,
            }
            monthly.append(row)
            for _ in range(exit_count):
                reason = weighted_choice(REASONS, reason_weights[department], rng)
                tenure_days = max(12, round(rng.lognormvariate(6.45 if role == "Associate" else 6.8, 0.72)))
                performance = weighted_choice(("Developing", "Solid", "Strong"), [0.17, 0.58, 0.25], rng)
                exit_type = reason[3]
                regrettable = exit_type == "voluntary" and performance == "Strong" and tenure_days >= 365
                exits.append(
                    {
                        "profileId": f"SIM-{profile_number:05d}",
                        "month": month,
                        "scope": scope,
                        "region": region,
                        "site": site,
                        "department": department,
                        "division": DIVISIONS[department],
                        "city": city,
                        "gender": gender,
                        "contractType": contract,
                        "roleLevel": role,
                        "tenureDays": tenure_days,
                        "reasonKey": reason[0],
                        "performanceBand": performance,
                        "regrettable": regrettable,
                        "syntheticProfile": True,
                    }
                )
                profile_number += 1
    return monthly, exits


def aggregate_series(monthly: list[dict], scope: str) -> list[dict]:
    cells: dict[str, dict] = {}
    for row in monthly:
        if scope != "Enterprise" and row["scope"] != scope:
            continue
        target = cells.setdefault(row["month"], {"month": row["month"], "start": 0, "end": 0, "exits": 0})
        target["start"] += row["startHeadcount"]
        target["end"] += row["endHeadcount"]
        target["exits"] += row["exits"]
    return [cells[key] for key in sorted(cells)]


def cumulative_rate(rows: list[dict]) -> float:
    if not rows:
        return 0.0
    average_workforce = sum((row["start"] + row["end"]) / 2 for row in rows) / len(rows)
    return sum(row["exits"] for row in rows) / average_workforce if average_workforce else 0.0


def build_forecasts(monthly: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    forecasts: list[dict] = []
    summaries: list[dict] = []
    annual: list[dict] = []
    scopes = ("Enterprise", "Retail Network", "Corporate Office", "Distribution")
    for scope_index, scope in enumerate(scopes):
        series = aggregate_series(monthly, scope)
        rates = [row["exits"] / ((row["start"] + row["end"]) / 2) for row in series]
        tail = rates[-12:]
        slope = (tail[-1] - tail[0]) / max(1, len(tail) - 1)
        baseline = sum(tail[-6:]) / min(6, len(tail))
        residuals = [abs(value - (sum(tail) / len(tail))) for value in tail]
        mae = sum(residuals) / len(residuals)
        rmse = math.sqrt(sum(value * value for value in residuals) / len(residuals))
        mape = sum(value / max(rate, 0.001) for value, rate in zip(residuals, tail)) / len(tail)
        summaries.append({"scope": scope, "mae": mae, "rmse": rmse, "mape": mape, "coverage": 0.88 + scope_index * 0.02})
        for offset in range(1, FORECAST_COUNT + 1):
            forecast = max(0.003, baseline + slope * offset * 0.45)
            spread = max(0.003, rmse * (1 + offset * 0.08))
            forecasts.append(
                {
                    "scope": scope,
                    "month": add_month(series[-1]["month"], offset),
                    "forecastRate": forecast,
                    "lowerRate": max(0, forecast - spread),
                    "upperRate": forecast + spread,
                }
            )
        for year in (2024, 2025):
            rows = [row for row in series if row["month"].startswith(str(year))]
            actual = cumulative_rate(rows)
            predicted = actual * (0.96 + ((year + scope_index) % 5) * 0.018)
            annual.append({"scope": scope, "year": year, "actualRate": actual, "predictedRate": predicted, "error": predicted - actual})
    return forecasts, summaries, annual


def build_survival() -> tuple[list[dict], list[dict]]:
    curves: list[dict] = []
    summaries: list[dict] = []
    hazards = {"Enterprise": 0.020, "Retail Network": 0.023, "Corporate Office": 0.014, "Distribution": 0.018}
    for scope, hazard in hazards.items():
        for tenure_month in range(0, 61, 3):
            curves.append({"scope": scope, "tenureMonth": tenure_month, "survivalProbability": math.exp(-hazard * tenure_month)})
        summaries.append(
            {
                "scope": scope,
                "medianTenureMonths": math.log(0.5) / -hazard,
                "survival12m": math.exp(-hazard * 12),
                "survival24m": math.exp(-hazard * 24),
            }
        )
    return curves, summaries


def build_risk(monthly: list[dict], rng: random.Random) -> tuple[list[dict], list[dict]]:
    last_month = month_key(MONTH_COUNT - 1)
    start_12m = add_month(last_month, -11)
    site_monthly: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for row in monthly:
        if row["month"] >= start_12m:
            site_monthly[(row["site"], row["region"], row["scope"])].append(row)
    risk_locations: list[dict] = []
    for (site, region, scope), rows in site_monthly.items():
        monthly_groups: dict[str, dict] = defaultdict(lambda: {"start": 0, "end": 0, "exits": 0})
        for row in rows:
            monthly_groups[row["month"]]["start"] += row["startHeadcount"]
            monthly_groups[row["month"]]["end"] += row["endHeadcount"]
            monthly_groups[row["month"]]["exits"] += row["exits"]
        compact = list(monthly_groups.values())
        rate = cumulative_rate(compact)
        average = sum((row["start"] + row["end"]) / 2 for row in compact) / len(compact)
        score = min(99, round(38 + rate * 115 + rng.uniform(-5, 5)))
        driver = "Early-tenure exits" if score >= 70 else "Voluntary movement" if rate >= 0.18 else "Workforce mix"
        risk_locations.append(
            {
                "site": site,
                "region": region,
                "scope": scope,
                "riskScore": score,
                "riskBand": "Critical" if score >= 80 else "Elevated" if score >= 65 else "Monitor",
                "turnover12m": rate,
                "averageWorkforce": average,
                "exits12m": sum(row["exits"] for row in compact),
                "topDriver": driver,
            }
        )
    risk_locations.sort(key=lambda row: (-row["riskScore"], row["site"]))
    risk_profiles: list[dict] = []
    sites = [(region, site, scope, city) for region, values in REGION_SITES.items() for site, scope, city in values]
    drivers = ("Career signal", "Compensation pressure", "Short tenure", "Role mobility", "Team movement")
    for index in range(1, 181):
        region, site, scope, city = sites[(index - 1) % len(sites)]
        department = DEPARTMENTS[(index * 3) % len(DEPARTMENTS)]
        role = ROLE_LEVELS[(index * 5) % len(ROLE_LEVELS)]
        score = max(12, min(98, round(rng.gauss(61, 17))))
        risk_profiles.append(
            {
                "profileId": f"RISK-{index:04d}",
                "scope": scope,
                "region": region,
                "site": site,
                "department": department,
                "roleLevel": role,
                "tenureMonths": max(1, round(rng.lognormvariate(3.1, 0.65))),
                "performanceBand": weighted_choice(("Developing", "Solid", "Strong"), [0.12, 0.63, 0.25], rng),
                "riskScore": score,
                "riskBand": "Critical" if score >= 80 else "Elevated" if score >= 65 else "Monitor",
                "topDriver": drivers[index % len(drivers)],
                "syntheticProfile": True,
            }
        )
    risk_profiles.sort(key=lambda row: (-row["riskScore"], row["profileId"]))
    return risk_locations, risk_profiles


def build_dataset() -> dict:
    rng = random.Random(SEED)
    monthly, exits = build_workforce(rng)
    forecasts, backtest_summary, annual_backtest = build_forecasts(monthly)
    survival_curve, survival_summary = build_survival()
    risk_locations, risk_profiles = build_risk(monthly, rng)
    return {
        "meta": {
            "title": "Workforce Turnover Analytics",
            "version": "2.0.0",
            "generatedBy": "analytics/workforce-turnover/generate_data.py",
            "generatedOn": "2026-08-26",
            "seed": SEED,
            "period": {"start": month_key(0), "end": month_key(MONTH_COUNT - 1)},
            "notice": "Every record is deterministic fictional scenario data created from scratch.",
            "formula": "exits / average monthly workforce",
        },
        "privacy": {
            "synthetic": True,
            "realPeople": False,
            "realBusinesses": False,
            "directIdentifiers": [],
            "inputSources": [],
            "profileIdentifiers": "generated scenario labels only",
        },
        "dimensions": {
            "scopes": ["Enterprise", "Retail Network", "Corporate Office", "Distribution"],
            "regions": list(REGION_SITES),
            "sites": [site for values in REGION_SITES.values() for site, _, _ in values],
            "departments": list(DEPARTMENTS),
            "divisions": list(DIVISIONS.values()),
            "cities": sorted({city for values in REGION_SITES.values() for _, _, city in values}),
            "genders": list(GENDERS),
            "contractTypes": list(CONTRACT_TYPES),
            "roleLevels": list(ROLE_LEVELS),
        },
        "methodology": {
            "monthlyTurnover": "monthly exits / monthly average workforce",
            "cumulativeTurnover": "period exits / average of monthly average workforce",
            "averageWorkforce": "(start headcount + end headcount) / 2",
            "classification": "reason settings change the numerator only; the workforce denominator remains fixed",
        },
        "reasonSettings": [
            {"key": key, "label": label, "group": group, "defaultType": default_type}
            for key, label, group, default_type in REASONS
        ],
        "monthly": monthly,
        "exits": exits,
        "forecasts": forecasts,
        "backtestSummary": backtest_summary,
        "annualBacktest": annual_backtest,
        "survivalCurve": survival_curve,
        "survivalSummary": survival_summary,
        "riskLocations": risk_locations,
        "riskProfiles": risk_profiles,
    }


def main() -> None:
    output = Path(__file__).parents[2] / "frontend" / "analytics" / "workforce-turnover" / "data.json"
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=output)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(build_dataset(), separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote deterministic synthetic analytics data to {args.output}")


if __name__ == "__main__":
    main()

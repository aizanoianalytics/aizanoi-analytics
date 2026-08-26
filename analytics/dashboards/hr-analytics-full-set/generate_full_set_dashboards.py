from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WORKBOOK = ROOT / "analytics" / "dashboards" / "hr-analytics-full-set" / "synthetic-core" / "data" / "hr_demo_core_synthetic.xlsx"
PUBLIC_ROOT = ROOT / "frontend" / "analytics" / "dashboards" / "hr-analytics-full-set"


def key(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "_", str(value)).strip("_").lower()
    return value


def clean_value(value):
    if value is None or value is pd.NA:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (pd.Timestamp, np.datetime64)):
        return pd.Timestamp(value).strftime("%Y-%m-%d")
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and np.isnan(value):
        return None
    if isinstance(value, float):
        return round(value, 6)
    return value


def records(frame: pd.DataFrame) -> list[dict]:
    renamed = frame.copy()
    renamed.columns = [key(column) for column in renamed.columns]
    return [{column: clean_value(value) for column, value in row.items()} for row in renamed.to_dict("records")]


def enrich(frame: pd.DataFrame, employees: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    result.columns = [key(column) for column in result.columns]
    if "employee_id" in result.columns:
        lookup_columns = ["employee_id", "display_name", "department", "region", "store_id", "title", "status"]
        available = [column for column in lookup_columns if column in employees.columns]
        additions = [column for column in available if column == "employee_id" or column not in result.columns]
        result = result.merge(employees[additions], on="employee_id", how="left") if len(additions) > 1 else result
    if "store_id" in result.columns:
        result["store"] = result["store_id"]
    elif "store" not in result.columns:
        result["store"] = None
    if "period" not in result.columns:
        for candidate in ["month", "quarter", "exit_date", "start_date", "event_date", "exam_date", "case_date", "date", "promotion_date"]:
            if candidate in result.columns:
                result["period"] = result[candidate].astype(str).str.slice(0, 7)
                break
    if "period" not in result.columns:
        result["period"] = "Current"
    for column in ["region", "department"]:
        if column not in result.columns:
            result[column] = None
    return result


def metric(label, op, field=None, equals=None, fmt=None, note=None):
    value = {"label": label, "op": op}
    if field:
        value["field"] = field
    if equals is not None:
        value["equals"] = equals
    if fmt:
        value["format"] = fmt
    if note:
        value["note"] = note
    return value


def chart(title, group_by, op="count", field=None, kind="bar", limit=12, order=None):
    value = {"title": title, "groupBy": group_by, "op": op, "type": kind, "limit": limit}
    if field:
        value["field"] = field
    if order:
        value["order"] = order
    return value


def view(identifier, label, title, description, dataset, kpis, charts, columns, kind_name=None, profile_fields=None):
    value = {"id": identifier, "label": label, "title": title, "description": description, "dataset": dataset, "kpis": kpis, "charts": charts, "columns": columns, "tableTitle": f"{label} detail"}
    if kind_name:
        value["kind"] = kind_name
    if profile_fields:
        value["profileFields"] = profile_fields
    return value


def build_data(workbook: Path):
    sheets = pd.read_excel(workbook, sheet_name=None)
    normalized = {}
    for name, frame in sheets.items():
        data = frame.copy()
        data.columns = [key(column) for column in data.columns]
        normalized[key(name)] = data
    employees = normalized["employees"]
    as_of = pd.Timestamp("2026-08-20")
    employees["start_date"] = pd.to_datetime(employees["start_date"], errors="coerce")
    employees["exit_date"] = pd.to_datetime(employees["exit_date"], errors="coerce")
    employees["tenure_months"] = ((employees["exit_date"].fillna(as_of) - employees["start_date"]).dt.days / 30.4375).round(1)
    datasets = {}
    for name in ["employees", "employment_monthly", "exits", "hiring", "promotions", "performance", "learning_events", "exams", "development", "discipline", "compliance", "store_scorecards", "goals", "attendance", "turnover_analysis"]:
        datasets[name] = enrich(normalized[name], employees)
    latest_performance = datasets["performance"].sort_values("quarter").groupby("employee_id", as_index=False).tail(1)[["employee_id", "performance_score", "grade", "potential_level"]]
    risk = datasets["compliance"].merge(latest_performance, on="employee_id", how="left")
    risk["risk_score"] = (100 - risk[["mandatory_learning_score", "safety_score", "checklist_score", "performance_score"]].mean(axis=1)).round(1)
    risk["risk_band"] = np.select([risk["risk_score"] >= 25, risk["risk_score"] >= 15], ["High", "Watch"], default="Low")
    datasets["risk"] = enrich(risk, employees)
    datasets["early_exits"] = datasets["exits"][datasets["exits"]["tenure_days"] <= 365].copy()
    datasets["sales_learning"] = datasets["learning_events"][datasets["learning_events"]["program"].isin(["Product Knowledge", "Customer Experience"])].copy()
    turnover = datasets["turnover_analysis"].copy()
    forecast_rows = []
    for region, group in turnover.groupby("region"):
        history = group.sort_values("month").tail(12)
        values = history["turnover_rate"].astype(float).to_numpy()
        slope = float(np.polyfit(np.arange(len(values)), values, 1)[0]) if len(values) > 1 else 0.0
        base = float(values[-3:].mean()) if len(values) else 0.0
        last = pd.Period(history["month"].iloc[-1], freq="M")
        for step in range(1, 7):
            forecast_rows.append({"month": str(last + step), "period": str(last + step), "region": region, "store": None, "department": None, "forecast_rate": max(0.0, base + slope * step), "model": "Synthetic linear trend", "horizon_month": step})
    datasets["forecast"] = pd.DataFrame(forecast_rows)
    timeline_parts = []
    for dataset, date_field, event_name in [("hiring", "start_date", "Hired"), ("promotions", "promotion_date", "Promoted"), ("exits", "exit_date", "Exited"), ("discipline", "case_date", "Coaching case")]:
        frame = datasets[dataset].copy()
        frame["event_date"] = frame[date_field]
        frame["event_type"] = event_name
        timeline_parts.append(frame[[column for column in ["employee_id", "display_name", "event_date", "event_type", "department", "title", "store", "region", "period"] if column in frame.columns]])
    datasets["timeline"] = pd.concat(timeline_parts, ignore_index=True, sort=False)
    return {name: records(frame) for name, frame in datasets.items()}


def dashboard_configs():
    employee_columns = ["employee_id", "display_name", "status", "department", "title", "region", "store", "contract_type", "tenure_months"]
    executive_views = [
        view("overview", "Overview", "Workforce command view", "Synthetic workforce scale, active status and organizational footprint.", "employees", [metric("Employees", "count"), metric("Active", "countWhere", "status", "Active"), metric("Regions", "distinct", "region"), metric("Stores", "distinct", "store")], [chart("Employees by region", "region"), chart("Employees by department", "department")], employee_columns),
        view("workforce", "Workforce", "Historical workforce bridge", "Employee-month history across organization, location, contract and title.", "employment_monthly", [metric("Employee-months", "count"), metric("People", "distinct", "employee_id"), metric("Average tenure months", "avg", "tenure_months"), metric("Locations", "distinct", "store")], [chart("Workforce by month", "month", kind="line", order="time"), chart("Workforce by contract", "contract_type")], ["month", "employee_id", "month_end_status", "department", "region", "store", "title", "contract_type", "tenure_months"]),
        view("movement", "Hiring & exits", "Workforce movement", "Exit mix, regrettable loss and tenure at exit with drill-down detail.", "exits", [metric("Exits", "count"), metric("Voluntary", "rateWhere", "exit_type", "Voluntary", fmt="percent"), metric("Regrettable", "rateWhere", "regrettable_status", "Regrettable", fmt="percent"), metric("Average tenure", "avg", "tenure_days", fmt="days")], [chart("Exit reasons", "reason"), chart("Exits by month", "period", kind="line", order="time")], ["exit_id", "employee_id", "display_name", "exit_date", "reason", "exit_type", "regrettable_status", "tenure_days", "region", "store"]),
        view("tenure", "Tenure", "Tenure architecture", "Service length across departments, regions and contract structures.", "employees", [metric("Average months", "avg", "tenure_months"), metric("Active people", "countWhere", "status", "Active"), metric("Full-time", "countWhere", "contract_type", "Full-Time"), metric("Part-time", "countWhere", "contract_type", "Part-Time")], [chart("Average tenure by department", "department", "avg", "tenure_months"), chart("Average tenure by region", "region", "avg", "tenure_months")], employee_columns),
        view("promotions", "Promotions", "Internal mobility", "Promotion volume, destination roles and regional movement.", "promotions", [metric("Promotions", "count"), metric("Promoted people", "distinct", "employee_id"), metric("Regions", "distinct", "region"), metric("Stores", "distinct", "store")], [chart("Promotions by destination", "to_title"), chart("Promotions by region", "region")], ["promotion_id", "employee_id", "display_name", "promotion_date", "from_title", "to_title", "department", "region", "store"]),
        view("learning", "Learning", "Learning participation", "Delivery, completion, scores and hours across the workforce.", "learning_events", [metric("Events", "count"), metric("Learners", "distinct", "employee_id"), metric("Completion", "rateWhere", "completion_status", "Completed", fmt="percent"), metric("Hours", "sum", "hours", fmt="hours")], [chart("Learning by program", "program"), chart("Average score by region", "region", "avg", "score")], ["event_id", "employee_id", "display_name", "event_date", "program", "delivery_mode", "score", "completion_status", "hours", "region", "store"]),
        view("risk", "Risk", "Workforce risk center", "Synthetic risk scoring combining performance and compliance signals.", "risk", [metric("Profiles", "count"), metric("High risk", "countWhere", "risk_band", "High"), metric("Watch", "countWhere", "risk_band", "Watch"), metric("Average risk", "avg", "risk_score")], [chart("Risk bands", "risk_band"), chart("Average risk by region", "region", "avg", "risk_score")], ["employee_id", "display_name", "risk_score", "risk_band", "performance_score", "mandatory_learning_score", "safety_score", "checklist_score", "region", "store"]),
    ]
    return {
        "hr-executive-board-full-history": {"name": "HR Executive Board — Full History", "description": "Complete synthetic workforce history across organization, movement, tenure, learning and risk.", "datasets": ["employees", "employment_monthly", "exits", "promotions", "learning_events", "risk"], "views": executive_views},
        "hr-executive-board-current": {"name": "HR Executive Board — 2024 to Present", "description": "Current-period executive workforce intelligence from 2024 onward.", "datasets": ["employees", "employment_monthly", "exits", "promotions", "learning_events", "risk"], "views": executive_views},
        "hr-administration-deep-dive": {"name": "HR Administration & Deep Dive", "description": "Synthetic person search, employment timelines, performance, learning, discipline and exit analysis.", "datasets": ["employees", "timeline", "performance", "learning_events", "discipline", "exits"], "views": [
            view("directory", "Directory", "Synthetic employee directory", "Search and select generated profiles without exposing any real identity.", "employees", [], [], employee_columns, "profile", ["employee_id", "department", "title", "region", "store", "contract_type", "start_date", "status"]),
            view("timeline", "Timeline", "Employment timelines", "Hiring, promotion, coaching and exit events in one chronological explorer.", "timeline", [metric("Events", "count"), metric("People", "distinct", "employee_id"), metric("Event types", "distinct", "event_type"), metric("Regions", "distinct", "region")], [chart("Events by type", "event_type"), chart("Events over time", "period", kind="line", order="time")], ["employee_id", "display_name", "event_date", "event_type", "department", "title", "region", "store"]),
            view("performance", "Performance", "Performance history", "Quarterly scores, grades, target attainment and potential.", "performance", [metric("Reviews", "count"), metric("People", "distinct", "employee_id"), metric("Average score", "avg", "performance_score"), metric("Target attainment", "avg", "target_attainment", fmt="percent")], [chart("Average score by quarter", "quarter", "avg", "performance_score", "line", order="time"), chart("Grade distribution", "grade")], ["quarter", "employee_id", "display_name", "performance_score", "grade", "target_attainment", "potential_level", "department", "region", "store"]),
            view("learning", "Learning", "Individual learning history", "Programs, results, delivery mode and completion detail.", "learning_events", [metric("Events", "count"), metric("Learners", "distinct", "employee_id"), metric("Completion", "rateWhere", "completion_status", "Completed", fmt="percent"), metric("Average score", "avg", "score")], [chart("Programs", "program"), chart("Delivery mode", "delivery_mode")], ["employee_id", "display_name", "event_date", "program", "delivery_mode", "score", "completion_status", "hours"]),
            view("discipline", "Discipline", "Coaching and discipline", "Open and closed synthetic cases with category detail.", "discipline", [metric("Cases", "count"), metric("Open", "countWhere", "status", "Open"), metric("Closed", "countWhere", "status", "Closed"), metric("People", "distinct", "employee_id")], [chart("Case status", "status"), chart("Case category", "category")], ["case_id", "employee_id", "display_name", "case_date", "category", "status", "department", "region", "store"]),
            view("exits", "Exits", "Exit case explorer", "Reasons, types, regrettable status and tenure for synthetic exits.", "exits", [metric("Exits", "count"), metric("Voluntary", "rateWhere", "exit_type", "Voluntary", fmt="percent"), metric("Regrettable", "rateWhere", "regrettable_status", "Regrettable", fmt="percent"), metric("Tenure", "avg", "tenure_days", fmt="days")], [chart("Exit reason", "reason"), chart("Exit type", "exit_type")], ["employee_id", "display_name", "exit_date", "reason", "exit_type", "regrettable_status", "tenure_days", "department", "region", "store"]),
        ]},
        "store-operations-tracking": {"name": "Store Operations Tracking", "description": "Regional and store comparison, workforce movement, turnover, forecasting and learning.", "datasets": ["store_scorecards", "employment_monthly", "hiring", "promotions", "exits", "turnover_analysis", "forecast", "learning_events"], "views": [
            view("network", "Network", "Store network overview", "Headcount and operating indicators across the fictional store network.", "store_scorecards", [metric("Store-months", "count"), metric("Stores", "distinct", "store"), metric("Headcount", "sum", "headcount"), metric("Performance", "avg", "performance_score")], [chart("Average performance by region", "region", "avg", "performance_score"), chart("Average compliance by store", "store", "avg", "compliance_score", limit=10)], ["month", "store", "store_name", "region", "city", "headcount", "performance_score", "learning_score", "compliance_score", "revenue_index"]),
            view("workforce", "Workforce", "Store workforce", "Employee-month headcount by store, region, title and contract type.", "employment_monthly", [metric("Employee-months", "count"), metric("People", "distinct", "employee_id"), metric("Stores", "distinct", "store"), metric("Tenure", "avg", "tenure_months")], [chart("Workforce trend", "month", kind="line", order="time"), chart("Workforce by store", "store", limit=10)], ["month", "employee_id", "department", "region", "store", "title", "contract_type", "tenure_months"]),
            view("hiring", "Hiring", "Store hiring", "Time-to-hire, sources and growth/backfill mix.", "hiring", [metric("Hires", "count"), metric("Time to hire", "avg", "time_to_hire_days", fmt="days"), metric("Growth hires", "countWhere", "hiring_type", "Growth"), metric("Sources", "distinct", "source")], [chart("Hiring sources", "source"), chart("Average time to hire by region", "region", "avg", "time_to_hire_days")], ["hiring_id", "employee_id", "display_name", "application_date", "start_date", "time_to_hire_days", "source", "hiring_type", "region", "store"]),
            view("promotion", "Promotion", "Store promotion", "Internal mobility volume and destination roles.", "promotions", [metric("Promotions", "count"), metric("People", "distinct", "employee_id"), metric("Stores", "distinct", "store"), metric("Regions", "distinct", "region")], [chart("Destination roles", "to_title"), chart("Promotions by region", "region")], ["promotion_id", "employee_id", "display_name", "promotion_date", "from_title", "to_title", "region", "store"]),
            view("turnover", "Turnover", "Store turnover", "Reconciled opening, movement, closing headcount and turnover rates.", "turnover_analysis", [metric("Periods", "count"), metric("Exits", "sum", "exits"), metric("Average headcount", "avg", "average_headcount"), metric("Turnover", "avg", "turnover_rate", fmt="percent")], [chart("Turnover trend", "month", "avg", "turnover_rate", "line", order="time"), chart("Turnover by region", "region", "avg", "turnover_rate")], ["month", "region", "opening_headcount", "hires", "exits", "closing_headcount", "average_headcount", "turnover_rate"]),
            view("forecast", "Forecast", "Turnover forecast", "Six-month synthetic trend projection by region.", "forecast", [metric("Forecast points", "count"), metric("Regions", "distinct", "region"), metric("Average forecast", "avg", "forecast_rate", fmt="percent"), metric("Horizon", "distinct", "horizon_month")], [chart("Forecast trajectory", "month", "avg", "forecast_rate", "line", order="time"), chart("Forecast by region", "region", "avg", "forecast_rate")], ["month", "region", "forecast_rate", "model", "horizon_month"]),
            view("learning", "Learning", "Store learning", "Participation, completion and hours by store and region.", "learning_events", [metric("Events", "count"), metric("Learners", "distinct", "employee_id"), metric("Completion", "rateWhere", "completion_status", "Completed", fmt="percent"), metric("Hours", "sum", "hours", fmt="hours")], [chart("Programs", "program"), chart("Average score by store", "store", "avg", "score", limit=10)], ["event_date", "employee_id", "display_name", "program", "score", "completion_status", "hours", "region", "store"]),
        ]},
        "store-learning-compliance": {"name": "Store Learning & Compliance", "description": "Participation, mandatory learning, safety, checklists and risk scoring.", "datasets": ["compliance", "learning_events", "risk"], "views": [
            view("overview", "Overview", "Compliance command view", "Combined mandatory-learning, safety and checklist posture.", "compliance", [metric("Profiles", "count"), metric("Mandatory", "avg", "mandatory_learning_score"), metric("Safety", "avg", "safety_score"), metric("Checklist", "avg", "checklist_score")], [chart("Risk bands", "risk_band"), chart("Mandatory score by region", "region", "avg", "mandatory_learning_score")], ["employee_id", "display_name", "mandatory_learning_score", "safety_score", "checklist_score", "risk_band", "region", "store"]),
            view("mandatory", "Mandatory learning", "Mandatory learning", "Completion signals and program evidence.", "learning_events", [metric("Events", "count"), metric("Learners", "distinct", "employee_id"), metric("Completion", "rateWhere", "completion_status", "Completed", fmt="percent"), metric("Average score", "avg", "score")], [chart("Programs", "program"), chart("Completion status", "completion_status")], ["employee_id", "display_name", "event_date", "program", "score", "completion_status", "hours", "region", "store"]),
            view("safety", "Safety", "Safety readiness", "Synthetic safety score distribution across stores and regions.", "compliance", [metric("Profiles", "count"), metric("Average safety", "avg", "safety_score"), metric("At risk", "countWhere", "risk_band", "At Risk"), metric("Stores", "distinct", "store")], [chart("Safety by region", "region", "avg", "safety_score"), chart("Safety by store", "store", "avg", "safety_score", limit=10)], ["employee_id", "display_name", "safety_score", "risk_band", "region", "store"]),
            view("checklists", "Checklists", "Checklist quality", "Checklist scores and exceptions across the store network.", "compliance", [metric("Profiles", "count"), metric("Average checklist", "avg", "checklist_score"), metric("Watch", "countWhere", "risk_band", "Watch"), metric("Stores", "distinct", "store")], [chart("Checklist by region", "region", "avg", "checklist_score"), chart("Checklist by store", "store", "avg", "checklist_score", limit=10)], ["employee_id", "display_name", "checklist_score", "risk_band", "region", "store"]),
            view("risk", "Risk", "Compliance risk", "Prioritized synthetic profiles combining learning, safety, checklist and performance.", "risk", [metric("Profiles", "count"), metric("High", "countWhere", "risk_band", "High"), metric("Watch", "countWhere", "risk_band", "Watch"), metric("Risk score", "avg", "risk_score")], [chart("Risk bands", "risk_band"), chart("Risk by region", "region", "avg", "risk_score")], ["employee_id", "display_name", "risk_score", "risk_band", "performance_score", "mandatory_learning_score", "safety_score", "checklist_score", "region", "store"]),
            view("ranking", "Store ranking", "Store compliance ranking", "Store-level comparison across compliance components.", "compliance", [metric("Profiles", "count"), metric("Stores", "distinct", "store"), metric("Mandatory", "avg", "mandatory_learning_score"), metric("Checklist", "avg", "checklist_score")], [chart("Composite readiness by store", "store", "avg", "checklist_score", limit=12), chart("Safety by store", "store", "avg", "safety_score", limit=12)], ["store", "region", "employee_id", "mandatory_learning_score", "safety_score", "checklist_score", "risk_band"]),
        ]},
        "learning-academy-analytics": {"name": "Learning Academy Analytics", "description": "Training delivery, compliance, planning, exams, development journeys and academy outcomes.", "datasets": ["learning_events", "compliance", "development", "exams", "risk", "sales_learning", "performance"], "views": [
            view("delivery", "Delivery", "Learning delivery", "Program volume, modes, participation, scores and hours.", "learning_events", [metric("Events", "count"), metric("Learners", "distinct", "employee_id"), metric("Hours", "sum", "hours", fmt="hours"), metric("Average score", "avg", "score")], [chart("Delivery by program", "program"), chart("Delivery over time", "period", kind="line", order="time")], ["event_id", "employee_id", "display_name", "event_date", "program", "delivery_mode", "score", "completion_status", "hours", "region", "store"]),
            view("compliance", "Compliance", "Learning compliance", "Mandatory learning, safety and checklist posture.", "compliance", [metric("Profiles", "count"), metric("Mandatory", "avg", "mandatory_learning_score"), metric("Safety", "avg", "safety_score"), metric("Checklist", "avg", "checklist_score")], [chart("Risk bands", "risk_band"), chart("Mandatory score by region", "region", "avg", "mandatory_learning_score")], ["employee_id", "display_name", "mandatory_learning_score", "safety_score", "checklist_score", "risk_band", "region", "store"]),
            view("planning", "Planning", "Academy planning", "Development-path capacity, progress and status.", "development", [metric("Journeys", "count"), metric("People", "distinct", "employee_id"), metric("Progress", "avg", "progress_percent", fmt="percent"), metric("Completed", "countWhere", "status", "Completed")], [chart("Journey status", "status"), chart("Progress by region", "region", "avg", "progress_percent")], ["journey_id", "employee_id", "display_name", "program", "start_date", "status", "progress_percent", "current_title", "region", "store"]),
            view("exams", "Exams", "Assessment analytics", "Scores, pass rates and regional outcomes.", "exams", [metric("Assessments", "count"), metric("People", "distinct", "employee_id"), metric("Pass rate", "rateWhere", "result", "Passed", fmt="percent"), metric("Average score", "avg", "score")], [chart("Results", "result"), chart("Average score by region", "region", "avg", "score")], ["exam_id", "employee_id", "display_name", "exam_name", "exam_date", "score", "result", "region", "store"]),
            view("journeys", "Journeys", "Development journeys", "Program progress and role readiness detail.", "development", [metric("Journeys", "count"), metric("People", "distinct", "employee_id"), metric("Completed", "countWhere", "status", "Completed"), metric("Average progress", "avg", "progress_percent", fmt="percent")], [chart("Program status", "status"), chart("Journeys by title", "current_title")], ["journey_id", "employee_id", "display_name", "program", "status", "progress_percent", "current_title", "region", "store"]),
            view("readiness", "Readiness", "Promotion readiness", "Synthetic performance, potential and risk signals for development decisions.", "risk", [metric("Profiles", "count"), metric("Low risk", "countWhere", "risk_band", "Low"), metric("Performance", "avg", "performance_score"), metric("Potential", "avg", "potential_level")], [chart("Performance by region", "region", "avg", "performance_score"), chart("Potential distribution", "potential_level")], ["employee_id", "display_name", "performance_score", "grade", "potential_level", "risk_score", "risk_band", "region", "store"]),
            view("sales", "Sales academy", "Sales academy", "Customer-experience and product-knowledge learning outcomes.", "sales_learning", [metric("Events", "count"), metric("Learners", "distinct", "employee_id"), metric("Completion", "rateWhere", "completion_status", "Completed", fmt="percent"), metric("Average score", "avg", "score")], [chart("Academy programs", "program"), chart("Average score by store", "store", "avg", "score", limit=10)], ["employee_id", "display_name", "event_date", "program", "score", "completion_status", "hours", "region", "store"]),
            view("performance", "Performance", "Learning and performance", "Quarterly performance outcomes for academy population analysis.", "performance", [metric("Reviews", "count"), metric("People", "distinct", "employee_id"), metric("Average score", "avg", "performance_score"), metric("Target attainment", "avg", "target_attainment", fmt="percent")], [chart("Performance by quarter", "quarter", "avg", "performance_score", "line", order="time"), chart("Grade mix", "grade")], ["quarter", "employee_id", "display_name", "performance_score", "grade", "target_attainment", "potential_level", "department", "region", "store"]),
        ]},
        "performance-hiring-turnover": {"name": "Performance, Hiring & Turnover", "description": "Performance, time to hire, early turnover, targets, promotion and store scorecards.", "datasets": ["performance", "hiring", "early_exits", "goals", "store_scorecards", "promotions"], "views": [
            view("performance", "Performance", "Performance portfolio", "Quarterly scores, grades, targets and potential.", "performance", [metric("Reviews", "count"), metric("People", "distinct", "employee_id"), metric("Average score", "avg", "performance_score"), metric("Target attainment", "avg", "target_attainment", fmt="percent")], [chart("Performance trend", "quarter", "avg", "performance_score", "line", order="time"), chart("Grade distribution", "grade")], ["quarter", "employee_id", "display_name", "performance_score", "grade", "target_attainment", "potential_level", "department", "region", "store"]),
            view("hiring", "Hiring", "Hiring efficiency", "Time-to-hire, sourcing and growth/backfill outcomes.", "hiring", [metric("Hires", "count"), metric("Time to hire", "avg", "time_to_hire_days", fmt="days"), metric("Sources", "distinct", "source"), metric("Growth", "countWhere", "hiring_type", "Growth")], [chart("Hiring sources", "source"), chart("Time to hire by department", "department", "avg", "time_to_hire_days")], ["hiring_id", "employee_id", "display_name", "application_date", "start_date", "time_to_hire_days", "source", "hiring_type", "department", "region", "store"]),
            view("early", "Early turnover", "Early turnover", "Exits within the first year with reason and location detail.", "early_exits", [metric("Early exits", "count"), metric("Average tenure", "avg", "tenure_days", fmt="days"), metric("Regrettable", "rateWhere", "regrettable_status", "Regrettable", fmt="percent"), metric("Regions", "distinct", "region")], [chart("Early exit reasons", "reason"), chart("Early exits by region", "region")], ["employee_id", "display_name", "exit_date", "reason", "exit_type", "regrettable_status", "tenure_days", "department", "region", "store"]),
            view("targets", "Targets", "Target attainment", "Strategic metric attainment and status.", "goals", [metric("Metrics", "count"), metric("Attainment", "avg", "attainment", fmt="percent"), metric("Achieved", "countWhere", "status", "Achieved"), metric("Categories", "distinct", "category")], [chart("Attainment by category", "category", "avg", "attainment"), chart("Status mix", "status")], ["goal_id", "category", "metric", "period", "target", "actual", "attainment", "status", "direction"]),
            view("scorecards", "Store scorecards", "Store performance scorecards", "Performance, learning, compliance and revenue indicators.", "store_scorecards", [metric("Store-months", "count"), metric("Stores", "distinct", "store"), metric("Performance", "avg", "performance_score"), metric("Compliance", "avg", "compliance_score")], [chart("Performance by store", "store", "avg", "performance_score", limit=12), chart("Revenue index by region", "region", "avg", "revenue_index")], ["month", "store", "store_name", "region", "city", "headcount", "performance_score", "learning_score", "compliance_score", "revenue_index"]),
            view("promotions", "Promotion", "Promotion outcomes", "Internal mobility volume and destination roles.", "promotions", [metric("Promotions", "count"), metric("People", "distinct", "employee_id"), metric("Regions", "distinct", "region"), metric("Stores", "distinct", "store")], [chart("Destination roles", "to_title"), chart("Promotions by region", "region")], ["promotion_id", "employee_id", "display_name", "promotion_date", "from_title", "to_title", "department", "region", "store"]),
        ]},
        "corporate-goals": {"name": "Corporate Goals Dashboard", "description": "Strategic goals, KPI progress, target status and executive summaries for a fictional organization.", "datasets": ["goals"], "views": [
            view("overview", "Overview", "Strategic goal portfolio", "Target, actual and attainment across the synthetic organization.", "goals", [metric("Metrics", "count"), metric("Categories", "distinct", "category"), metric("Attainment", "avg", "attainment", fmt="percent"), metric("Achieved", "countWhere", "status", "Achieved")], [chart("Attainment by category", "category", "avg", "attainment"), chart("Status distribution", "status")], ["goal_id", "category", "metric", "period", "target", "actual", "attainment", "status", "direction"]),
            view("explorer", "Goal explorer", "Goal explorer", "Sortable detail across every strategic metric.", "goals", [metric("Metrics", "count"), metric("On track", "countWhere", "status", "On Track"), metric("Needs attention", "countWhere", "status", "Needs Attention"), metric("Attainment", "avg", "attainment", fmt="percent")], [chart("Metrics by category", "category"), chart("Average actual by category", "category", "avg", "actual")], ["goal_id", "category", "metric", "period", "target", "actual", "attainment", "status", "direction"]),
            view("categories", "Categories", "Category performance", "Portfolio-level comparison across People, Customer, Operations, Growth and Learning.", "goals", [metric("Categories", "distinct", "category"), metric("Metrics", "count"), metric("Attainment", "avg", "attainment", fmt="percent"), metric("Achieved", "countWhere", "status", "Achieved")], [chart("Category attainment", "category", "avg", "attainment"), chart("Category metric count", "category")], ["category", "metric", "target", "actual", "attainment", "status"]),
            view("status", "Target status", "Target status center", "Exception-oriented view of achieved, on-track and needs-attention metrics.", "goals", [metric("Metrics", "count"), metric("Achieved", "countWhere", "status", "Achieved"), metric("On track", "countWhere", "status", "On Track"), metric("Needs attention", "countWhere", "status", "Needs Attention")], [chart("Status mix", "status"), chart("Attainment by direction", "direction", "avg", "attainment")], ["status", "category", "metric", "target", "actual", "attainment", "direction"]),
        ]},
        "workforce-time-attendance": {"name": "Workforce Time & Attendance", "description": "Schedules, worked versus required hours, exceptions, person detail, monthly balance and export.", "datasets": ["attendance", "employees"], "views": [
            view("overview", "Overview", "Time and attendance overview", "Daily scheduled and worked hours across the active synthetic workforce.", "attendance", [metric("Records", "count"), metric("People", "distinct", "employee_id"), metric("Scheduled", "sum", "scheduled_hours", fmt="hours"), metric("Worked", "sum", "worked_hours", fmt="hours")], [chart("Worked hours by date", "date", "sum", "worked_hours", "line", order="time", limit=60), chart("Status mix", "status")], ["date", "employee_id", "display_name", "scheduled_hours", "worked_hours", "variance_hours", "status", "department", "region", "store"]),
            view("tracking", "Daily tracking", "Daily tracking", "Person-day schedule, worked hours and variance.", "attendance", [metric("Records", "count"), metric("People", "distinct", "employee_id"), metric("Worked", "sum", "worked_hours", fmt="hours"), metric("Variance", "sum", "variance_hours", fmt="hours")], [chart("Daily variance", "date", "sum", "variance_hours", "line", order="time", limit=60), chart("Records by region", "region")], ["date", "employee_id", "display_name", "scheduled_hours", "worked_hours", "variance_hours", "status", "department", "region", "store"]),
            view("balance", "Monthly balance", "Monthly hour balance", "Scheduled, worked and variance detail by month.", "attendance", [metric("Scheduled", "sum", "scheduled_hours", fmt="hours"), metric("Worked", "sum", "worked_hours", fmt="hours"), metric("Variance", "sum", "variance_hours", fmt="hours"), metric("People", "distinct", "employee_id")], [chart("Worked by month", "period", "sum", "worked_hours", "line", order="time"), chart("Variance by department", "department", "sum", "variance_hours")], ["period", "employee_id", "display_name", "scheduled_hours", "worked_hours", "variance_hours", "department", "region", "store"]),
            view("exceptions", "Exceptions", "Attendance exceptions", "Absence, short-hours and overtime signals remain filterable and exportable.", "attendance", [metric("Records", "count"), metric("Absent", "countWhere", "status", "Absent"), metric("Short", "countWhere", "status", "Short"), metric("Overtime", "countWhere", "status", "Overtime")], [chart("Exception mix", "status"), chart("Exceptions by store", "store", limit=12)], ["date", "employee_id", "display_name", "status", "scheduled_hours", "worked_hours", "variance_hours", "department", "region", "store"]),
            view("people", "Person detail", "Synthetic person detail", "Search generated identities and inspect their time records.", "attendance", [], [], ["employee_id", "display_name", "date", "status", "scheduled_hours", "worked_hours", "variance_hours", "department", "region", "store"], "profile", ["employee_id", "department", "region", "store", "date", "status", "scheduled_hours", "worked_hours", "variance_hours"]),
            view("schedule", "Schedule", "Schedule explorer", "Daily required hours and workforce coverage.", "attendance", [metric("Records", "count"), metric("People", "distinct", "employee_id"), metric("Scheduled", "sum", "scheduled_hours", fmt="hours"), metric("Average schedule", "avg", "scheduled_hours", fmt="hours")], [chart("Scheduled hours by date", "date", "sum", "scheduled_hours", "line", order="time", limit=60), chart("Scheduled hours by department", "department", "sum", "scheduled_hours")], ["date", "employee_id", "display_name", "scheduled_hours", "department", "region", "store"]),
        ]},
    }


def html_document(identifier: str, config: dict, payload: dict) -> str:
    canonical = f"https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/{identifier}/"
    source = f"https://github.com/aizanoianalytics/aizanoi-analytics/tree/main/analytics/dashboards/hr-analytics-full-set/{identifier}"
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    structured = json.dumps({"@context": "https://schema.org", "@type": "SoftwareApplication", "name": config["name"], "applicationCategory": "BusinessApplication", "url": canonical, "isPartOf": {"@type": "WebSite", "name": "Aizanoi Analytics", "url": "https://aizanoianalytics.com/"}}, ensure_ascii=False, separators=(",", ":"))
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{config["name"]} — Aizanoi Analytics</title><meta name="description" content="{config["description"]}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="theme-color" content="#071017">
<link rel="canonical" href="{canonical}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/analytics/dashboards/hr-analytics-full-set/shared/dashboard.css">
<meta property="og:type" content="website"><meta property="og:site_name" content="Aizanoi Analytics"><meta property="og:title" content="{config["name"]}"><meta property="og:description" content="{config["description"]}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="https://aizanoianalytics.com/assets/branding/aizanoi-og.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{config["name"]}"><meta name="twitter:description" content="{config["description"]}"><script type="application/ld+json">{structured}</script></head><body>
<header class="topbar"><a class="brand" href="/"><img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><span>Aizanoi Analytics</span></a><nav class="top-links" aria-label="Dashboard links"><a href="/analytics/dashboards/hr-analytics-full-set/">HR Analytics Full Set</a><a href="/analytics/">All Analytics</a><a href="{source}">Source</a></nav></header>
<div class="dashboard-shell"><aside class="filters"><div class="filter-head"><p class="eyebrow">Global controls</p><strong>Filter every view</strong></div><div class="filter"><label for="filter-period">Period</label><select id="filter-period"></select></div><div class="filter"><label for="filter-region">Region</label><select id="filter-region"></select></div><div class="filter"><label for="filter-store">Store</label><select id="filter-store"></select></div><div class="filter"><label for="filter-department">Department</label><select id="filter-department"></select></div><div class="filter"><label for="search">Search</label><input id="search" type="search" placeholder="Search visible records"></div><button class="clear-button" id="clear-filters" type="button">Reset controls</button></aside>
<main class="workspace"><section class="hero"><div><p class="eyebrow">HR Analytics Full Set / Live synthetic build</p><h1>{config["name"]}</h1><p>{config["description"]}</p></div><div class="provenance"><strong>Synthetic HR Demo Core</strong><span>Generated from scratch · no employer or real-person records</span></div></section><nav class="tabs" id="tabs" aria-label="Analytical views"></nav><section id="view"></section></main></div>
<div id="dashboard-data" hidden>{encoded}</div><script src="/analytics/dashboards/hr-analytics-full-set/shared/dashboard.js"></script><footer class="footer">Aizanoi Analytics · HR Analytics Full Set · Synthetic public data only.</footer></body></html>'''


def build(workbook: Path, public_root: Path):
    all_data = build_data(workbook)
    outputs = []
    for identifier, config in dashboard_configs().items():
        selected = {name: all_data[name] for name in config["datasets"]}
        if identifier == "hr-executive-board-current":
            selected = {
                name: [
                    row for row in rows
                    if not row.get("period") or str(row["period"]) == "Current" or str(row["period"]) >= "2024"
                ]
                for name, rows in selected.items()
            }
        filter_values = {name: sorted({str(row.get(name)) for rows in selected.values() for row in rows if row.get(name) not in (None, "", "nan", "NaT")}) for name in ["period", "region", "store", "department"]}
        payload = {"meta": {"id": identifier, "name": config["name"], "dataPolicy": "synthetic-only", "source": "Synthetic HR Demo Core"}, "filterFields": {"period": "period", "region": "region", "store": "store", "department": "department"}, "filters": filter_values, "views": config["views"], "datasets": selected}
        output = public_root / identifier / "index.html"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(html_document(identifier, config, payload), encoding="utf-8")
        outputs.append(str(output))
    return outputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--public-root", type=Path, default=PUBLIC_ROOT)
    args = parser.parse_args()
    outputs = build(args.workbook.resolve(), args.public_root.resolve())
    print(json.dumps({"outputs": outputs, "count": len(outputs)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

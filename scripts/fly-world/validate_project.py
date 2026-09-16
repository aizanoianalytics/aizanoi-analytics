#!/usr/bin/env python3
"""Preflight validator for the Fly House environment package.

This script deliberately has no Blender dependency. It validates the canonical scene
specification and third-party asset manifest before an operator spends time launching
Blender. By default, missing assets are reported as BLOCKED visual-approval items but
are not treated as a broken project. Use --strict-assets when preparing a visual-review
candidate; then every required asset slot must be configured and present locally.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT / "gelistirmeler" / "2026-09-16-fly-world-prototype"
SPEC_PATH = WORKSPACE / "scene_spec.json"
MANIFEST_PATH = WORKSPACE / "asset_manifest.json"
SUPPORTED_ASSET_EXTENSIONS = {".glb", ".gltf", ".fbx", ".obj"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Fly House inputs before Blender build")
    parser.add_argument(
        "--strict-assets",
        action="store_true",
        help="fail if any slot required for visual approval is not fully configured and present",
    )
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    return parser.parse_args()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def under(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate(strict_assets: bool) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    blockers: list[str] = []

    for path in (SPEC_PATH, MANIFEST_PATH):
        if not path.is_file():
            errors.append(f"missing required file: {path.relative_to(ROOT)}")

    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings, "blockers": blockers}

    try:
        spec = load_json(SPEC_PATH)
        manifest = load_json(MANIFEST_PATH)
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"JSON load failed: {exc}")
        return {"ok": False, "errors": errors, "warnings": warnings, "blockers": blockers}

    if spec.get("schemaVersion") != 1:
        errors.append("scene_spec.json schemaVersion must be 1")
    if manifest.get("schemaVersion") != 1:
        errors.append("asset_manifest.json schemaVersion must be 1")
    if spec.get("units") != "meters":
        errors.append("scene_spec.json must use metric units ('meters')")

    observer = spec.get("observer", {})
    required_observer_flags = {
        "mode": "ghost",
        "collides": False,
        "castsShadow": False,
        "visibleToFlySensors": False,
        "affectsWorldPhysics": False,
    }
    for key, expected in required_observer_flags.items():
        if observer.get(key) != expected:
            errors.append(f"observer.{key} must be {expected!r}")

    gates = spec.get("qualityGates", {})
    for key in (
        "mustMatchReferenceComposition",
        "mustUseAuthoredOrLicensedAssetsForHeroFurnitureBeforeVisualApproval",
        "proceduralProxiesAreBlockoutOnly",
        "mustRenderFiveBenchmarkViews",
        "mustSupportGhostObserver",
        "mustNotAddFlyUntilEnvironmentVisualApproval",
    ):
        if gates.get(key) is not True:
            errors.append(f"qualityGates.{key} must remain true")

    cameras = spec.get("previewCameras", [])
    camera_ids = [item.get("id") for item in cameras]
    if len(cameras) != 5 or len(set(camera_ids)) != 5 or None in camera_ids:
        errors.append("scene_spec.json must define exactly five uniquely named benchmark cameras")

    rooms = spec.get("rooms", [])
    room_ids = [room.get("id") for room in rooms]
    if len(room_ids) != len(set(room_ids)) or None in room_ids:
        errors.append("room ids must be present and unique")
    known_rooms = set(room_ids)

    slots = manifest.get("slots", [])
    slot_ids = [slot.get("id") for slot in slots]
    if len(slot_ids) != len(set(slot_ids)) or None in slot_ids:
        errors.append("asset slot ids must be present and unique")
    slots_by_id = {slot.get("id"): slot for slot in slots if slot.get("id")}

    heroes = spec.get("heroObjects", [])
    hero_ids = [hero.get("id") for hero in heroes]
    if len(hero_ids) != len(set(hero_ids)) or None in hero_ids:
        errors.append("hero object ids must be present and unique")

    for hero in heroes:
        hero_id = hero.get("id", "<unnamed>")
        if hero.get("room") not in known_rooms:
            errors.append(f"hero {hero_id!r} references unknown room {hero.get('room')!r}")
        slot_id = hero.get("assetSlot")
        if slot_id not in slots_by_id:
            errors.append(f"hero {hero_id!r} references unknown asset slot {slot_id!r}")
        for field in ("position", "rotationDeg", "size"):
            value = hero.get(field)
            if not isinstance(value, list) or len(value) != 3:
                errors.append(f"hero {hero_id!r}.{field} must contain three numbers")
        size = hero.get("size", [])
        if len(size) == 3 and any(not isinstance(value, (int, float)) or value <= 0 for value in size):
            errors.append(f"hero {hero_id!r}.size must contain positive numbers")

    policy = manifest.get("licensePolicy", {})
    allowed_licenses = set(policy.get("preferred", [])) | set(policy.get("allowedWithAttribution", []))
    if not allowed_licenses:
        errors.append("licensePolicy must declare at least one allowed license")

    asset_root_rel = manifest.get("assetRoot")
    if not asset_root_rel:
        errors.append("asset_manifest.json must define assetRoot")
        asset_root = WORKSPACE / "assets" / "source"
    else:
        asset_root = (ROOT / asset_root_rel).resolve()
        if not under(asset_root, ROOT):
            errors.append("assetRoot must stay inside the repository")

    configured_count = 0
    required_count = 0
    required_ready_count = 0

    for slot in slots:
        slot_id = slot.get("id", "<unnamed>")
        required = slot.get("requiredForVisualApproval") is True
        if required:
            required_count += 1

        local_path = slot.get("localPath")
        source = slot.get("source")
        configured = bool(local_path or source)
        ready = False

        if not configured:
            if required:
                blockers.append(f"required asset slot not configured: {slot_id}")
            continue

        configured_count += 1
        if not local_path or not isinstance(source, dict):
            errors.append(f"asset slot {slot_id!r} must configure localPath and source together")
            continue

        missing_source_fields = [
            key for key in ("url", "author", "license", "retrievedAt") if not source.get(key)
        ]
        if missing_source_fields:
            errors.append(
                f"asset slot {slot_id!r} source is missing: {', '.join(missing_source_fields)}"
            )

        license_id = source.get("license")
        if license_id and license_id not in allowed_licenses:
            errors.append(
                f"asset slot {slot_id!r} uses disallowed/unrecognized license {license_id!r}"
            )

        resolved = (ROOT / local_path).resolve()
        if not under(resolved, asset_root):
            errors.append(f"asset slot {slot_id!r} localPath must live under assetRoot")
        elif resolved.suffix.lower() not in SUPPORTED_ASSET_EXTENSIONS:
            errors.append(
                f"asset slot {slot_id!r} uses unsupported format {resolved.suffix or '<none>'}"
            )
        elif not resolved.is_file():
            message = f"configured asset file is missing: {slot_id} -> {local_path}"
            if required:
                blockers.append(message)
            else:
                warnings.append(message)
        elif not missing_source_fields and license_id in allowed_licenses:
            ready = True

        if required and ready:
            required_ready_count += 1

    if strict_assets and blockers:
        errors.extend(f"visual approval blocker: {message}" for message in blockers)

    result = {
        "ok": not errors,
        "strictAssets": strict_assets,
        "summary": {
            "rooms": len(rooms),
            "heroObjects": len(heroes),
            "assetSlots": len(slots),
            "configuredAssetSlots": configured_count,
            "requiredAssetSlots": required_count,
            "requiredAssetsReady": required_ready_count,
            "benchmarkCameras": len(cameras),
        },
        "visualApprovalReady": not blockers and required_count == required_ready_count,
        "errors": errors,
        "warnings": warnings,
        "blockers": blockers,
    }
    return result


def print_human(result: dict) -> None:
    summary = result.get("summary", {})
    print("Fly House preflight")
    print("-------------------")
    if summary:
        print(
            "rooms={rooms} heroes={heroObjects} assets={configuredAssetSlots}/{assetSlots} "
            "required={requiredAssetsReady}/{requiredAssetSlots} cameras={benchmarkCameras}".format(**summary)
        )
    for message in result.get("errors", []):
        print(f"ERROR   {message}")
    for message in result.get("warnings", []):
        print(f"WARN    {message}")
    for message in result.get("blockers", []):
        print(f"BLOCKED {message}")

    if result.get("ok"):
        if result.get("visualApprovalReady"):
            print("OK: project inputs are valid and required visual assets are ready.")
        else:
            print("OK: project structure is valid; visual approval remains blocked by missing required assets.")
    else:
        print("FAIL: fix the errors above before running the Blender pipeline.")


def main() -> int:
    args = parse_args()
    result = validate(args.strict_assets)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_human(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())

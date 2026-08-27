"""Aizanoi Full Pack merkezi üretim motoru.

Bu dosya dışarıdan tek giriş noktası olarak çalışır. Ağır üretim adımları
ayrı Python süreçlerinde koşar; böylece Excel üretiminden kalan RAM yükünün
dashboard ve panel üretimlerine taşınması engellenir.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from dashboard_paths import (
    ADMIN_DASHBOARD,
    AKADEMI_DASHBOARD,
    DASHBOARD_DIR,
    ICMAL_XLSX,
    HEDEFLER_DASHBOARD,
    IK_DASHBOARD,
    IK_DASHBOARD_2024,
    LOG_DIR,
    MAGAZA_DASHBOARD,
    MAGAZA_UYUM_DASHBOARD,
    PDKS_DASHBOARD,
    PERFORMANS_DASHBOARD,
    PRODUCTION_OUTPUTS,
    PROJECT_ROOT,
    PY_DIR,
    TURNOVER_DASHBOARD,
    ensure_dashboard_dir,
)


BASE_DIR = PROJECT_ROOT
SOURCE_DIR = PY_DIR
PIPELINE_ORDER = (
    "icmal",
    "dashboard",
    "admin",
    "magaza",
    "turnover",
    "uyum",
    "akademi",
    "performans",
    "hedefler",
    "pdks",
)
STAGE_DESCRIPTIONS = {
    "icmal": "Ana Excel veri seti ve kaynak sheet'leri üretiliyor",
    "dashboard": "İK E-Board dashboardları üretiliyor",
    "admin": "Detaylı statik admin paneli üretiliyor",
    "magaza": "Bölge müdürleri için mağaza takip paneli üretiliyor",
    "turnover": "Turnover analitik merkezi üretiliyor",
    "uyum": "Mağaza eğitim ve uyum skor kartı üretiliyor",
    "akademi": "Akademi eğitim, uyum ve planlama dashboardu üretiliyor",
    "performans": "Performans, işe alım ve turnover dashboardu üretiliyor",
    "hedefler": "2026 CEO ve şirket hedefleri dashboardu üretiliyor",
    "pdks": "PDKS çalışma zamanı takip dashboardu üretiliyor",
}
STAGE_OUTPUTS = {
    "dashboard": (IK_DASHBOARD, IK_DASHBOARD_2024),
    "admin": (ADMIN_DASHBOARD,),
    "magaza": (MAGAZA_DASHBOARD,),
    "turnover": (TURNOVER_DASHBOARD,),
    "uyum": (MAGAZA_UYUM_DASHBOARD,),
    "akademi": (AKADEMI_DASHBOARD,),
    "performans": (PERFORMANS_DASHBOARD,),
    "hedefler": (HEDEFLER_DASHBOARD,),
    "pdks": (PDKS_DASHBOARD,),
}
STAGE_PRIMARY_OUTPUT = {
    "dashboard": IK_DASHBOARD,
    "admin": ADMIN_DASHBOARD,
    "magaza": MAGAZA_DASHBOARD,
    "turnover": TURNOVER_DASHBOARD,
    "uyum": MAGAZA_UYUM_DASHBOARD,
    "akademi": AKADEMI_DASHBOARD,
    "performans": PERFORMANS_DASHBOARD,
    "hedefler": HEDEFLER_DASHBOARD,
    "pdks": PDKS_DASHBOARD,
}
STAGE_SCRIPTS = {
    "icmal": "hr_data_pipeline.py",
    "dashboard": "refresh_data.py",
    "admin": "generate_admin_panel.py",
    "magaza": "generate_magaza_takip_panel.py",
    "turnover": "generate_turnover_dashboard.py",
    "uyum": "generate_magaza_uyum_dashboard.py",
    "akademi": "generate_akademi_dashboard.py",
    "performans": "generate_performans_dashboard.py",
    "hedefler": "generate_hedefler_dashboard.py",
    "pdks": "generate_pdks_dashboard.py",
}
EVENT_PREFIX = "@@AIZANOI_PIPELINE@@"
LOCK_PATH = DASHBOARD_DIR / ".aizanoi_full_pack.lock"
PRODUCTION_STATE_PATH = LOG_DIR / "latest_production_state.json"
PRODUCTION_STATE_SCHEMA = 1


@dataclass(frozen=True)
class PipelineOptions:
    only: frozenset[str]
    skip: frozenset[str]
    emit_events: bool


@dataclass
class PipelineState:
    active_xlsx: Path | None = None


class PipelineError(RuntimeError):
    """Raised when a pipeline stage cannot safely continue."""


class PipelineRunLock:
    """Prevent two full-pack production runs from writing the same outputs."""

    def __init__(self, path: Path = LOCK_PATH) -> None:
        self.path = path
        self.handle = None

    def __enter__(self) -> "PipelineRunLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open("a+b")
        try:
            if sys.platform == "win32":
                import msvcrt

                self.handle.seek(0)
                try:
                    msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
                except OSError as exc:
                    details = self._existing_lock_text()
                    suffix = f" Detay: {details}" if details else ""
                    raise PipelineError(
                        "Başka bir Aizanoi Full Pack üretimi zaten çalışıyor. "
                        "Lütfen mevcut üretimin bitmesini bekleyin." + suffix
                    ) from exc
            else:
                import fcntl

                try:
                    fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                except OSError as exc:
                    details = self._existing_lock_text()
                    suffix = f" Detay: {details}" if details else ""
                    raise PipelineError(
                        "Başka bir Aizanoi Full Pack üretimi zaten çalışıyor. "
                        "Lütfen mevcut üretimin bitmesini bekleyin." + suffix
                    ) from exc

            self.handle.seek(0)
            self.handle.truncate()
            self.handle.write(
                f"pid={os.getpid()} started={datetime.now():%Y-%m-%d %H:%M:%S}\n".encode(
                    "utf-8"
                )
            )
            self.handle.flush()
            return self
        except Exception:
            with contextlib.suppress(Exception):
                self.handle.close()
            self.handle = None
            raise

    def _existing_lock_text(self) -> str:
        try:
            self.handle.seek(0)
            return self.handle.read(256).decode("utf-8", errors="replace").strip()
        except Exception:
            return ""

    def __exit__(self, exc_type, exc, tb) -> None:
        if not self.handle:
            return
        with contextlib.suppress(Exception):
            if sys.platform == "win32":
                import msvcrt

                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        with contextlib.suppress(Exception):
            self.handle.close()
        self.handle = None
        with contextlib.suppress(OSError):
            self.path.unlink()


def ensure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(
                encoding="utf-8",
                errors="replace",
                line_buffering=True,
                write_through=True,
            )


def log(message: str) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


def emit(options: PipelineOptions, event: str, key: str, message: str) -> None:
    if options.emit_events:
        safe_message = " ".join(str(message).splitlines()).replace("|", "/")
        print(f"{EVENT_PREFIX}|{event}|{key}|{safe_message}", flush=True)


def active_stage_keys(options: PipelineOptions) -> list[str]:
    return [
        key
        for key in PIPELINE_ORDER
        if (not options.only or key in options.only) and key not in options.skip
    ]


def newest_icmal() -> Path:
    candidates = sorted(
        DASHBOARD_DIR.glob("icmal_sorgu_sonuc*.xlsx"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise PipelineError("icmal_sorgu_sonuc*.xlsx bulunamadı veya üretilemedi.")
    return candidates[0]


def ensure_workbook(state: PipelineState, options: PipelineOptions) -> Path:
    if state.active_xlsx and state.active_xlsx.exists():
        return state.active_xlsx
    state.active_xlsx = newest_icmal()
    log(f"Aktif Excel seçildi: {state.active_xlsx.name}")
    emit(
        options,
        "ACTIVE_XLSX",
        "icmal",
        state.active_xlsx.relative_to(BASE_DIR).as_posix(),
    )
    return state.active_xlsx


def python_command() -> list[str]:
    return [sys.executable, "-B", "-u"]


def stage_command(key: str, state: PipelineState, options: PipelineOptions) -> list[str]:
    script = SOURCE_DIR / STAGE_SCRIPTS[key]
    if not script.exists():
        raise PipelineError(f"Üretim scripti bulunamadı: {script.relative_to(BASE_DIR)}")

    command = python_command() + [str(script)]
    if key == "hedefler":
        command.extend(
            [
                "--input",
                str(BASE_DIR / "2026_hedefler.xlsx"),
                "--output",
                str(HEDEFLER_DASHBOARD),
            ]
        )
    elif key in {
        "dashboard",
        "admin",
        "magaza",
        "turnover",
        "uyum",
        "akademi",
        "performans",
    }:
        command.extend(
            [
                "--xlsx",
                str(ensure_workbook(state, options)),
                "--output",
                str(STAGE_PRIMARY_OUTPUT[key]),
            ]
        )
        if key == "performans":
            command.extend(["--targets", str(BASE_DIR / "2026_hedefler.xlsx")])
    elif key == "pdks":
        command.extend(
            [
                "--input",
                str(BASE_DIR / "1-11 pdks.xlsx"),
                "--fiili",
                str(BASE_DIR / "fiili_list.xlsx"),
                "--output",
                str(PDKS_DASHBOARD),
            ]
        )
    return command


def run_child_process(key: str, state: PipelineState, options: PipelineOptions) -> None:
    command = stage_command(key, state, options)
    log("Komut: " + " ".join(f'"{part}"' if " " in part else part for part in command))

    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    process = subprocess.Popen(
        command,
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=env,
    )

    assert process.stdout is not None
    for line in process.stdout:
        print(line.rstrip("\n"), flush=True)

    return_code = process.wait()
    if return_code != 0:
        raise PipelineError(f"{key} adımı hata kodu ile bitti: {return_code}")

    if key == "icmal":
        state.active_xlsx = newest_icmal()
        log(f"Aktif Excel üretildi: {state.active_xlsx.name}")
        emit(
            options,
            "ACTIVE_XLSX",
            "icmal",
            state.active_xlsx.relative_to(BASE_DIR).as_posix(),
        )


def validate_stage_outputs(active_keys: list[str], state: PipelineState) -> None:
    expected: list[Path] = []
    if "icmal" in active_keys:
        expected.append(ensure_workbook(state, PipelineOptions(frozenset(), frozenset(), False)))
    for key in active_keys:
        expected.extend(STAGE_OUTPUTS.get(key, ()))

    for path in expected:
        path = path.resolve()
        if not path.exists():
            raise PipelineError(f"Beklenen çıktı bulunamadı: {path}")
        if path.stat().st_size <= 1024:
            raise PipelineError(f"Çıktı beklenenden küçük görünüyor: {path.name}")
        if path.suffix.lower() == ".xlsx":
            if not zipfile.is_zipfile(path):
                raise PipelineError(f"XLSX çıktı geçersiz veya yarım kalmış: {path.name}")
            with zipfile.ZipFile(path, "r") as archive:
                required = {"xl/workbook.xml", "[Content_Types].xml"}
                missing = required.difference(archive.namelist())
                if missing:
                    raise PipelineError(
                        f"XLSX paketinde zorunlu dosyalar eksik: {path.name} -> {sorted(missing)}"
                    )
        elif path.suffix.lower() == ".html":
            tail_size = min(path.stat().st_size, 64 * 1024)
            with path.open("rb") as handle:
                handle.seek(-tail_size, os.SEEK_END)
                tail = handle.read().lower()
            if b"</html>" not in tail:
                raise PipelineError(f"HTML çıktı yarım kalmış görünüyor: {path.name}")
        try:
            display_path = path.relative_to(BASE_DIR)
        except ValueError:
            display_path = path
        log(f"KONTROL OK: {display_path} ({path.stat().st_size / (1024 * 1024):,.1f} MB)")


def sha256_file(path: Path, *, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def write_production_state(run_id: str, started_at: datetime, state: PipelineState) -> None:
    """Record the exact artifact set created by one successful full run."""

    if state.active_xlsx is None:
        raise PipelineError("Tam üretim koşusunda aktif Excel dosyası belirlenemedi.")
    if state.active_xlsx.resolve() != ICMAL_XLSX.resolve():
        raise PipelineError(
            "Tam üretim standart çıktı adıyla tamamlanmadı: "
            f"{state.active_xlsx.name}. Kilitli Excel dosyasını kapatıp yeniden çalıştırın."
        )

    files: dict[str, dict[str, int | str]] = {}
    for output_path in PRODUCTION_OUTPUTS:
        resolved = output_path.resolve()
        if not resolved.exists():
            raise PipelineError(f"Üretim koşusu kaydı için çıktı bulunamadı: {resolved}")
        relative_path = resolved.relative_to(BASE_DIR.resolve()).as_posix()
        files[relative_path] = {
            "size": resolved.stat().st_size,
            "sha256": sha256_file(resolved),
        }

    completed_at = datetime.now(timezone.utc)
    payload = {
        "schema_version": PRODUCTION_STATE_SCHEMA,
        "run_id": run_id,
        "started_at_utc": started_at.astimezone(timezone.utc).isoformat(),
        "completed_at_utc": completed_at.isoformat(),
        "output_count": len(files),
        "files": files,
    }

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = PRODUCTION_STATE_PATH.with_name(
        f".{PRODUCTION_STATE_PATH.name}.{os.getpid()}.tmp"
    )
    try:
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(PRODUCTION_STATE_PATH)
    finally:
        with contextlib.suppress(OSError):
            temp_path.unlink()

    log(
        "Tam koşu bütünlük kaydı yazıldı: "
        f"{PRODUCTION_STATE_PATH.relative_to(BASE_DIR)} ({run_id})"
    )


def run_pipeline(options: PipelineOptions) -> PipelineState:
    ensure_utf8_stdio()
    ensure_dashboard_dir()
    active_keys = active_stage_keys(options)
    if not active_keys:
        raise PipelineError("Çalıştırılacak üretim adımı kalmadı.")

    state = PipelineState()
    run_started_at = datetime.now(timezone.utc)
    run_id = f"{run_started_at.strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    total_started = time.perf_counter()
    log("Aizanoi Full Pack merkezi üretim motoru başladı.")
    log(f"Üretim koşusu kimliği: {run_id}")
    log(f"Üretim çıktı klasörü: {DASHBOARD_DIR}")
    log("Tek giriş noktası aktif; ağır adımlar izole Python süreçlerinde çalışacak.")
    emit(options, "PIPELINE_START", "all", "Merkezi üretim motoru başladı")

    for index, key in enumerate(active_keys, start=1):
        description = STAGE_DESCRIPTIONS[key]
        log(f"BAŞLADI [{index}/{len(active_keys)}]: {key} - {description}")
        emit(options, "STEP_START", key, description)
        started = time.perf_counter()
        try:
            run_child_process(key, state, options)
        except Exception as exc:
            elapsed = time.perf_counter() - started
            log(f"HATA [{key}] ({elapsed:,.1f} sn): {exc}")
            emit(options, "STEP_ERROR", key, str(exc))
            raise
        elapsed = time.perf_counter() - started
        log(f"TAMAMLANDI [{index}/{len(active_keys)}]: {key} ({elapsed:,.1f} sn)")
        emit(options, "STEP_DONE", key, f"{elapsed:,.1f} sn")

    validate_stage_outputs(active_keys, state)
    if tuple(active_keys) == PIPELINE_ORDER:
        write_production_state(run_id, run_started_at, state)
        emit(options, "PRODUCTION_STATE", "all", run_id)
    else:
        log(
            "Kısmi üretim tamamlandı; tam koşu bütünlük kaydı yenilenmedi. "
            "Self-test için tam üretim çalıştırılmalıdır."
        )
    total_elapsed = time.perf_counter() - total_started
    log(f"Tam üretim hattı bitti. Toplam süre: {total_elapsed:,.1f} sn")
    emit(options, "PIPELINE_DONE", "all", f"{total_elapsed:,.1f} sn")
    return state


def parse_args() -> PipelineOptions:
    parser = argparse.ArgumentParser(
        description="Aizanoi Full Pack: tek giriş noktasından tam üretim hattını çalıştırır."
    )
    parser.add_argument(
        "--skip",
        nargs="*",
        default=[],
        choices=PIPELINE_ORDER,
        help="Atlanacak adımlar. Örnek: --skip admin pdks",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        default=[],
        choices=PIPELINE_ORDER,
        help="Yalnızca belirtilen adımları çalıştırır. Örnek: --only dashboard admin",
    )
    parser.add_argument(
        "--emit-events",
        action="store_true",
        help="EXE arayüzü için makine-okunur ilerleme olayları yayınlar.",
    )
    args = parser.parse_args()
    return PipelineOptions(
        only=frozenset(args.only or []),
        skip=frozenset(args.skip or []),
        emit_events=bool(args.emit_events),
    )


def main() -> int:
    ensure_utf8_stdio()
    options = parse_args()
    try:
        with PipelineRunLock():
            run_pipeline(options)
    except KeyboardInterrupt:
        log("Üretim kullanıcı tarafından durduruldu.")
        return 130
    except Exception as exc:
        log(f"Tam üretim hattı hata ile durdu: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

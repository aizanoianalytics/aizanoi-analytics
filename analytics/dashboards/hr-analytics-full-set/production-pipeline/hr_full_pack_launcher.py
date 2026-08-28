from __future__ import annotations

import ctypes
import hashlib
import json
import math
import os
import queue
import random
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path

if "--self-test" not in sys.argv:
    from tkinter import messagebox
    import tkinter as tk
    from tkinter import ttk
else:
    # The diagnostic path must still explain a missing GUI runtime instead of
    # failing during module import before the checks can run.
    messagebox = None
    tk = None
    ttk = None


APP_TITLE = "Aizanoi Full Pack"
AUTO_START = "--no-auto" not in sys.argv
SELF_TEST = "--self-test" in sys.argv
ONLINE_REPAIR_ALLOWED = (
    "--allow-online-repair" in sys.argv
    or os.environ.get("AIZANOI_ALLOW_ONLINE_REPAIR", "").strip() == "1"
)


def enable_high_dpi() -> None:
    """Keep the Tk canvas and text crisp on scaled Windows displays."""

    if sys.platform != "win32":
        return
    try:
        # PER_MONITOR_AWARE_V2 on modern Windows versions.
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except (AttributeError, OSError):
        pass


def app_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    source_dir = Path(__file__).resolve().parent
    if source_dir.name.casefold() == "py" and source_dir.parent.name.casefold() == "dashboardlar":
        return source_dir.parents[1]
    return source_dir


BASE_DIR = app_base_dir()
OUTPUT_DIR = BASE_DIR / "dashboardlar"
PY_SOURCE_DIR = OUTPUT_DIR / "py"
LOG_DIR = OUTPUT_DIR / "logs"
BUNDLED_PYTHON = BASE_DIR / "runtime" / "python" / "python.exe"
BUNDLED_RUNTIME_DIR = BUNDLED_PYTHON.parent

CORE_INPUTS = [
    "icmal kayıt dosyası.xlsx",
    "fiili_list.xlsx",
    "Ayrilanlar_Listesi.xlsx",
    "Calisan_Bilgisi_Raporu.xlsx",
    "eski_kaynak.xlsx",
    "key_tablosu.xlsx",
    "enocta_tum_veri.xlsx",
    "gelisim_yolculuk.xlsx",
    "performans_magaza_verileri.xlsx",
    "kumule_karne.xlsx",
    "magaza_hedef_ciro.xlsx",
    "yurtdisi_veri_icmal.xlsx",
    "isgucu_kaybi.xlsx",
    "izin_yuku.xlsx",
    "cezalar.xlsx",
    "norm_fiili_kadro.xlsx",
    "dogum_listesi.xlsx",
    "cikis_sebepleri.xlsx",
    "R2_new_gen.xlsx",
    "ise_alma_suresi.xlsx",
    "check_list.xlsx",
    "isg_veri.xlsx",
    "zorunlu_egitim.xlsx",
    "sinav_puanlari.xlsx",
    "1-11 pdks.xlsx",
    "2026_hedefler.xlsx",
]

REQUIRED_SCRIPTS = [
    "run_full_pipeline.py",
    "hr_data_pipeline.py",
    "refresh_data.py",
    "generate_admin_panel.py",
    "generate_magaza_takip_panel.py",
    "generate_magaza_uyum_dashboard.py",
    "dashboard_build_common.py",
    "dashboard_analytics_v2.py",
    "dashboard_template_common.py",
    "dashboard_paths.py",
    "academy_dashboard_template.py",
    "performance_dashboard_template.py",
    "generate_akademi_dashboard.py",
    "generate_performans_dashboard.py",
    "hedefler_dashboard_common.py",
    "hedefler_dashboard_template.py",
    "generate_hedefler_dashboard.py",
    "generate_pdks_dashboard.py",
    "turnover_analytics_common.py",
    "turnover_dashboard_template.py",
    "generate_turnover_dashboard.py",
]

EXPECTED_OUTPUTS = [
    "icmal_sorgu_sonuc.xlsx",
    "ik_takip_dashboard.html",
    "ik_takip_dashboard_2024_gunumuz.html",
    "ERD_P_admin.html",
    "magaza_takip_dosya.html",
    "magaza_uyum_dashboard.html",
    "akademi_dashboard.html",
    "performans_dashboard.html",
    "hedefler_dashboard.html",
    "pdks_takip_dashboard.html",
    "turnover_dashboard.html",
]

UI_STEPS = [
    "Üretim başlatılıyor",
    "Python ve paketler hazırlanıyor",
    "Excel kaynakları ve kilitler kontrol ediliyor",
    "icmal_sorgu_sonuc.xlsx üretiliyor",
    "Aktif Excel dosyası seçiliyor",
    "İK E-Board dashboardları üretiliyor",
    "ERD_P_admin.html üretiliyor",
    "magaza_takip_dosya.html üretiliyor",
    "turnover_dashboard.html üretiliyor",
    "magaza_uyum_dashboard.html üretiliyor",
    "akademi_dashboard.html üretiliyor",
    "performans_dashboard.html üretiliyor",
    "hedefler_dashboard.html üretiliyor",
    "pdks_takip_dashboard.html üretiliyor",
    "Çıktı dosyaları kontrol ediliyor",
    "Türkçe karakter ve üretim bütünlüğü kontrol ediliyor",
    "Üretim tamamlanıyor",
]
PIPELINE_EVENT_PREFIX = "@@AIZANOI_PIPELINE@@"
BAD_QUESTION_RUN = "?" * 3
TEXT_QUALITY_OUTPUTS = [name for name in EXPECTED_OUTPUTS if name.lower().endswith(".html")]
REQUIREMENTS_FILE = PY_SOURCE_DIR / "requirements-dashboard.txt"
PRODUCTION_STATE_FILE = LOG_DIR / "latest_production_state.json"
PRODUCTION_STATE_SCHEMA = 1
RUNTIME_IMPORTS = ("numpy", "pandas", "openpyxl", "sklearn", "statsmodels")
MIN_PYTHON_VERSION = (3, 11)
PYTHON_WINGET_ID = "Python.Python.3.11"


class PipelineError(RuntimeError):
    pass


class BundledRuntimeError(PipelineError):
    """The shipped offline Python runtime exists but cannot be trusted or used."""


def _is_bundled_python_command(cmd: list[str]) -> bool:
    if not cmd:
        return False
    try:
        return Path(cmd[0]).resolve() == BUNDLED_PYTHON.resolve()
    except OSError:
        return False


def _zone_identifier(path: Path) -> str:
    """Return Mark-of-the-Web metadata when Windows exposed it as an ADS."""

    if sys.platform != "win32" or not path.exists():
        return ""
    try:
        return Path(f"{path}:Zone.Identifier").read_text(
            encoding="utf-8",
            errors="replace",
        )
    except OSError:
        return ""


def _bundled_runtime_issues() -> list[str]:
    required = [
        BUNDLED_RUNTIME_DIR / "python.exe",
        BUNDLED_RUNTIME_DIR / "python311.dll",
        BUNDLED_RUNTIME_DIR / "python311.zip",
        BUNDLED_RUNTIME_DIR / "vcruntime140.dll",
        BUNDLED_RUNTIME_DIR / "vcruntime140_1.dll",
        BUNDLED_RUNTIME_DIR / "_tkinter.pyd",
        BUNDLED_RUNTIME_DIR / "tcl86t.dll",
        BUNDLED_RUNTIME_DIR / "tk86t.dll",
        BUNDLED_RUNTIME_DIR / "Lib" / "tkinter" / "__init__.py",
        BUNDLED_RUNTIME_DIR / "tcl" / "tcl8.6" / "init.tcl",
        BUNDLED_RUNTIME_DIR / "tcl" / "tk8.6" / "tk.tcl",
        BUNDLED_RUNTIME_DIR / "Lib" / "site-packages" / "numpy" / "__init__.py",
        BUNDLED_RUNTIME_DIR / "Lib" / "site-packages" / "pandas" / "__init__.py",
        BUNDLED_RUNTIME_DIR / "Lib" / "site-packages" / "openpyxl" / "__init__.py",
        BUNDLED_RUNTIME_DIR / "Lib" / "site-packages" / "sklearn" / "__init__.py",
        BUNDLED_RUNTIME_DIR / "Lib" / "site-packages" / "statsmodels" / "__init__.py",
        BUNDLED_RUNTIME_DIR
        / "Lib"
        / "site-packages"
        / "sklearn"
        / ".libs"
        / "vcomp140.dll",
    ]
    issues = [
        f"eksik dosya: {path.relative_to(BASE_DIR)}"
        for path in required
        if not path.is_file()
    ]
    numpy_dlls = list(
        (
            BUNDLED_RUNTIME_DIR
            / "Lib"
            / "site-packages"
            / "numpy.libs"
        ).glob("msvcp140-*.dll")
    )
    if not numpy_dlls:
        issues.append(
            "eksik dosya: runtime/python/Lib/site-packages/"
            "numpy.libs/msvcp140-*.dll"
        )

    marked = []
    motw_targets = (
        BUNDLED_PYTHON,
        BUNDLED_RUNTIME_DIR / "_tkinter.pyd",
        BUNDLED_RUNTIME_DIR / "tcl86t.dll",
        BUNDLED_RUNTIME_DIR / "tk86t.dll",
        BUNDLED_RUNTIME_DIR
        / "Lib"
        / "site-packages"
        / "sklearn"
        / ".libs"
        / "vcomp140.dll",
        *numpy_dlls[:1],
    )
    for path in motw_targets:
        marker = _zone_identifier(path)
        if "ZoneId=3" in marker or "ZoneId=4" in marker:
            marked.append(str(path.relative_to(BASE_DIR)))
    if marked:
        issues.append(
            "Windows internet güvenlik işareti (Mark-of-the-Web) bulundu: "
            + ", ".join(marked)
        )
    return issues


def _bundled_runtime_help(detail: str) -> str:
    return (
        "Paketli çevrimdışı Python ortamı kullanılamadı. "
        f"Teknik ayrıntı: {detail}. "
        "ZIP'i ağ/posta konumundan çalıştırmayın. ZIP dosyasını çıkarmadan önce "
        "Özellikler > Engellemeyi kaldır seçeneğini uygulayın, ardından paketi "
        "C:\\Aizanoi_Full_Pack gibi kısa ve yerel bir klasöre yeniden çıkarın. "
        "Antivirüs karantinasında python.exe, .pyd veya .dll bulunup bulunmadığını "
        "kontrol edin. Kurumsal politika engelliyorsa EXE ve runtime\\python klasörü "
        "için Bilgi Teknolojileri biriminden izin alın. Paketli ortam bozukken "
        "güvenlik nedeniyle otomatik internet kurulumu yapılmadı."
    )


def _python_candidates() -> list[list[str]]:
    env_python = os.environ.get("AIZANOI_PYTHON")
    candidates: list[list[str]] = []
    if env_python:
        candidates.append([env_python])
    candidates.append([str(BUNDLED_PYTHON)])
    if not getattr(sys, "frozen", False):
        candidates.append([sys.executable])
    candidates.extend(
        [
            [str(BASE_DIR / ".venv" / "Scripts" / "python.exe")],
            [str(BASE_DIR / "venv" / "Scripts" / "python.exe")],
        ]
    )
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.extend(
            [
                [str(Path(local_app_data) / "Programs" / "Python" / "Python311" / "python.exe")],
                [str(Path(local_app_data) / "Programs" / "Python" / "Python312" / "python.exe")],
                [str(Path(local_app_data) / "Programs" / "Python" / "Python313" / "python.exe")],
            ]
        )
    program_files = os.environ.get("ProgramFiles")
    if program_files:
        candidates.extend(
            [
                [str(Path(program_files) / "Python311" / "python.exe")],
                [str(Path(program_files) / "Python312" / "python.exe")],
                [str(Path(program_files) / "Python313" / "python.exe")],
            ]
        )
    python_path = shutil.which("python")
    if python_path:
        candidates.append([python_path])
    py_path = shutil.which("py")
    if py_path:
        candidates.extend([[py_path, "-3.11"], [py_path, "-3"]])

    unique: list[list[str]] = []
    seen: set[tuple[str, ...]] = set()
    for cmd in candidates:
        key = tuple(part.casefold() for part in cmd)
        if key not in seen:
            seen.add(key)
            unique.append(cmd)
    return unique


def _probe_python_command(cmd: list[str]) -> tuple[bool, str]:
    exe = cmd[0]
    if not (Path(exe).exists() or shutil.which(exe)):
        return False, "komut bulunamadı"
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    try:
        result = subprocess.run(
            [
                *cmd,
                "-c",
                (
                    "import struct,sys;"
                    "print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}|"
                    "{struct.calcsize(\"P\")*8}')"
                ),
            ],
            cwd=str(BASE_DIR),
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
    output = (result.stdout or "").strip()
    if result.returncode != 0:
        return False, output or f"çıkış kodu {result.returncode}"
    try:
        version_text, bits_text = output.split("|", 1)
        major, minor, *_ = (int(part) for part in version_text.split("."))
        bits = int(bits_text)
    except (TypeError, ValueError):
        return False, f"beklenmeyen sürüm yanıtı: {output}"
    if (major, minor) < MIN_PYTHON_VERSION:
        return False, f"Python {version_text}; en az 3.11 gerekli"
    if bits != 64:
        return False, f"{bits}-bit Python; büyük workbook için 64-bit gerekli"
    return True, f"Python {version_text} ({bits}-bit)"


def find_python_command() -> list[str]:
    rejected: list[str] = []
    for cmd in _python_candidates():
        is_bundled = _is_bundled_python_command(cmd)
        if is_bundled:
            runtime_issues = _bundled_runtime_issues()
            if runtime_issues:
                detail = "; ".join(runtime_issues)
                if not ONLINE_REPAIR_ALLOWED:
                    raise BundledRuntimeError(_bundled_runtime_help(detail))
                rejected.append(f"{' '.join(cmd)}: {detail}")
                continue
        usable, detail = _probe_python_command(cmd)
        if usable:
            return cmd
        if is_bundled and BUNDLED_PYTHON.exists():
            if not ONLINE_REPAIR_ALLOWED:
                raise BundledRuntimeError(_bundled_runtime_help(detail))
            rejected.append(f"{' '.join(cmd)}: {detail}")
            continue
        if detail != "komut bulunamadı":
            rejected.append(f"{' '.join(cmd)}: {detail}")
    suffix = ""
    if rejected:
        suffix = " Bulunan ancak uygun olmayan yorumlayıcılar: " + " | ".join(rejected)
    raise PipelineError(
        "64-bit Python 3.11 veya üzeri bulunamadı. "
        "AIZANOI_PYTHON ortam değişkeniyle uygun python.exe yolu verilebilir."
        + suffix
    )


def _utf8_subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")
    return env


def _stream_process(
    cmd: list[str],
    *,
    logger,
    timeout_seconds: int,
) -> int:
    logger("Çalıştırılıyor: " + " ".join(cmd))
    process = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        env=_utf8_subprocess_env(),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    started = time.monotonic()
    assert process.stdout is not None
    output_queue: queue.Queue[str | None] = queue.Queue()

    def pump_output() -> None:
        assert process.stdout is not None
        for output_line in process.stdout:
            output_queue.put(output_line.rstrip())
        output_queue.put(None)

    reader = threading.Thread(target=pump_output, daemon=True)
    reader.start()
    stream_closed = False
    while True:
        try:
            line = output_queue.get(timeout=0.2)
            if line is None:
                stream_closed = True
            elif line:
                logger(line)
        except queue.Empty:
            pass
        if process.poll() is not None and stream_closed:
            return int(process.returncode or 0)
        if time.monotonic() - started > timeout_seconds:
            process.kill()
            process.wait()
            raise PipelineError(
                f"Kurulum zaman aşımına uğradı ({timeout_seconds // 60} dakika)."
            )


def install_python_with_winget(logger) -> list[str]:
    winget = shutil.which("winget")
    if not winget:
        raise PipelineError(
            "Python bulunamadı ve Windows Package Manager (winget) kullanılamıyor. "
            "Python 3.11 64-bit'i python.org üzerinden kurup 'Add Python to PATH' "
            "seçeneğini açın."
        )
    logger("Python bulunamadı. Python 3.11 kullanıcı kapsamına kuruluyor.")
    command = [
        winget,
        "install",
        "--id",
        PYTHON_WINGET_ID,
        "--exact",
        "--scope",
        "user",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity",
    ]
    return_code = _stream_process(command, logger=logger, timeout_seconds=20 * 60)
    if return_code != 0:
        raise PipelineError(
            f"Python kurulumu tamamlanamadı. winget çıkış kodu: {return_code}"
        )
    time.sleep(2)
    python_cmd = find_python_command()
    usable, detail = _probe_python_command(python_cmd)
    if not usable:
        raise PipelineError(f"Kurulan Python doğrulanamadı: {detail}")
    logger("Python kurulumu doğrulandı: " + detail)
    return python_cmd


def ensure_python_command(logger) -> list[str]:
    try:
        return find_python_command()
    except BundledRuntimeError:
        raise
    except PipelineError as exc:
        logger(str(exc))
        if not ONLINE_REPAIR_ALLOWED:
            raise PipelineError(
                f"{exc} Otomatik çevrimiçi onarım kapalıdır. Devir paketindeki "
                "runtime\\python klasörünü geri yükleyin. Yalnız bilinçli onarım "
                "için --allow-online-repair kullanılabilir."
            ) from exc
        return install_python_with_winget(logger)


def _runtime_requirements() -> list[tuple[str, str, str]]:
    import_names = {
        "numpy": "numpy",
        "pandas": "pandas",
        "openpyxl": "openpyxl",
        "scikit-learn": "sklearn",
        "statsmodels": "statsmodels",
    }
    requirements: list[tuple[str, str, str]] = []
    for raw_line in REQUIREMENTS_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "==" not in line:
            raise PipelineError(
                f"Bağımlılık sürümü sabitlenmemiş: {REQUIREMENTS_FILE.name}: {line}"
            )
        distribution, expected = (part.strip() for part in line.split("==", 1))
        import_name = import_names.get(distribution.casefold())
        if not import_name:
            raise PipelineError(f"Bilinmeyen bağımlılık adı: {distribution}")
        requirements.append((import_name, distribution, expected))
    if {item[0] for item in requirements} != set(RUNTIME_IMPORTS):
        raise PipelineError(
            f"{REQUIREMENTS_FILE.name} beklenen beş paketi eksiksiz tanımlamıyor."
        )
    return requirements


def _runtime_package_issues(
    python_cmd: list[str],
) -> list[tuple[str, str, str]]:
    requirement_literal = repr(_runtime_requirements())
    probe = subprocess.run(
        [
            *python_cmd,
            "-c",
            (
                "import importlib.metadata as md,importlib.util;"
                f"items={requirement_literal};"
                "\nfor imp,dist,expected in items:"
                "\n actual='MISSING' if importlib.util.find_spec(imp) is None else md.version(dist)"
                "\n if actual != expected: print(f'{dist}|{expected}|{actual}')"
            ),
        ],
        cwd=str(BASE_DIR),
        env=_utf8_subprocess_env(),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=45,
        check=False,
    )
    if probe.returncode != 0:
        raise PipelineError(
            "Python paket envanteri okunamadı: " + (probe.stdout or "").strip()
        )
    issues: list[tuple[str, str, str]] = []
    for line in (probe.stdout or "").splitlines():
        if not line.strip():
            continue
        try:
            distribution, expected, actual = line.strip().split("|", 2)
        except ValueError as exc:
            raise PipelineError(f"Beklenmeyen paket envanteri satırı: {line}") from exc
        issues.append((distribution, expected, actual))
    return issues


def _python_uses_virtualenv(python_cmd: list[str]) -> bool:
    result = subprocess.run(
        [
            *python_cmd,
            "-c",
            "import sys; print('1' if sys.prefix != sys.base_prefix else '0')",
        ],
        cwd=str(BASE_DIR),
        env=_utf8_subprocess_env(),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    return result.returncode == 0 and (result.stdout or "").strip() == "1"


def _runtime_smoke_test(python_cmd: list[str]) -> tuple[bool, str]:
    """Load and execute native modules that the real pipeline relies on."""

    smoke_code = """
import warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import openpyxl
import sklearn
import statsmodels
import tkinter
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from scipy.linalg import solve

tk_root = tkinter.Tk()
tk_root.withdraw()
tk_root.update_idletasks()
tk_patchlevel = tk_root.tk.eval("info patchlevel")
tk_root.destroy()
x = np.array([[0.0, 0.0], [0.1, 0.2], [1.0, 1.0], [1.2, 1.1]])
y = np.array([0.0, 0.1, 1.0, 1.1])
KMeans(n_clusters=2, n_init=1, random_state=0).fit(x)
RandomForestRegressor(n_estimators=2, random_state=0, n_jobs=1).fit(x, y)
solve(np.array([[2.0, 0.0], [0.0, 2.0]]), np.array([2.0, 4.0]))
pd.DataFrame({"a": [1, 2]}).sum()
print(
    "RUNTIME_SMOKE_OK|"
    + "|".join(
        [
            np.__version__,
            pd.__version__,
            openpyxl.__version__,
            sklearn.__version__,
            statsmodels.__version__,
            "Tcl-" + tk_patchlevel,
        ]
    )
)
"""
    env = _utf8_subprocess_env()
    env.setdefault("OMP_NUM_THREADS", "1")
    env.setdefault("OPENBLAS_NUM_THREADS", "1")
    result = subprocess.run(
        [*python_cmd, "-c", smoke_code],
        cwd=str(BASE_DIR),
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
        check=False,
    )
    output = (result.stdout or "").strip()
    return (
        result.returncode == 0 and "RUNTIME_SMOKE_OK|" in output,
        output or f"çıkış kodu {result.returncode}",
    )


def ensure_runtime_packages(
    python_cmd: list[str],
    *,
    logger,
    install_missing: bool,
) -> None:
    if not REQUIREMENTS_FILE.exists():
        raise PipelineError(f"Bağımlılık dosyası bulunamadı: {REQUIREMENTS_FILE}")
    is_bundled = _is_bundled_python_command(python_cmd)
    issues = _runtime_package_issues(python_cmd)
    if issues and is_bundled:
        details = ", ".join(
            f"{name} beklenen={expected} mevcut={actual}"
            for name, expected, actual in issues
        )
        raise BundledRuntimeError(_bundled_runtime_help(details))
    if issues and not install_missing:
        details = ", ".join(
            f"{name} beklenen={expected} mevcut={actual}"
            for name, expected, actual in issues
        )
        raise PipelineError("Python paket sözleşmesi uyumsuz: " + details)
    if issues:
        logger(
            "Eksik veya sürümü farklı Python paketleri bulundu: "
            + ", ".join(
                f"{name} ({actual} -> {expected})"
                for name, expected, actual in issues
            )
        )
        pip_check = subprocess.run(
            [*python_cmd, "-m", "pip", "--version"],
            cwd=str(BASE_DIR),
            env=_utf8_subprocess_env(),
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=45,
            check=False,
        )
        if pip_check.returncode != 0:
            logger("pip bulunamadı; Python ensurepip ile hazırlanıyor.")
            ensurepip_code = _stream_process(
                [*python_cmd, "-m", "ensurepip", "--upgrade"],
                logger=logger,
                timeout_seconds=10 * 60,
            )
            if ensurepip_code != 0:
                raise PipelineError(
                    f"pip kurulamadı. ensurepip çıkış kodu: {ensurepip_code}"
                )
        install_command = [
            *python_cmd,
            "-m",
            "pip",
            "install",
            "--no-input",
            "--prefer-binary",
            "--progress-bar",
            "off",
            "-r",
            str(REQUIREMENTS_FILE),
        ]
        if not _python_uses_virtualenv(python_cmd):
            install_command.insert(len(python_cmd) + 3, "--user")
        install_code = _stream_process(
            install_command,
            logger=logger,
            timeout_seconds=30 * 60,
        )
        if install_code != 0:
            raise PipelineError(
                f"Python paket kurulumu tamamlanamadı. pip çıkış kodu: {install_code}"
            )
    remaining_issues = _runtime_package_issues(python_cmd)
    if remaining_issues:
        details = ", ".join(
            f"{name} beklenen={expected} mevcut={actual}"
            for name, expected, actual in remaining_issues
        )
        raise PipelineError("Paket kurulumu sonrası sürüm uyumsuzluğu: " + details)
    smoke_ok, smoke_output = _runtime_smoke_test(python_cmd)
    if smoke_ok:
        logger(
            "Paketli bilimsel hesap motoru hazır: "
            + smoke_output.splitlines()[-1]
        )
    elif is_bundled:
        raise BundledRuntimeError(_bundled_runtime_help(smoke_output))
    else:
        raise PipelineError(
            "Python paket/DLL doğrulaması başarısız. "
            f"Teknik ayrıntı: {smoke_output}"
        )


def prune_log_history(
    *,
    keep_per_group: int = 5,
    protected: set[Path] | None = None,
) -> None:
    """Keep production diagnostics useful without growing the transfer folder forever."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    protected_resolved = {
        path.resolve()
        for path in (protected or set())
        if path is not None
    }
    groups = (
        [
            path
            for path in LOG_DIR.glob("aizanoi_full_pack_*.log")
            if not path.name.startswith("aizanoi_full_pack_self_test_")
        ],
        list(LOG_DIR.glob("aizanoi_full_pack_self_test_*.log")),
    )
    for paths in groups:
        ordered = sorted(
            paths,
            key=lambda path: (path.stat().st_mtime_ns, path.name),
            reverse=True,
        )
        retained = 0
        for path in ordered:
            if path.resolve() in protected_resolved:
                retained += 1
                continue
            if retained < keep_per_group:
                retained += 1
                continue
            try:
                path.unlink()
            except OSError:
                pass


def write_self_test_log(lines: list[str]) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"aizanoi_full_pack_self_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    prune_log_history(protected={log_path})
    return log_path


def _print_self_test_lines(lines: list[str]) -> None:
    if sys.stdout is None:
        return
    try:
        for line in lines:
            print(line, flush=True)
    except (OSError, UnicodeError):
        pass


def validate_output_artifact(path: Path) -> None:
    if not path.exists() or path.stat().st_size <= 1024:
        raise PipelineError(f"Çıktı eksik veya beklenenden küçük: {path.name}")
    if path.suffix.lower() == ".xlsx":
        if not zipfile.is_zipfile(path):
            raise PipelineError(f"XLSX geçersiz veya yarım kalmış: {path.name}")
        with zipfile.ZipFile(path, "r") as archive:
            required = {"xl/workbook.xml", "[Content_Types].xml"}
            missing = required.difference(archive.namelist())
            if missing:
                raise PipelineError(f"XLSX paket içeriği eksik: {path.name}")
    elif path.suffix.lower() == ".html":
        tail_size = min(path.stat().st_size, 64 * 1024)
        with path.open("rb") as handle:
            handle.seek(-tail_size, os.SEEK_END)
            if b"</html>" not in handle.read().lower():
                raise PipelineError(f"HTML yarım kalmış: {path.name}")


def validate_text_quality_artifact(path: Path) -> None:
    """Reject replacement artifacts that should never reach a dashboard."""

    text = path.read_text(encoding="utf-8")
    if "\ufffd" in text:
        raise PipelineError(f"Replacement character bulundu: {path.name}")
    question_run_count = text.count(BAD_QUESTION_RUN)
    if question_run_count:
        raise PipelineError(
            f"Tekrarlı soru işareti artığı bulundu: {path.name} "
            f"({question_run_count} eşleşme)"
        )


def validate_hedefler_contract(path: Path) -> None:
    """Validate the annual target view without executing browser JavaScript."""

    text = path.read_text(encoding="utf-8")
    marker = '<script id="dashboard-data" type="application/json">'
    start = text.find(marker)
    end = text.find("</script>", start + len(marker))
    if start < 0 or end < 0:
        raise PipelineError(f"Hedefler veri sözleşmesi bulunamadı: {path.name}")
    try:
        payload = json.loads(text[start + len(marker) : end])
    except json.JSONDecodeError as exc:
        raise PipelineError(f"Hedefler veri sözleşmesi geçersiz JSON: {path.name}") from exc

    meta = payload.get("meta") if isinstance(payload, dict) else None
    periods = payload.get("periods") if isinstance(payload, dict) else None
    scopes = payload.get("scopes") if isinstance(payload, dict) else None
    if not isinstance(meta, dict) or meta.get("selected_period") != "all":
        raise PipelineError("Hedefler dashboardu varsayılan Tüm Yıl görünümünde değil.")
    period_keys = {
        str(item.get("key"))
        for item in periods or []
        if isinstance(item, dict)
    }
    if period_keys != {"q1", "q2", "q3", "q4", "all"}:
        raise PipelineError(
            "Hedefler dönem sözleşmesi uyuşmuyor; Q1-Q4 ve Tüm Yıl bekleniyor."
        )
    if not isinstance(scopes, list) or len(scopes) != 2:
        raise PipelineError("Hedefler kapsam sözleşmesi uyuşmuyor.")
    for scope in scopes:
        if not isinstance(scope, dict) or "all" not in (scope.get("available_periods") or []):
            raise PipelineError("Hedefler kapsamındaki Tüm Yıl görünümü kullanılamıyor.")
        for row in scope.get("rows") or []:
            if not isinstance(row, dict):
                continue
            metric_key = str(row.get("metric") or "").casefold()
            if "marka performansı" in metric_key and row.get("category") != "Büyüme & Finansal Performans":
                raise PipelineError(
                    "Marka performansı göstergesi Büyüme & Finansal Performans "
                    "kategorisinde değil."
                )


def sha256_file(path: Path, *, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def validate_production_coherence() -> dict[str, object]:
    """Verify that every published output belongs to one successful full run."""

    if not PRODUCTION_STATE_FILE.exists():
        raise PipelineError(
            "Tam üretim koşusu kaydı bulunamadı. Aizanoi Full Pack ile bir kez tam üretim "
            "çalıştırın."
        )
    try:
        state = json.loads(PRODUCTION_STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PipelineError(
            f"Tam üretim koşusu kaydı okunamadı: {PRODUCTION_STATE_FILE}"
        ) from exc

    if not isinstance(state, dict):
        raise PipelineError("Tam üretim koşusu kaydının kök yapısı geçersiz.")
    if state.get("schema_version") != PRODUCTION_STATE_SCHEMA:
        raise PipelineError(
            "Tam üretim koşusu kayıt sürümü uyumsuz: "
            f"{state.get('schema_version')!r}"
        )
    run_id = str(state.get("run_id") or "").strip()
    if not run_id:
        raise PipelineError("Tam üretim koşusu kaydında run_id bulunamadı.")

    files = state.get("files")
    if not isinstance(files, dict):
        raise PipelineError("Tam üretim koşusu kaydındaki dosya listesi geçersiz.")

    expected_paths = {
        (OUTPUT_DIR / name).resolve().relative_to(BASE_DIR.resolve()).as_posix(): (
            OUTPUT_DIR / name
        )
        for name in EXPECTED_OUTPUTS
    }
    recorded_paths = set(files)
    if recorded_paths != set(expected_paths):
        missing = sorted(set(expected_paths).difference(recorded_paths))
        extra = sorted(recorded_paths.difference(expected_paths))
        details = []
        if missing:
            details.append("eksik=" + ", ".join(missing))
        if extra:
            details.append("fazla=" + ", ".join(extra))
        raise PipelineError(
            "Tam üretim koşusu dosya sözleşmesi uyuşmuyor: " + "; ".join(details)
        )

    if state.get("output_count") != len(expected_paths):
        raise PipelineError(
            "Tam üretim koşusu çıktı sayısı uyuşmuyor: "
            f"beklenen={len(expected_paths)}, kayıt={state.get('output_count')!r}"
        )

    for relative_path, output_path in expected_paths.items():
        record = files.get(relative_path)
        if not isinstance(record, dict):
            raise PipelineError(f"Üretim koşusu dosya kaydı geçersiz: {relative_path}")
        validate_output_artifact(output_path)
        actual_size = output_path.stat().st_size
        if record.get("size") != actual_size:
            raise PipelineError(
                "Farklı üretim koşusuna ait veya sonradan değişmiş çıktı bulundu: "
                f"{output_path.name} (boyut kayıt={record.get('size')!r}, "
                f"mevcut={actual_size})"
            )
        expected_hash = str(record.get("sha256") or "").casefold()
        actual_hash = sha256_file(output_path)
        if len(expected_hash) != 64 or actual_hash != expected_hash:
            raise PipelineError(
                "Farklı üretim koşusuna ait veya sonradan değişmiş çıktı bulundu: "
                f"{output_path.name} (SHA-256 uyuşmuyor)"
            )

    return state


def run_self_test() -> int:
    lines: list[str] = []
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    def add(message: str) -> None:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"[{stamp}] {message}")

    try:
        add(f"{APP_TITLE} self-test başladı.")
        add(f"Çalışma klasörü: {BASE_DIR}")
        add(f"Çıktı klasörü: {OUTPUT_DIR}")
        python_cmd = find_python_command()
        add("Python komutu: " + " ".join(python_cmd))
        if _is_bundled_python_command(python_cmd):
            add(
                "Paketli çevrimdışı Python kullanılıyor; "
                "winget/pip/internet fallback'i kapalı."
            )
        usable, python_detail = _probe_python_command(python_cmd)
        if not usable:
            raise PipelineError(f"Python doğrulaması başarısız: {python_detail}")
        add(python_detail)

        missing_scripts = [name for name in REQUIRED_SCRIPTS if not (PY_SOURCE_DIR / name).exists()]
        if missing_scripts:
            raise PipelineError("Eksik script: " + ", ".join(missing_scripts))
        add("Script kontrolü başarılı.")
        if not REQUIREMENTS_FILE.exists():
            raise PipelineError(f"Bağımlılık dosyası bulunamadı: {REQUIREMENTS_FILE}")
        add(f"Bağımlılık sözleşmesi mevcut: {REQUIREMENTS_FILE.name}")

        missing_inputs = [name for name in CORE_INPUTS if not (BASE_DIR / name).exists()]
        if missing_inputs:
            add("UYARI: Eksik görünen kaynak dosyalar: " + ", ".join(missing_inputs))
        else:
            add("Ana kaynak dosyalar mevcut.")

        ensure_runtime_packages(
            python_cmd,
            logger=add,
            install_missing=False,
        )

        existing_outputs = [name for name in EXPECTED_OUTPUTS if (OUTPUT_DIR / name).exists()]
        add("Mevcut çıktı sayısı: " + str(len(existing_outputs)) + " / " + str(len(EXPECTED_OUTPUTS)))
        for name in existing_outputs:
            output_path = OUTPUT_DIR / name
            validate_output_artifact(output_path)
            size_mb = output_path.stat().st_size / (1024 * 1024)
            add(f"OK çıktı: {name} ({size_mb:,.1f} MB)")

        for name in TEXT_QUALITY_OUTPUTS:
            output_path = OUTPUT_DIR / name
            if output_path.exists():
                validate_text_quality_artifact(output_path)
                add(f"OK metin: {name}")

        hedefler_output = OUTPUT_DIR / "hedefler_dashboard.html"
        if hedefler_output.exists():
            validate_hedefler_contract(hedefler_output)
            add("OK hedefler sözleşmesi: Q1-Q4 + Tüm Yıl")

        production_state = validate_production_coherence()
        add(
            "OK tek üretim koşusu: "
            f"{production_state.get('run_id')} · "
            f"{production_state.get('completed_at_utc')}"
        )

        add("Self-test başarılı.")
        write_self_test_log(lines)
        _print_self_test_lines(lines)
        return 0
    except Exception as exc:
        add(f"HATA: {exc}")
        write_self_test_log(lines)
        _print_self_test_lines(lines)
        return 1


class CampScene:
    def __init__(self, canvas: tk.Canvas) -> None:
        self.canvas = canvas
        self.rng = random.Random(42)
        self.stars: list[dict[str, float]] = []
        self.raindrops: list[dict[str, float]] = []
        self.fire_particles: list[dict[str, float]] = []
        self.smoke_particles: list[dict[str, float]] = []
        self.frame = 0
        self.last_size: tuple[int, int] = (0, 0)
        self._reset_particles(1120, 720)

    def _reset_particles(self, width: int, height: int) -> None:
        self.stars = [
            {
                "x": self.rng.uniform(width * 0.42, width - 26),
                "y": self.rng.uniform(22, height * 0.36),
                "r": self.rng.uniform(0.7, 1.8),
                "phase": self.rng.uniform(0, math.pi * 2),
            }
            for _ in range(70)
        ]
        self.raindrops = [
            {
                "x": self.rng.uniform(0, width),
                "y": self.rng.uniform(-height, height),
                "length": self.rng.uniform(9, 26),
                "speed": self.rng.uniform(7, 18),
                "wind": self.rng.uniform(2.5, 7.5),
                "alpha": self.rng.uniform(0.24, 0.74),
            }
            for _ in range(220)
        ]
        self.fire_particles = [self._new_fire_particle(initial=True) for _ in range(150)]
        self.smoke_particles = [self._new_smoke_particle(initial=True) for _ in range(34)]

    def _new_fire_particle(self, initial: bool = False) -> dict[str, float]:
        return {
            "x": self.rng.uniform(-22, 22),
            "y": self.rng.uniform(-86, 14) if initial else self.rng.uniform(-8, 12),
            "vx": self.rng.uniform(-0.55, 0.55),
            "vy": -self.rng.uniform(1.25, 3.25),
            "life": self.rng.uniform(0.25, 1.0) if initial else 1.0,
            "decay": self.rng.uniform(0.012, 0.026),
            "size": self.rng.uniform(6.0, 16.0),
            "heat": self.rng.random(),
            "phase": self.rng.uniform(0, math.tau),
        }

    def _new_smoke_particle(self, initial: bool = False) -> dict[str, float]:
        return {
            "x": self.rng.uniform(-18, 18),
            "y": self.rng.uniform(-120, -24) if initial else self.rng.uniform(-36, -18),
            "vx": self.rng.uniform(-0.28, 0.28),
            "vy": -self.rng.uniform(0.36, 0.92),
            "life": self.rng.uniform(0.2, 1.0) if initial else 1.0,
            "decay": self.rng.uniform(0.004, 0.009),
            "size": self.rng.uniform(10.0, 24.0),
            "phase": self.rng.uniform(0, math.tau),
        }

    @staticmethod
    def _hex_interp(a: str, b: str, t: float) -> str:
        a = a.lstrip("#")
        b = b.lstrip("#")
        ar, ag, ab = int(a[0:2], 16), int(a[2:4], 16), int(a[4:6], 16)
        br, bg, bb = int(b[0:2], 16), int(b[2:4], 16), int(b[4:6], 16)
        return f"#{int(ar + (br - ar) * t):02x}{int(ag + (bg - ag) * t):02x}{int(ab + (bb - ab) * t):02x}"

    def _draw_aizanoi_child(self, x: float, y: float, scale: float) -> None:
        c = self.canvas
        s = scale

        def polygon(points: list[tuple[float, float]], **kwargs: object) -> None:
            coords = [coord for dx, dy in points for coord in (x + dx * s, y + dy * s)]
            c.create_polygon(*coords, **kwargs)

        # Ground contact: a dark wool blanket and a soft shadow keep the figure
        # visually anchored instead of appearing to float above the camp floor.
        c.create_oval(
            x - 86 * s,
            y + 62 * s,
            x + 90 * s,
            y + 96 * s,
            fill="#06080c",
            outline="",
            stipple="gray50",
            tags="scene",
        )
        c.create_oval(
            x - 70 * s,
            y + 64 * s,
            x + 74 * s,
            y + 91 * s,
            fill="#1d2027",
            outline="#2d3138",
            stipple="gray75",
            tags="scene",
        )

        # A natural crossed-leg pose. The far leg is drawn first so the nearer
        # knee, shin and sneaker have believable depth rather than two flat lines.
        trouser_far = "#061b43"
        trouser = "#082b63"
        trouser_lit = "#114e9e"
        sock = "#d6e8fb"
        sock_shadow = "#98b9dc"
        shoe = "#111c30"
        shoe_edge = "#54739a"

        polygon(
            [(7, 43), (38, 47), (67, 61), (58, 77), (16, 72), (-1, 61)],
            fill=trouser_far,
            outline="#041127",
            tags="scene",
        )
        polygon(
            [(38, 61), (64, 68), (56, 80), (28, 80), (20, 71)],
            fill=sock_shadow,
            outline="",
            tags="scene",
        )
        polygon(
            [(28, 77), (57, 75), (73, 81), (66, 89), (35, 91), (20, 85)],
            fill=shoe,
            outline=shoe_edge,
            tags="scene",
        )
        c.create_line(x + 35 * s, y + 86 * s, x + 65 * s, y + 86 * s, fill="#c7d8ee", width=max(1, int(2 * s)), tags="scene")

        polygon(
            [(-8, 44), (-42, 49), (-72, 63), (-57, 79), (-12, 73), (9, 61)],
            fill=trouser,
            outline="#041127",
            tags="scene",
        )
        polygon(
            [(-43, 62), (-67, 69), (-57, 82), (-29, 81), (-20, 72)],
            fill=sock,
            outline="",
            tags="scene",
        )
        polygon(
            [(-28, 78), (-58, 76), (-76, 82), (-67, 90), (-36, 92), (-20, 85)],
            fill=shoe,
            outline=shoe_edge,
            tags="scene",
        )
        c.create_line(x - 67 * s, y + 87 * s, x - 37 * s, y + 87 * s, fill="#c7d8ee", width=max(1, int(2 * s)), tags="scene")
        c.create_line(x - 60 * s, y + 61 * s, x - 17 * s, y + 68 * s, fill=trouser_lit, width=max(1, int(2 * s)), tags="scene")
        c.create_line(x + 17 * s, y + 61 * s, x + 57 * s, y + 68 * s, fill="#0b397b", width=max(1, int(2 * s)), tags="scene")

        # Jersey silhouette: a navy foundation with restrained blue panels and
        # thin white piping, closer to a real football shirt than a striped block.
        jersey_navy = "#071f4a"
        jersey_blue = "#1056ac"
        jersey_blue_lit = "#1b67bd"
        jersey_white = "#eaf4ff"
        jersey_shadow = "#03122d"
        polygon(
            [(-34, -8), (34, -8), (47, 4), (45, 47), (30, 62), (-30, 62), (-45, 47), (-47, 4)],
            fill=jersey_navy,
            outline=jersey_shadow,
            tags="scene",
        )
        polygon([(-29, -6), (-11, -6), (-13, 57), (-33, 57), (-42, 45), (-39, 8)], fill=jersey_blue, outline="", tags="scene")
        polygon([(-4, -7), (12, -7), (14, 57), (-7, 57)], fill=jersey_blue_lit, outline="", tags="scene")
        polygon([(20, -6), (34, -5), (41, 7), (39, 45), (28, 58), (18, 58)], fill=jersey_blue, outline="", tags="scene")
        c.create_line(x - 15 * s, y - 5 * s, x - 18 * s, y + 57 * s, fill=jersey_white, width=max(1, int(2 * s)), tags="scene")
        c.create_line(x + 16 * s, y - 5 * s, x + 19 * s, y + 57 * s, fill=jersey_white, width=max(1, int(2 * s)), tags="scene")
        c.create_line(x - 39 * s, y + 51 * s, x + 39 * s, y + 51 * s, fill="#7eb6f0", width=max(1, int(2 * s)), tags="scene")

        # Sleeves and forearms rest naturally over the bent knees.
        skin = "#c78c66"
        skin_light = "#e1aa84"
        polygon([(-35, -5), (-50, 4), (-53, 24), (-39, 27), (-27, 8)], fill=jersey_blue, outline=jersey_shadow, tags="scene")
        polygon([(35, -5), (50, 4), (53, 24), (39, 27), (27, 8)], fill=jersey_blue, outline=jersey_shadow, tags="scene")
        c.create_line(x - 47 * s, y + 23 * s, x - 58 * s, y + 49 * s, fill=skin, width=max(2, int(8 * s)), tags="scene")
        c.create_line(x + 47 * s, y + 23 * s, x + 58 * s, y + 49 * s, fill=skin, width=max(2, int(8 * s)), tags="scene")
        c.create_oval(x - 65 * s, y + 44 * s, x - 52 * s, y + 56 * s, fill=skin_light, outline="", tags="scene")
        c.create_oval(x + 52 * s, y + 44 * s, x + 65 * s, y + 56 * s, fill=skin_light, outline="", tags="scene")
        c.create_line(x - 52 * s, y + 24 * s, x - 42 * s, y + 25 * s, fill=jersey_white, width=max(1, int(2 * s)), tags="scene")
        c.create_line(x + 42 * s, y + 25 * s, x + 52 * s, y + 24 * s, fill=jersey_white, width=max(1, int(2 * s)), tags="scene")

        # Warm firelight quietly catches the right shoulder and side seam.
        c.create_line(x + 39 * s, y + 5 * s, x + 34 * s, y + 47 * s, fill="#5d82bd", width=max(1, int(2 * s)), tags="scene")

        # Readable jersey lettering.
        c.create_text(
            x,
            y + 9 * s,
            text="AIZANOI",
            fill="#0f172a",
            font=("Segoe UI", max(7, int(9 * s)), "bold"),
            tags="scene",
        )
        c.create_text(
            x,
            y + 8 * s,
            text="AIZANOI",
            fill="#f8fafc",
            font=("Segoe UI", max(7, int(9 * s)), "bold"),
            tags="scene",
        )
        c.create_text(
            x + 1 * s,
            y + 35 * s,
            text="10",
            fill="#0f172a",
            font=("Segoe UI", max(18, int(31 * s)), "bold"),
            tags="scene",
        )
        c.create_text(
            x,
            y + 34 * s,
            text="10",
            fill="#f8fafc",
            font=("Segoe UI", max(18, int(31 * s)), "bold"),
            tags="scene",
        )

        # Neck, head and tousled hair from behind. The hair silhouette is kept
        # soft and asymmetric so it reads as a child rather than a helmet.
        c.create_rectangle(x - 9 * s, y - 22 * s, x + 9 * s, y - 6 * s, fill=skin, outline="", tags="scene")
        c.create_oval(x - 21 * s, y - 62 * s, x + 21 * s, y - 17 * s, fill="#d29973", outline="", tags="scene")
        c.create_arc(x + 9 * s, y - 56 * s, x + 22 * s, y - 21 * s, start=270, extent=120, outline="#e6ad84", width=max(1, int(2 * s)), tags="scene")
        hair_color = "#10131d"
        polygon(
            [(-22, -32), (-24, -50), (-16, -61), (-7, -67), (3, -65), (11, -70), (21, -60), (24, -46), (19, -30), (9, -34), (0, -31), (-10, -34)],
            fill=hair_color,
            outline="#070b12",
            tags="scene",
        )
        for i, (dx, dy, length) in enumerate([(-16, -53, 8), (-9, -60, 10), (0, -62, 11), (9, -62, 10), (17, -54, 7)]):
            c.create_line(
                x + dx * s,
                y + dy * s,
                x + (dx + (i - 2) * 1.6) * s,
                y + (dy - length) * s,
                fill="#20283a",
                width=max(1, int(2 * s)),
                tags="scene",
            )

        # A small, low-contrast ball nods to the supplied football reference
        # without competing with the progress panel or fire.
        bx, by = x - 89 * s, y + 68 * s
        c.create_oval(bx - 13 * s, by - 13 * s, bx + 13 * s, by + 13 * s, fill="#d6dce6", outline="#59697c", tags="scene")
        c.create_polygon(bx, by - 5 * s, bx + 5 * s, by - 1 * s, bx + 3 * s, by + 5 * s, bx - 3 * s, by + 5 * s, bx - 5 * s, by - 1 * s, fill="#425167", outline="", tags="scene")
        c.create_arc(bx - 10 * s, by - 10 * s, bx + 10 * s, by + 10 * s, start=23, extent=118, outline="#68788c", width=1, tags="scene")

    def draw(self) -> None:
        c = self.canvas
        width = max(c.winfo_width(), 900)
        height = max(c.winfo_height(), 620)
        if abs(width - self.last_size[0]) > 80 or abs(height - self.last_size[1]) > 70:
            self.last_size = (width, height)
            self._reset_particles(width, height)
        self.frame += 1
        c.delete("scene")

        # Deep night sky with a faint star band, inspired by the HTML canvas references.
        for i in range(0, height, 5):
            t = i / height
            color = self._hex_interp("#020511", "#12223a", min(1, t * 1.10))
            c.create_rectangle(0, i, width, i + 5, fill=color, outline="", tags="scene")

        band_y = height * 0.23 + math.sin(self.frame / 180) * 4
        for i in range(9):
            x0 = width * (0.40 + i * 0.055)
            y0 = band_y + i * 8
            c.create_oval(
                x0 - 170,
                y0 - 28,
                x0 + 220,
                y0 + 34,
                fill="#22365a",
                outline="",
                stipple="gray75",
                tags="scene",
            )
        for i in range(42):
            x = width * (0.43 + (i % 14) * 0.038) + math.sin(i) * 14
            y = height * 0.17 + (i // 14) * 28 + math.sin(self.frame / 90 + i) * 2
            c.create_oval(x - 1, y - 1, x + 1, y + 1, fill="#e0ecff", outline="", tags="scene")

        # Cinematic right-side moon glow and tiny stars.
        moon_x, moon_y = width * 0.80, height * 0.16
        for r, color in [(190, "#0b1c33"), (138, "#122943"), (86, "#1d3859")]:
            c.create_oval(moon_x - r, moon_y - r, moon_x + r, moon_y + r, fill=color, outline="", stipple="gray75", tags="scene")
        c.create_oval(moon_x - 28, moon_y - 28, moon_x + 28, moon_y + 28, fill="#d8e7f2", outline="", tags="scene")
        c.create_oval(moon_x - 13, moon_y - 31, moon_x + 38, moon_y + 20, fill="#10213a", outline="", tags="scene")
        for star in self.stars:
            pulse = 0.45 + 0.55 * abs(math.sin(self.frame / 35 + star["phase"]))
            r = star["r"] * pulse
            c.create_oval(star["x"] - r, star["y"] - r, star["x"] + r, star["y"] + r, fill="#dbeafe", outline="", tags="scene")

        # Soft clouds and storm bands.
        cloud_shift = math.sin(self.frame / 120) * 16
        for x, y, scale in [(120, 84, 1.1), (width * 0.50, 70, 1.4), (width - 260, 100, 1.18)]:
            for k in range(5):
                c.create_oval(
                    x + cloud_shift + k * 34 * scale,
                    y + math.sin((self.frame + k * 9) / 80) * 3,
                    x + cloud_shift + (k * 34 + 76) * scale,
                    y + 34 * scale,
                    fill="#111c30",
                    outline="",
                    stipple="gray75" if k % 2 else "",
                    tags="scene",
                )
        for i in range(6):
            y = 54 + i * 24 + math.sin(self.frame / 70 + i) * 4
            c.create_line(width * 0.36, y, width, y + 14, fill="#17243a", width=2, tags="scene")

        horizon = height * 0.54
        lake_top = height * 0.56
        ground_top = height * 0.72

        # Far mountains behind the city.
        c.create_polygon(
            width * 0.42,
            horizon + 18,
            width * 0.54,
            horizon - 62,
            width * 0.66,
            horizon + 12,
            width * 0.78,
            horizon - 78,
            width * 0.94,
            horizon + 16,
            width,
            horizon - 30,
            width,
            horizon + 38,
            width * 0.42,
            horizon + 38,
            fill="#081524",
            outline="",
            tags="scene",
        )
        c.create_polygon(
            width * 0.48,
            horizon + 28,
            width * 0.62,
            horizon - 34,
            width * 0.74,
            horizon + 20,
            width * 0.86,
            horizon - 44,
            width,
            horizon + 18,
            width,
            horizon + 44,
            width * 0.48,
            horizon + 44,
            fill="#0b1b2b",
            outline="",
            tags="scene",
        )

        # Distant city skyline and reflections. The city sits behind the right-side lake view.
        city_base = horizon + 10
        city_x0 = width * 0.54
        buildings = [
            (0, 78), (24, 122), (52, 66), (82, 152), (118, 94), (150, 130),
            (186, 74), (218, 138), (254, 92), (286, 62), (320, 108), (352, 86),
            (386, 118), (420, 74),
        ]
        for bx, bh in buildings:
            x0 = city_x0 + bx
            bw = 18 + (bx % 4) * 4
            face = "#152946" if bh > 100 else "#12223a"
            c.create_rectangle(x0, city_base - bh, x0 + bw, city_base, fill=face, outline="#1b3354", tags="scene")
            if bh > 110:
                c.create_polygon(
                    x0 + bw * 0.50,
                    city_base - bh - 15,
                    x0 + bw * 0.18,
                    city_base - bh,
                    x0 + bw * 0.82,
                    city_base - bh,
                    fill="#0e1b2e",
                    outline="",
                    tags="scene",
                )
            for wy in range(int(city_base - bh + 14), int(city_base - 8), 18):
                if (wy + bx + self.frame // 20) % 3 != 0:
                    light = "#ffd27a" if (wy + bx) % 4 else "#9fd8ff"
                    c.create_rectangle(x0 + 4, wy, x0 + bw - 5, wy + 4, fill=light, outline="", tags="scene")
            c.create_rectangle(x0, city_base, x0 + bw, city_base + bh * 0.34, fill="#244061", outline="", stipple="gray75", tags="scene")
            if bx % 54 == 0:
                c.create_line(x0 + bw / 2, city_base, x0 + bw / 2, city_base + bh * 0.52, fill="#d79645", width=1, tags="scene")
        c.create_line(city_x0 - 18, city_base + 2, min(width - 18, city_x0 + 420), city_base + 2, fill="#315073", width=2, tags="scene")

        # Forest layers.
        def pine(x: float, base: float, size: float, color: str, sway: float) -> None:
            trunk_w = size * 0.10
            c.create_rectangle(x - trunk_w, base - size * 0.22, x + trunk_w, base, fill="#172010", outline="", tags="scene")
            for idx, ratio in enumerate([1.0, 0.78, 0.55]):
                y = base - size * (0.24 + idx * 0.24)
                top = y - size * 0.38 * ratio
                half = size * 0.28 * ratio
                sx = math.sin(self.frame / 70 + x / 50) * sway
                c.create_polygon(x + sx, top, x - half, y, x + half, y, fill=color, outline="", tags="scene")

        for layer, color, size, count, base_offset, sway in [
            (0, "#0b1724", 92, 18, -6, 1.2),
            (1, "#0d221f", 124, 15, 8, 1.6),
            (2, "#10251a", 158, 12, 24, 2.0),
        ]:
            step = width / (count - 1)
            for i in range(count):
                x = i * step + (layer * 31) % 80
                pine(x, horizon + base_offset + (i % 3) * 5, size * (0.82 + (i % 4) * 0.07), color, sway)
        for i in range(8):
            y = horizon + 28 + i * 14
            c.create_line(width * 0.40, y, width, y + math.sin(self.frame / 60 + i) * 8, fill="#cbd5e1", width=1, stipple="gray75", tags="scene")

        # Lake and waves.
        for i in range(0, int(ground_top + 38 - lake_top), 5):
            t = i / max(1, ground_top + 38 - lake_top)
            color = self._hex_interp("#0e2036", "#142d3e", t)
            c.create_rectangle(0, lake_top + i, width, lake_top + i + 5, fill=color, outline="", tags="scene")
        c.create_rectangle(width * 0.48, lake_top, width, ground_top + 38, fill="#15344d", outline="", stipple="gray75", tags="scene")
        for i in range(22):
            y = lake_top + 10 + i * 9
            wave = math.sin((self.frame / 18) + i) * 20
            c.create_line(0, y, width, y + math.sin(i) * 2, fill="#183550", width=1, tags="scene")
            c.create_line(width * 0.52 + wave, y + 2, width * 0.90 + wave, y + 2, fill="#3a7b9a", width=1, tags="scene")
        for i in range(22):
            x = width * (0.56 + i * 0.022)
            shimmer = math.sin(self.frame / 20 + i) * 9
            c.create_line(x + shimmer, lake_top + 18, x + shimmer * 0.45, ground_top - 6, fill="#3d6682", width=1, tags="scene")

        # Fire reflection on lake.
        fire_x = width * 0.70
        fire_y = ground_top + 8
        for i in range(5):
            c.create_oval(
                fire_x - 15 - i * 8,
                lake_top + 26 + i * 15,
                fire_x + 15 + i * 8,
                lake_top + 33 + i * 15,
                fill="#8b4c27",
                outline="",
                stipple="gray75",
                tags="scene",
            )

        # Ground.
        c.create_rectangle(0, ground_top, width, height, fill="#101413", outline="", tags="scene")
        c.create_polygon(
            width * 0.80,
            ground_top + 70,
            width * 0.90,
            ground_top + 2,
            width * 0.98,
            ground_top + 70,
            fill="#18130f",
            outline="#2e2418",
            tags="scene",
        )
        c.create_polygon(
            width * 0.84,
            ground_top + 68,
            width * 0.90,
            ground_top + 22,
            width * 0.95,
            ground_top + 68,
            fill="#5a351d",
            outline="",
            stipple="gray50",
            tags="scene",
        )
        c.create_oval(fire_x - 122, fire_y - 30, fire_x + 124, fire_y + 76, fill="#2b2418", outline="", tags="scene")
        c.create_oval(fire_x - 82, fire_y - 18, fire_x + 84, fire_y + 50, fill="#4a311d", outline="", stipple="gray50", tags="scene")

        # A small signature detail: a child in an Aizanoi #10 jersey sitting by the fire.
        child_scale = max(0.86, min(1.12, width / 1120))
        self._draw_aizanoi_child(fire_x - 142 * child_scale, fire_y - 7 * child_scale, child_scale)

        # Stones and logs.
        for a in range(0, 360, 24):
            rx = fire_x + math.cos(math.radians(a)) * 62
            ry = fire_y + math.sin(math.radians(a)) * 24 + 10
            c.create_oval(rx - 9, ry - 6, rx + 9, ry + 7, fill="#767169", outline="#46443e", tags="scene")
        for dx, dy, rot in [(-42, 36, -1), (18, 38, 1), (-10, 47, 0), (34, 30, -1)]:
            c.create_line(fire_x + dx - 32, fire_y + dy, fire_x + dx + 34, fire_y + dy + rot * 7, fill="#764624", width=10, tags="scene")
            c.create_line(fire_x + dx - 26, fire_y + dy, fire_x + dx + 28, fire_y + dy + rot * 7, fill="#2b170d", width=1, tags="scene")

        # Fire glow, smoke and particle flames.
        flicker = 0.97 + 0.025 * math.sin(self.frame / 5.0) + 0.018 * math.sin(self.frame / 2.7)
        for r, color, stipple in [
            (74 * flicker, "#24130d", "gray75"),
            (54 * flicker, "#542511", "gray75"),
            (35 * flicker, "#9a3412", "gray50"),
        ]:
            c.create_oval(
                fire_x - r,
                fire_y - r * 0.62,
                fire_x + r,
                fire_y + r * 0.56,
                fill=color,
                outline="",
                stipple=stipple,
                tags="scene",
            )

        # Smoke, behind the flame. It is intentionally subtle so the fire remains clean.
        for p in self.smoke_particles:
            p["x"] += p["vx"] + math.sin(self.frame / 35 + p["phase"]) * 0.12
            p["y"] += p["vy"]
            p["size"] *= 1.004
            p["life"] -= p["decay"]
            if p["life"] <= 0 or p["y"] < -160:
                p.update(self._new_smoke_particle(initial=False))
            alpha_style = "gray75" if p["life"] < 0.55 else "gray50"
            r = p["size"]
            sx = fire_x + p["x"]
            sy = fire_y - 12 + p["y"]
            c.create_oval(
                sx - r * 1.15,
                sy - r * 0.72,
                sx + r * 1.15,
                sy + r * 0.72,
                fill="#6b7280",
                outline="",
                stipple=alpha_style,
                tags="scene",
            )

        # Add a few fresh flame particles each frame, similar to the HTML canvas reference.
        for _ in range(3):
            if len(self.fire_particles) < 150:
                self.fire_particles.append(self._new_fire_particle(initial=False))

        particle_palette = [
            "#fff1a8",
            "#ffd166",
            "#ff9f1c",
            "#ff6b1a",
            "#dc2f16",
            "#8f1d14",
        ]
        for p in self.fire_particles:
            p["x"] += p["vx"] + math.sin(self.frame / 8 + p["phase"] + p["y"] * 0.08) * 0.20
            p["y"] += p["vy"]
            p["vy"] -= 0.018
            p["vx"] *= 0.988
            p["life"] -= p["decay"]
            p["size"] *= 0.992
            if p["life"] <= 0 or p["y"] < -104 or p["size"] < 1.8:
                p.update(self._new_fire_particle(initial=False))
            life = max(0.0, min(1.0, p["life"]))
            idx = min(len(particle_palette) - 1, int((1.0 - life) * len(particle_palette)))
            color = particle_palette[idx]
            stipple = "" if life > 0.72 else ("gray75" if life > 0.45 else "gray50")
            r = max(1.2, p["size"] * (0.48 + life * 0.36))
            sx = fire_x + p["x"]
            sy = fire_y - 22 + p["y"]
            c.create_oval(sx - r, sy - r, sx + r, sy + r, fill=color, outline="", stipple=stipple, tags="scene")
            if life > 0.62:
                c.create_oval(
                    sx - r * 0.42,
                    sy - r * 0.42,
                    sx + r * 0.42,
                    sy + r * 0.42,
                    fill="#fff7c2",
                    outline="",
                    tags="scene",
                )

        # Clean smooth flame silhouettes layered over particles.
        flame_specs = [
            ("#dc2f16", 52, 27, 0.0),
            ("#ff6b1a", 43, 21, 1.7),
            ("#ffb703", 31, 14, 3.2),
            ("#fff1a8", 21, 8, 4.8),
        ]
        for color, h, w, phase in flame_specs:
            sway = math.sin(self.frame / 6.5 + phase) * (2.4 + phase * 0.35)
            c.create_polygon(
                fire_x + sway,
                fire_y - h - abs(math.sin(self.frame / 7 + phase)) * 7,
                fire_x - w,
                fire_y + 16,
                fire_x - w * 0.35,
                fire_y - h * 0.32,
                fire_x,
                fire_y + 24,
                fire_x + w * 0.48,
                fire_y - h * 0.28,
                fire_x + w,
                fire_y + 16,
                fill=color,
                outline="",
                smooth=True,
                tags="scene",
            )

        # White-hot core.
        core_r = 13 + math.sin(self.frame / 3.0) * 0.9
        c.create_oval(
            fire_x - core_r,
            fire_y - 40 - core_r * 0.72,
            fire_x + core_r,
            fire_y - 40 + core_r * 0.72,
            fill="#fff7c2",
            outline="",
            tags="scene",
        )

        # Rain. Large ripple rings are intentionally disabled to keep the scene calm.
        for drop in self.raindrops:
            drop["x"] += drop["wind"] * 0.22
            drop["y"] += drop["speed"]
            if drop["y"] > height:
                # Keep rain atmospheric but avoid large expanding rings in the launcher view.
                drop["x"] = self.rng.uniform(-60, width)
                drop["y"] = self.rng.uniform(-130, -20)
            x, y, length = drop["x"], drop["y"], drop["length"]
            color = "#a7c7df" if drop["alpha"] > 0.55 else "#6f9fc0"
            c.create_line(x, y, x - drop["wind"], y + length, fill=color, width=1, tags="scene")

        # Gentle foreground vignette keeps the panel readable and the right-side scene cinematic.
        c.create_rectangle(0, 0, width * 0.44, height, fill="#050914", outline="", stipple="gray75", tags="scene")
        c.create_rectangle(width * 0.92, 0, width, height, fill="#050914", outline="", stipple="gray75", tags="scene")


class FullPackApp:
    def __init__(self) -> None:
        enable_high_dpi()
        self.root = tk.Tk()
        self.root.title(APP_TITLE)
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        window_w = min(1380, max(1120, int(screen_w * 0.76)))
        window_h = min(860, max(720, int(screen_h * 0.78)))
        window_x = max(0, (screen_w - window_w) // 2)
        window_y = max(0, (screen_h - window_h) // 2)
        self.root.geometry(f"{window_w}x{window_h}+{window_x}+{window_y}")
        self.root.minsize(980, 640)
        self.root.configure(bg="#071022")
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        self.queue: queue.Queue[tuple[str, object]] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.running = False
        self.target_progress = 0.0
        self.current_progress = 0.0
        self.last_error = ""
        self.log_file: Path | None = None
        self.active_xlsx = OUTPUT_DIR / "icmal_sorgu_sonuc.xlsx"

        self.canvas = tk.Canvas(self.root, highlightthickness=0, bg="#071022")
        self.canvas.pack(fill="both", expand=True)
        self.scene = CampScene(self.canvas)
        self.root.bind("<Configure>", lambda _event: self.draw_overlay())

        self.build_widgets()
        self.animate()
        self.root.after(250, self.process_queue)
        if AUTO_START:
            self.root.after(900, self.start_pipeline)
        else:
            self.status_label.configure(text="Hazır")

    def build_widgets(self) -> None:
        self.panel = tk.Frame(self.canvas, bg="#0b1220", bd=0, highlightthickness=1, highlightbackground="#2b3a55")
        self.canvas_window = self.canvas.create_window(42, 42, anchor="nw", window=self.panel, width=465)

        self.title_label = tk.Label(
            self.panel,
            text=APP_TITLE,
            bg="#0b1220",
            fg="#f8fafc",
            font=("Segoe UI", 28, "bold"),
        )
        self.title_label.pack(anchor="w", padx=24, pady=(22, 2))

        self.subtitle_label = tk.Label(
            self.panel,
            text="Tek tıkla tam üretim hattı",
            bg="#0b1220",
            fg="#a9b7cf",
            font=("Segoe UI", 11, "bold"),
        )
        self.subtitle_label.pack(anchor="w", padx=26, pady=(0, 16))

        self.status_label = tk.Label(
            self.panel,
            text="Hazırlanıyor...",
            bg="#0b1220",
            fg="#fbbf24",
            font=("Segoe UI", 13, "bold"),
        )
        self.status_label.pack(anchor="w", padx=26, pady=(0, 8))

        self.detail_label = tk.Label(
            self.panel,
            text="Son işlem: bekleniyor",
            bg="#0b1220",
            fg="#93c5fd",
            font=("Segoe UI", 9, "bold"),
            anchor="w",
            justify="left",
            wraplength=420,
        )
        self.detail_label.pack(fill="x", padx=26, pady=(0, 8))

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("FullPack.Horizontal.TProgressbar", troughcolor="#1f2937", background="#f59e0b", bordercolor="#1f2937", lightcolor="#fbbf24", darkcolor="#f97316")
        self.progress_var = tk.DoubleVar(value=0)
        self.progress = ttk.Progressbar(
            self.panel,
            orient="horizontal",
            mode="determinate",
            maximum=100,
            variable=self.progress_var,
            style="FullPack.Horizontal.TProgressbar",
        )
        self.progress.pack(fill="x", padx=26, pady=(0, 6))

        self.percent_label = tk.Label(
            self.panel,
            text="%0",
            bg="#0b1220",
            fg="#e5e7eb",
            font=("Segoe UI", 11, "bold"),
        )
        self.percent_label.pack(anchor="e", padx=26, pady=(0, 12))

        self.step_labels: list[tk.Label] = []
        steps_box = tk.Frame(self.panel, bg="#0b1220")
        steps_box.pack(fill="x", padx=24, pady=(0, 10))
        for text in UI_STEPS:
            label = tk.Label(
                steps_box,
                text=f"○ {text}",
                bg="#0b1220",
                fg="#8ca0bd",
                anchor="w",
                font=("Segoe UI", 8, "bold"),
            )
            label.pack(fill="x", pady=0)
            self.step_labels.append(label)

        log_frame = tk.Frame(self.panel, bg="#050914", bd=0, highlightthickness=1, highlightbackground="#1f2a44")
        log_frame.pack(fill="both", expand=True, padx=24, pady=(0, 18))
        self.log_text = tk.Text(
            log_frame,
            height=8,
            bg="#050914",
            fg="#cbd5e1",
            insertbackground="#f8fafc",
            relief="flat",
            font=("Consolas", 9),
            wrap="word",
        )
        log_scroll = tk.Scrollbar(log_frame, command=self.log_text.yview, bg="#111827", troughcolor="#050914")
        self.log_text.configure(yscrollcommand=log_scroll.set)
        self.log_text.pack(side="left", fill="both", expand=True)
        log_scroll.pack(side="right", fill="y")
        self.log_text.configure(state="disabled")

        btn_box = tk.Frame(self.panel, bg="#0b1220")
        btn_box.pack(fill="x", padx=24, pady=(0, 22))
        self.open_button = tk.Button(
            btn_box,
            text="Çıktı Klasörünü Aç",
            command=self.open_output_folder,
            state="disabled",
            bg="#1f2937",
            fg="#f8fafc",
            activebackground="#334155",
            activeforeground="#f8fafc",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=8,
        )
        self.open_button.pack(side="left")
        self.start_button = tk.Button(
            btn_box,
            text="Üretimi Başlat",
            command=self.start_pipeline,
            bg="#92400e",
            fg="#fff7ed",
            activebackground="#b45309",
            activeforeground="#ffffff",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=14,
            pady=8,
        )
        self.start_button.pack(side="left", padx=(10, 0))
        self.close_button = tk.Button(
            btn_box,
            text="Kapat",
            command=self.on_close,
            bg="#7f1d1d",
            fg="#fff7ed",
            activebackground="#991b1b",
            activeforeground="#ffffff",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
        )
        self.close_button.pack(side="right")

    def draw_overlay(self) -> None:
        width = max(self.root.winfo_width(), 980)
        panel_width = min(500, max(430, int(width * 0.42)))
        self.canvas.itemconfigure(self.canvas_window, width=panel_width)

    def animate(self) -> None:
        self.scene.draw()
        self.current_progress += (self.target_progress - self.current_progress) * 0.09
        if self.running and self.current_progress < self.target_progress + 0.2:
            self.current_progress = min(self.target_progress, self.current_progress + 0.035)
        self.progress_var.set(max(0, min(100, self.current_progress)))
        self.percent_label.configure(text=f"%{int(round(self.progress_var.get()))}")
        self.root.after(42, self.animate)

    def set_step(self, index: int, state: str) -> None:
        for i, label in enumerate(self.step_labels):
            raw = label.cget("text")[2:]
            if i < index or (i == index and state == "done"):
                label.configure(text=f"✓ {raw}", fg="#86efac")
            elif i == index:
                label.configure(text=f"● {raw}", fg="#fbbf24")
            else:
                label.configure(text=f"○ {raw}", fg="#8ca0bd")

    def emit(self, kind: str, payload: object) -> None:
        self.queue.put((kind, payload))

    def log(self, text: str) -> None:
        clean = str(text).rstrip()
        if clean.startswith("["):
            line = clean
        else:
            line = f"[{datetime.now():%H:%M:%S}] {clean}"
        self.emit("log", line)
        if self.log_file:
            try:
                with self.log_file.open("a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
            except OSError:
                pass

    def process_queue(self) -> None:
        while True:
            try:
                kind, payload = self.queue.get_nowait()
            except queue.Empty:
                break
            if kind == "status":
                text, pct = payload  # type: ignore[misc]
                self.status_label.configure(text=str(text))
                self.target_progress = float(pct)
            elif kind == "detail":
                self.detail_label.configure(text="Son işlem: " + str(payload))
            elif kind == "step":
                index, state = payload  # type: ignore[misc]
                self.set_step(int(index), str(state))
            elif kind == "log":
                self.log_text.configure(state="normal")
                self.log_text.insert("end", str(payload).rstrip() + "\n")
                self.log_text.see("end")
                self.log_text.configure(state="disabled")
            elif kind == "done":
                success = bool(payload)
                self.running = False
                self.open_button.configure(state="normal")
                if success:
                    self.target_progress = 100
                    self.status_label.configure(text="Üretim tamamlandı")
                    self.set_step(len(UI_STEPS) - 1, "done")
                else:
                    self.status_label.configure(text="Üretim hata ile durdu")
                    self.close_button.configure(bg="#991b1b")
            elif kind == "error":
                self.last_error = str(payload)
                messagebox.showerror(APP_TITLE, f"Üretim hata ile durdu:\n\n{self.last_error}\n\nDetay log: {self.log_file}")
        self.root.after(180, self.process_queue)

    def find_python_command(self) -> list[str]:
        return find_python_command()

    def start_pipeline(self) -> None:
        if self.running:
            return
        self.running = True
        self.start_button.configure(state="disabled")
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        self.log_file = LOG_DIR / f"aizanoi_full_pack_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        self.worker = threading.Thread(target=self.run_pipeline, daemon=True)
        self.worker.start()

    def begin_step(self, index: int, status: str, progress: float, detail: str | None = None) -> None:
        self.emit("step", (index, "active"))
        self.emit("status", (status, progress))
        self.emit("detail", detail or status)
        self.log(f"ADIM {index + 1}/{len(UI_STEPS)}: {status}")

    def handle_central_pipeline_event(self, line: str) -> bool:
        """Translate the single-runner progress protocol into the GUI timeline."""
        if not line.startswith(PIPELINE_EVENT_PREFIX + "|"):
            return False
        parts = line.split("|", 3)
        if len(parts) != 4:
            return False
        _, event, key, message = parts
        stages = {
            "icmal": (3, "icmal_sorgu_sonuc.xlsx üretiliyor", 10),
            "dashboard": (5, "İK E-Board dashboardları üretiliyor", 40),
            "admin": (6, "ERD_P_admin.html üretiliyor", 66),
            "magaza": (7, "magaza_takip_dosya.html üretiliyor", 78),
            "turnover": (8, "turnover_dashboard.html üretiliyor", 81),
            "uyum": (9, "magaza_uyum_dashboard.html üretiliyor", 84),
            "akademi": (10, "akademi_dashboard.html üretiliyor", 88),
            "performans": (11, "performans_dashboard.html üretiliyor", 90),
            "hedefler": (12, "hedefler_dashboard.html üretiliyor", 93),
            "pdks": (13, "pdks_takip_dashboard.html üretiliyor", 95),
        }

        if event == "PIPELINE_START":
            self.log("Merkezi üretim motoru başladı.")
            self.emit("detail", message)
            return True

        if event == "ACTIVE_XLSX":
            self.active_xlsx = BASE_DIR / message
            self.emit("step", (3, "done"))
            self.begin_step(4, "Aktif Excel dosyası seçiliyor", 36, f"Aktif Excel: {message}")
            self.emit("step", (4, "done"))
            return True

        if key in stages:
            step_index, status, progress = stages[key]
            if event == "STEP_START":
                self.begin_step(step_index, status, progress, message)
                return True
            if event == "STEP_DONE":
                self.emit("step", (step_index, "done"))
                self.log(f"{key} merkezi üretim adımı tamamlandı: {message}")
                return True
            if event == "STEP_ERROR":
                self.emit("detail", f"{key} hata verdi: {message}")
                self.log(f"{key} merkezi üretim adımı hata verdi: {message}")
                return True

        if event == "PIPELINE_DONE":
            self.emit("detail", f"Merkezi üretim motoru tamamlandı: {message}")
            return True
        if event == "PRODUCTION_STATE":
            self.log(f"Tam koşu bütünlük kaydı oluşturuldu: {message}")
            self.emit("detail", f"Üretim koşusu kimliği: {message}")
            return True
        return True

    def run_pipeline(self) -> None:
        """Run the whole production line through one central runner."""
        try:
            self.log(f"{APP_TITLE} üretim kaydı: {datetime.now():%Y-%m-%d %H:%M:%S}")
            self.log(f"Çalışma klasörü: {BASE_DIR}")
            self.log(f"Çıktı klasörü: {OUTPUT_DIR}")

            self.begin_step(0, "Üretim başlatılıyor", 1, "Üretim günlüğü hazırlanıyor")
            time.sleep(0.4)
            self.emit("step", (0, "done"))

            self.begin_step(
                1,
                "Python ve paketler hazırlanıyor",
                4,
                (
                    "Paketli 64-bit Python 3.11 ile bilimsel hesap motoru ve "
                    "yerel DLL bağımlılıkları çevrimdışı denetleniyor"
                ),
            )
            self.check_runtime()
            self.emit("step", (1, "done"))

            self.begin_step(2, "Excel kaynakları ve kilitler kontrol ediliyor", 8, "Gerekli Excel ve Python dosyaları aranıyor")
            self.check_inputs()
            self.emit("step", (2, "done"))

            self.log("Tek üretim motoru başlatılıyor: run_full_pipeline.py")
            self.emit("status", ("Merkezi üretim motoru çalışıyor", 10))
            self.emit("detail", "Excel, dashboardlar ve paneller tek üretim motoru üzerinden çalışacak")
            self.run_script(
                "run_full_pipeline.py",
                ["--emit-events"],
                status_text="Merkezi üretim motoru çalışıyor",
                progress_floor=10,
                progress_ceiling=95,
                line_handler=self.handle_central_pipeline_event,
            )

            self.begin_step(14, "Çıktı dosyaları kontrol ediliyor", 97, "HTML ve Excel çıktı dosyaları aranıyor")
            self.check_output_files()
            self.emit("step", (14, "done"))

            self.begin_step(
                15,
                "Türkçe karakter ve üretim bütünlüğü kontrol ediliyor",
                99,
                (
                    "HTML metin sağlığı ile on bir çıktının aynı tam üretim koşusuna "
                    "ait olduğu doğrulanıyor"
                ),
            )
            self.check_text_quality()
            self.check_production_coherence()
            self.emit("step", (15, "done"))

            self.begin_step(16, "Üretim tamamlanıyor", 100, "Tüm kontroller başarılı")
            self.emit("step", (16, "done"))
            self.log("Üretim tamamlandı.")
            prune_log_history(protected={self.log_file} if self.log_file else None)
            self.emit("done", True)
        except Exception as exc:
            self.log(f"HATA: {exc}")
            prune_log_history(protected={self.log_file} if self.log_file else None)
            self.emit("error", str(exc))
            self.emit("done", False)

    def check_runtime(self) -> None:
        python_cmd = ensure_python_command(self.log)
        self.log("Python komutu: " + " ".join(python_cmd))
        usable, python_detail = _probe_python_command(python_cmd)
        if not usable:
            raise PipelineError(f"Python doğrulaması başarısız: {python_detail}")
        self.log(python_detail)
        ensure_runtime_packages(
            python_cmd,
            logger=self.log,
            install_missing=not _is_bundled_python_command(python_cmd),
        )
        if _is_bundled_python_command(python_cmd):
            self.log(
                "Çevrimdışı paketli çalışma ortamı kullanılıyor; "
                "winget/pip veya internet kullanılmayacak."
            )
        self.log("Python ve paket hazırlığı tamamlandı.")

    def check_inputs(self) -> None:
        missing_scripts = [name for name in REQUIRED_SCRIPTS if not (PY_SOURCE_DIR / name).exists()]
        if missing_scripts:
            raise PipelineError("Eksik script: " + ", ".join(missing_scripts))
        self.log(f"Python script kontrolü: {len(REQUIRED_SCRIPTS)} / {len(REQUIRED_SCRIPTS)} dosya mevcut.")
        if not REQUIREMENTS_FILE.exists():
            raise PipelineError(f"Bağımlılık dosyası bulunamadı: {REQUIREMENTS_FILE}")
        self.log(f"Bağımlılık sözleşmesi mevcut: {REQUIREMENTS_FILE.name}")

        missing_inputs = [name for name in CORE_INPUTS if not (BASE_DIR / name).exists()]
        if missing_inputs:
            self.log("UYARI: Eksik görünen kaynak dosyalar: " + ", ".join(missing_inputs))
        else:
            self.log(f"Excel kaynak kontrolü: {len(CORE_INPUTS)} / {len(CORE_INPUTS)} ana kaynak mevcut.")

        locked: list[str] = []
        lock_targets = [BASE_DIR / name for name in CORE_INPUTS]
        lock_targets.append(OUTPUT_DIR / "icmal_sorgu_sonuc.xlsx")
        for path in lock_targets:
            if not path.exists():
                continue
            try:
                with path.open("r+b"):
                    pass
            except PermissionError:
                try:
                    locked.append(str(path.relative_to(BASE_DIR)))
                except ValueError:
                    locked.append(str(path))
            except OSError:
                pass
        if locked:
            raise PipelineError("Excel tarafından kilitli görünen dosyalar var. Lütfen kapatın: " + ", ".join(locked))
        self.log("Excel ve script kontrolleri tamamlandı.")

    def run_script(
        self,
        script_name: str,
        args: list[str],
        status_text: str,
        progress_floor: float,
        progress_ceiling: float,
        line_handler=None,
    ) -> None:
        script_path = PY_SOURCE_DIR / script_name
        if not script_path.exists():
            raise FileNotFoundError(script_path)
        python_cmd = self.find_python_command()
        cmd = [*python_cmd, str(script_path), *args]
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        self.log("> " + " ".join(f'"{part}"' if " " in part else part for part in cmd))
        started = time.perf_counter()
        process = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            bufsize=1,
        )
        assert process.stdout is not None

        output_queue: queue.Queue[str | None] = queue.Queue()

        def read_output() -> None:
            try:
                assert process.stdout is not None
                for out_line in process.stdout:
                    output_queue.put(out_line.rstrip())
            finally:
                output_queue.put(None)

        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()

        line_count = 0
        heartbeat_count = 0
        done_reading = False
        last_heartbeat = time.monotonic()
        last_progress = time.monotonic()
        self.emit("detail", f"{script_name} başladı")
        while True:
            try:
                line = output_queue.get(timeout=0.5)
            except queue.Empty:
                line = "__NO_LINE__"

            if line is None:
                done_reading = True
            elif line != "__NO_LINE__":
                clean = str(line).rstrip()
                if clean:
                    line_count += 1
                    handled = bool(line_handler(clean)) if line_handler else False
                    if not handled:
                        self.log(clean)
                        self.emit("detail", f"{script_name}: {clean[:150]}")

            now = time.monotonic()
            elapsed = time.perf_counter() - started
            span = progress_ceiling - progress_floor
            if now - last_progress >= 2.0:
                pulse_from_output = math.log(line_count + 1, 1.65) * 0.85 if line_count else 0.0
                pulse_from_time = min(span * 0.75, (elapsed / 60.0) * 0.9)
                pulse = min(span * 0.92, max(pulse_from_output, pulse_from_time))
                self.emit("status", (status_text, min(progress_ceiling - 0.8, progress_floor + pulse)))
                last_progress = now

            if now - last_heartbeat >= 15.0 and process.poll() is None:
                heartbeat_count += 1
                self.log(f"{script_name} çalışıyor... geçen süre {elapsed / 60:,.1f} dk, alınan çıktı satırı {line_count}")
                self.emit("detail", f"{script_name} çalışıyor; geçen süre {elapsed / 60:,.1f} dk")
                last_heartbeat = now

            if done_reading and process.poll() is not None:
                break

        return_code = process.wait()
        elapsed = time.perf_counter() - started
        if return_code != 0:
            raise PipelineError(f"{script_name} hata kodu ile bitti: {return_code}")
        self.emit("status", (status_text, progress_ceiling))
        self.emit("detail", f"{script_name} tamamlandı")
        self.log(f"{script_name} tamamlandı ({elapsed:,.1f} sn, {line_count} çıktı satırı, {heartbeat_count} canlı durum mesajı).")

    def check_output_files(self) -> None:
        for name in EXPECTED_OUTPUTS:
            path = OUTPUT_DIR / name
            validate_output_artifact(path)
            size_mb = path.stat().st_size / (1024 * 1024)
            self.log(f"OK: {name} ({size_mb:,.1f} MB)")
        self.log("Çıktı dosya ve boyut kontrolleri tamamlandı.")

    def check_text_quality(self) -> None:
        for name in TEXT_QUALITY_OUTPUTS:
            path = OUTPUT_DIR / name
            validate_text_quality_artifact(path)
            self.log(f"OK metin: {name}")
        self.log("Türkçe karakter ve bozuk metin kontrolleri tamamlandı.")

    def check_production_coherence(self) -> None:
        state = validate_production_coherence()
        self.log(
            "Tek üretim koşusu doğrulandı: "
            f"{state.get('run_id')} · {state.get('completed_at_utc')}"
        )

    def check_outputs(self) -> None:
        self.check_output_files()
        self.check_text_quality()
        self.check_production_coherence()

    def open_output_folder(self) -> None:
        try:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            os.startfile(str(OUTPUT_DIR))  # type: ignore[attr-defined]
        except OSError:
            pass

    def on_close(self) -> None:
        if self.running:
            if not messagebox.askyesno(APP_TITLE, "Üretim devam ediyor. Pencere kapatılsın mı"):
                return
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    if SELF_TEST:
        raise SystemExit(run_self_test())
    FullPackApp().run()


if __name__ == "__main__":
    main()

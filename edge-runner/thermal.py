import subprocess
import time
import shutil
from typing import Tuple, Optional
from config import TEMP_LIMIT_C

class ThermalManager:
    def __init__(self, mock: bool = False, temp_limit_c: float = TEMP_LIMIT_C):
        self.mock = mock
        self.temp_limit_c = temp_limit_c
        self.has_vcgencmd = shutil.which("vcgencmd") is not None
        if not mock and not self.has_vcgencmd:
            raise RuntimeError("vcgencmd is required for real Raspberry Pi benchmarks")

    def read_metrics(self) -> Tuple[float, int]:
        """Returns (temperature_c, throttled_hex_int)."""
        if self.mock or not self.has_vcgencmd:
            return 45.0, 0x0

        # Read temperature
        temp_c = 45.0
        try:
            out = subprocess.check_output(["vcgencmd", "measure_temp"], text=True, timeout=2).strip()
            # Format: temp=48.2'C
            if "temp=" in out:
                val_str = out.split("=")[1].replace("'C", "")
                temp_c = float(val_str)
        except Exception:
            pass

        # Read throttled bitmask
        throttled = 0
        try:
            out = subprocess.check_output(["vcgencmd", "get_throttled"], text=True, timeout=2).strip()
            # Format: throttled=0x0
            if "throttled=" in out:
                throttled = int(out.split("=")[1], 16)
        except Exception:
            pass

        return temp_c, throttled

    def is_currently_throttled(self, throttled_mask: int) -> bool:
        # Bits 0-3 represent active conditions:
        # bit 0: under-voltage detected
        # bit 1: arm frequency capped
        # bit 2: currently throttled
        # bit 3: soft temperature limit active
        return bool(throttled_mask & 0xF)

    def wait_for_cooldown(self, max_wait_seconds: int = 60) -> Tuple[float, int, bool]:
        """Waits up to max_wait_seconds for the chip to cool below temp_limit_c."""
        start = time.time()
        cooled = True
        temp, throttled = self.read_metrics()

        while (temp > self.temp_limit_c or self.is_currently_throttled(throttled)):
            if time.time() - start >= max_wait_seconds:
                cooled = False
                break
            time.sleep(2.0)
            temp, throttled = self.read_metrics()

        return temp, throttled, cooled

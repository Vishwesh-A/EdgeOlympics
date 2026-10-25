import os
import hashlib
from pathlib import Path
from typing import Tuple, Optional
import numpy as np

class DatasetIntegrityError(Exception):
    pass

class DatasetManager:
    def __init__(self, dataset_dir: Path):
        self.dataset_dir = Path(dataset_dir)
        self.data_file = self.dataset_dir / "data.npz"
        self.manifest_file = self.dataset_dir / "manifest.sha256"

        self._last_verified_mtime: Optional[float] = None
        self._cached_data: Optional[Tuple[np.ndarray, np.ndarray]] = None

    def verify_integrity(self, force: bool = False) -> None:
        """Verifies dataset sha256 against manifest.sha256, caching by mtime."""
        if not self.data_file.is_file():
            raise DatasetIntegrityError(f"Missing dataset file at {self.data_file}")
        if not self.manifest_file.is_file():
            raise DatasetIntegrityError(f"Missing manifest file at {self.manifest_file}")

        try:
            current_mtime = self.data_file.stat().st_mtime
        except OSError as e:
            raise DatasetIntegrityError(f"Unable to read dataset stat: {e}") from e

        # If already verified for this mtime and not forced, return
        if not force and self._last_verified_mtime == current_mtime:
            return

        # Read expected hash
        with open(self.manifest_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
            expected_hash = line.split()[0].lower()

        # Compute actual hash
        hasher = hashlib.sha256()
        with open(self.data_file, "rb") as f:
            while chunk := f.read(1048576):
                hasher.update(chunk)
        actual_hash = hasher.hexdigest().lower()

        if actual_hash != expected_hash:
            self._last_verified_mtime = None
            raise DatasetIntegrityError(
                f"Dataset SHA256 mismatch! Expected {expected_hash}, got {actual_hash}"
            )

        self._last_verified_mtime = current_mtime

    def load_data(self) -> Tuple[np.ndarray, np.ndarray]:
        """Loads and returns (x, y) dataset arrays."""
        self.verify_integrity()
        if self._cached_data is not None:
            return self._cached_data

        with np.load(self.data_file) as npz:
            if "x" not in npz or "y" not in npz:
                raise DatasetIntegrityError("Dataset data.npz must contain 'x' and 'y' arrays")
            x = np.array(npz["x"], dtype=np.float32)
            y = np.array(npz["y"], dtype=np.int64)

        self._cached_data = (x, y)
        return self._cached_data

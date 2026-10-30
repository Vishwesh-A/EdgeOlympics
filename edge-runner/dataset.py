import hashlib
from pathlib import Path
from typing import Optional
import numpy as np

class DatasetIntegrityError(Exception):
    pass

class DatasetManager:
    def __init__(self, dataset_dir: Path):
        self.dataset_dir = Path(dataset_dir)
        self.data_file = self.dataset_dir / "data.npz"
        self.manifest_file = self.dataset_dir / "manifest.sha256"

        self._last_verified_mtime: Optional[tuple[int, int]] = None
        self._verified_hash: Optional[str] = None
        self._cached_data: Optional[np.ndarray] = None

    def verify_integrity(self, force: bool = False) -> None:
        """Verifies dataset sha256 against manifest.sha256, caching by mtime."""
        if not self.data_file.is_file():
            raise DatasetIntegrityError(f"Missing dataset file at {self.data_file}")
        if not self.manifest_file.is_file():
            raise DatasetIntegrityError(f"Missing manifest file at {self.manifest_file}")

        try:
            current_mtime = (
                self.data_file.stat().st_mtime_ns,
                self.manifest_file.stat().st_mtime_ns,
            )
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
            self._verified_hash = None
            raise DatasetIntegrityError(
                f"Dataset SHA256 mismatch! Expected {expected_hash}, got {actual_hash}"
            )

        self._last_verified_mtime = current_mtime
        self._verified_hash = actual_hash

    def load_data(self) -> np.ndarray:
        """Loads the input images; ground-truth labels remain on Vast."""
        self.verify_integrity()
        if self._cached_data is not None:
            return self._cached_data

        with np.load(self.data_file) as npz:
            if "x" not in npz:
                raise DatasetIntegrityError("Dataset data.npz must contain an 'x' array")
            x = np.array(npz["x"], dtype=np.float32)

        self._cached_data = x
        return self._cached_data

    def expected_hash(self) -> str:
        self.verify_integrity()
        assert self._verified_hash is not None
        return self._verified_hash

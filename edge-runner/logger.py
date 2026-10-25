import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from config import LOG_DIR

def get_logger(name: str = "edge_runner") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Console handler
    ch = logging.StreamHandler()
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    # Rotating file handler (5 MB, keep 5 backups)
    log_file = LOG_DIR / f"{name}.log"
    fh = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    return logger

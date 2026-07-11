import logging
import sys
from typing import Optional

from app.config import DEBUG


def setup_logger(
    name: Optional[str] = None,
    level: int = logging.INFO
) -> logging.Logger:
    """
    Setup and return a logger with consistent formatting.
    
    Args:
        name: Logger name (uses root logger if None)
        level: Logging level
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    
    # Set level based on DEBUG mode
    if DEBUG:
        logger.setLevel(logging.DEBUG)
    else:
        logger.setLevel(level)
    
    # Avoid adding duplicate handlers
    if not logger.handlers:
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.DEBUG if DEBUG else level)
        
        # Format
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        console_handler.setFormatter(formatter)
        
        logger.addHandler(console_handler)
    
    return logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger with the given name.
    
    Args:
        name: Logger name (usually __name__)
        
    Returns:
        Logger instance
    """
    return setup_logger(name)


# Configure root logger
root_logger = setup_logger()

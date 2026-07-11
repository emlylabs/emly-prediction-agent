"""
Pod Resource Monitoring Service

Provides CPU, Memory, and Disk usage metrics for containerized environments.
Supports both cgroup v1 and v2.
"""
import psutil
from typing import Optional, Dict, Any


def read_file(path: str) -> Optional[str]:
    """Read content from a file, returns None if file doesn't exist or error."""
    try:
        with open(path, "r") as f:
            return f.read().strip()
    except:
        return None


def bytes_to_gb(val: int) -> float:
    """Convert bytes to gigabytes."""
    return round(val / (1024 ** 3), 3)


# ---------------- CPU ----------------

def get_cpu_limit() -> float:
    """
    Get CPU limit in cores.
    Supports cgroup v2 and v1, falls back to total CPU count.
    """
    # cgroup v2
    cpu_max = read_file("/sys/fs/cgroup/cpu.max")

    if cpu_max:
        parts = cpu_max.split()
        if len(parts) >= 2:
            quota, period = parts[0], parts[1]
            if quota != "max":
                return round(int(quota) / int(period), 3)

    # cgroup v1
    quota = read_file("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
    period = read_file("/sys/fs/cgroup/cpu/cpu.cfs_period_us")

    if quota and period and quota != "-1":
        return round(int(quota) / int(period), 3)

    return psutil.cpu_count()


def get_cpu_usage() -> float:
    """Get current CPU usage percentage."""
    return psutil.cpu_percent(interval=1)


# ---------------- MEMORY ----------------

def get_memory_limit() -> int:
    """
    Get memory limit in bytes.
    Supports cgroup v2 and v1, falls back to total system memory.
    """
    # cgroup v2
    mem = read_file("/sys/fs/cgroup/memory.max")

    if mem and mem != "max":
        return int(mem)

    # cgroup v1
    mem = read_file("/sys/fs/cgroup/memory/memory.limit_in_bytes")

    if mem:
        return int(mem)

    return psutil.virtual_memory().total


def get_memory_used() -> int:
    """
    Get current memory usage in bytes.
    Supports cgroup v2 and v1, falls back to system memory usage.
    """
    # cgroup v2
    mem = read_file("/sys/fs/cgroup/memory.current")
    if mem:
        return int(mem)

    # cgroup v1
    mem = read_file("/sys/fs/cgroup/memory/memory.usage_in_bytes")
    if mem:
        return int(mem)

    # fallback (last option, node memory)
    return psutil.virtual_memory().used


# ---------------- DISK ----------------

def get_disk_usage(path: str = "/") -> Dict[str, Any]:
    """
    Get disk usage for given path.
    
    Args:
        path: Filesystem path to check
        
    Returns:
        Dict with total_gb, used_gb, free_gb, usage_percent
    """
    try:
        usage = psutil.disk_usage(path)
        return {
            "total_gb": bytes_to_gb(usage.total),
            "used_gb": bytes_to_gb(usage.used),
            "free_gb": bytes_to_gb(usage.free),
            "usage_percent": usage.percent
        }
    except FileNotFoundError:
        # Fallback to root if path doesn't exist
        usage = psutil.disk_usage("/")
        return {
            "total_gb": bytes_to_gb(usage.total),
            "used_gb": bytes_to_gb(usage.used),
            "free_gb": bytes_to_gb(usage.free),
            "usage_percent": usage.percent,
            "note": f"Path {path} not found, using root filesystem"
        }


# ---------------- MAIN FUNCTION ----------------

def get_pod_resources(disk_path: str = "/app/data") -> Dict[str, Any]:
    """
    Get comprehensive pod resource usage.
    
    Args:
        disk_path: Path to check disk usage for
        
    Returns:
        Dict with cpu, memory, and disk metrics
    """
    # CPU
    cpu_limit = get_cpu_limit()
    cpu_used_percent = get_cpu_usage()

    cpu_of_limit = None
    if cpu_limit:
        cpu_of_limit = round(
            (cpu_used_percent / (cpu_limit * 100)) * 100,
            2
        )

    # Memory
    mem_limit = get_memory_limit()
    mem_used = get_memory_used()

    mem_of_limit = round((mem_used / mem_limit) * 100, 2)

    # Disk
    disk = get_disk_usage(disk_path)

    return {
        "cpu": {
            "limit_cores": cpu_limit,
            "usage_percent": cpu_used_percent,
            "usage_of_limit_percent": cpu_of_limit
        },
        "memory": {
            "limit_gb": bytes_to_gb(mem_limit),
            "used_gb": bytes_to_gb(mem_used),
            "usage_of_limit_percent": mem_of_limit
        },
        "disk": disk
    }

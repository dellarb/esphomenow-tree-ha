from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from pathlib import Path

import httpx

from .models import DiscoveredBridge

DEFAULT_SCAN_LOG_PATH = "/tmp/esp_tree_bridge_scan.log"

logger = logging.getLogger(__name__)

BRIDGE_JSON_PATH = "/bridge.json"
BRIDGE_PORT = 80
CONCURRENCY = 50
CONNECT_TIMEOUT = 1.0
READ_TIMEOUT = 2.0


def _get_local_subnets() -> list[ipaddress.IPv4Network]:
    networks: list[ipaddress.IPv4Network] = []
    seen: set[str] = set()
    try:
        hostname = socket.gethostname()
        addrs = socket.getaddrinfo(hostname, None, socket.AF_INET)
        for addr in addrs:
            ip_str = addr[4][0]
            if ip_str.startswith("127.") or ip_str == "0.0.0.0":
                continue
            net = ipaddress.IPv4Network(f"{ip_str}/24", strict=False)
            if str(net) not in seen:
                seen.add(str(net))
                networks.append(net)
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 80))
        ip_str = s.getsockname()[0]
        s.close()
        net = ipaddress.IPv4Network(f"{ip_str}/24", strict=False)
        if str(net) not in seen:
            seen.add(str(net))
            networks.append(net)
    except OSError:
        pass
    gateways = _get_gateways()
    if gateways:
        gw_addrs = {ipaddress.IPv4Address(gw) for gw in gateways}
        lan = [n for n in networks if any(gw in n for gw in gw_addrs)]
        if lan:
            return lan
    return networks


def _get_local_ips() -> set[str]:
    ips: set[str] = set()
    try:
        hostname = socket.gethostname()
        addrs = socket.getaddrinfo(hostname, None, socket.AF_INET)
        for addr in addrs:
            ip_str = addr[4][0]
            if not ip_str.startswith("127."):
                ips.add(ip_str)
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return ips


def _get_gateways() -> set[str]:
    gateways: set[str] = set()
    try:
        with open("/proc/net/route", "r") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) < 3:
                    continue
                if parts[1] != "00000000":
                    continue
                try:
                    gw = str(ipaddress.IPv4Address(int(parts[2], 16)))
                    gateways.add(gw)
                except ValueError:
                    continue
    except OSError:
        pass
    return gateways


async def _probe_host(client: httpx.AsyncClient, ip: str) -> tuple[DiscoveredBridge | None, str]:
    url = f"http://{ip}:{BRIDGE_PORT}{BRIDGE_JSON_PATH}"
    try:
        response = await client.get(url, follow_redirects=False)
        if response.status_code != 200:
            return None, f"http {response.status_code}"
        data = response.json()
        if not isinstance(data, dict) or "friendly_name" not in data:
            return None, "missing friendly_name"
        return DiscoveredBridge(
            host=ip,
            port=int(data.get("port", BRIDGE_PORT)),
            name=str(data.get("friendly_name", "")),
            version="",
            network_id=str(data.get("network_id", "")),
            hostname=str(data.get("hostname", "")),
        ), "ok"
    except httpx.TimeoutException:
        return None, "timeout"
    except httpx.ConnectError:
        return None, "connect error"
    except Exception as e:
        return None, str(e)[:40]


class NetworkDiscovery:
    def __init__(self, scan_log_path: str | Path = DEFAULT_SCAN_LOG_PATH):
        self._scan_log_path = Path(scan_log_path)

    def _write_log(self, msg: str) -> None:
        try:
            with self._scan_log_path.open("a") as f:
                f.write(msg)
                f.flush()
        except Exception:
            pass

    async def discover(self, timeout: float = 8.0, extra_subnets: list[ipaddress.IPv4Network] | None = None) -> list[DiscoveredBridge]:
        self._write_log(f"Bridge scan starting (timeout={timeout}s)\n")
        networks = _get_local_subnets()
        if not networks:
            logger.info("network: no local networks found, cannot scan")
            self._write_log("ERROR: No local networks found, cannot scan\n")
            return []

        if extra_subnets:
            for net in extra_subnets:
                if net not in networks:
                    networks.append(net)
                    self._write_log(f"  Extra subnet: {net}\n")

        local_ips = _get_local_ips()
        gateways = _get_gateways()
        skip_ips = local_ips | gateways

        all_hosts: set[str] = set()
        for net in networks:
            for host in net.hosts():
                if str(host) not in skip_ips:
                    all_hosts.add(str(host))

        if not all_hosts:
            logger.info("network: no hosts to scan after filtering")
            self._write_log("ERROR: No hosts to scan after filtering\n")
            return []

        sorted_hosts = sorted(all_hosts)
        self._write_log(f"Scanning {len(sorted_hosts)} hosts on {len(networks)} subnet(s): {', '.join(str(n) for n in networks)}\n")
        logger.info("network: scanning %d hosts on %d subnet(s)", len(sorted_hosts), len(networks))

        found: list[DiscoveredBridge] = []
        semaphore = asyncio.Semaphore(CONCURRENCY)

        async def run_scan() -> list[DiscoveredBridge]:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=1.0, pool=1.0),
            ) as client:
                async def probe_with_sem(ip: str) -> tuple[str, DiscoveredBridge | None, str]:
                    async with semaphore:
                        result, reason = await _probe_host(client, ip)
                        return (ip, result, reason)

                tasks = [asyncio.create_task(probe_with_sem(ip)) for ip in sorted_hosts]
                for coro in asyncio.as_completed(tasks):
                    try:
                        ip, bridge, reason = await coro
                        if bridge is not None:
                            self._write_log(f"  FOUND: {ip} -> {bridge.name} (network_id={bridge.network_id})\n")
                            logger.info("network: discovered bridge %s at %s:%d (network_id=%s)",
                                        bridge.name, bridge.host, bridge.port, bridge.network_id)
                            found.append(bridge)
                        else:
                            self._write_log(f"  MISS:  {ip} ({reason})\n")
                    except Exception as e:
                        self._write_log(f"  ERROR: {str(e)[:60]}\n")
                return found

        try:
            found = await asyncio.wait_for(run_scan(), timeout=timeout)
        except asyncio.TimeoutError:
            self._write_log(f"Scan timed out after {timeout}s\n")
            logger.info("network: discovery timed out after %ds", timeout)
            return found

        self._write_log(f"Scan complete: {len(found)} bridge(s) found\n")
        logger.info("network: discovery complete, found %d bridge(s)", len(found))
        return found

    async def ping(self, host: str, port: int = BRIDGE_PORT, timeout: float = 0.5) -> DiscoveredBridge | None:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
                url = f"http://{host}:{port}{BRIDGE_JSON_PATH}"
                response = await client.get(url, follow_redirects=False)
                if response.status_code != 200:
                    return None
                data = response.json()
                if not isinstance(data, dict) or "friendly_name" not in data:
                    return None
                return DiscoveredBridge(
                    host=host,
                    port=port,
                    name=str(data.get("friendly_name", "")),
                    version="",
                    network_id=str(data.get("network_id", "")),
                    hostname=str(data.get("hostname", "")),
                )
        except Exception:
            return None
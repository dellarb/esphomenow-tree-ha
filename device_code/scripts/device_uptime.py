#!/usr/bin/env python3
"""
Uptime summary for ESP-NOW LR devices over the last N hours.
Pulls from the esplog SQLite database.
"""
import sqlite3
import argparse
from datetime import datetime, timezone, timedelta


def to_awst(utc_str):
    """Convert UTC ISO string to AWST."""
    if isinstance(utc_str, str):
        s = utc_str.strip()
        # Handle Z suffix (even when already has +00:00)
        if s.endswith('Z'):
            s = s[:-1]
        dt = datetime.fromisoformat(s)
    else:
        dt = utc_str
    awst = timezone(timedelta(hours=8))
    return dt.astimezone(awst)


def get_uptime_summary(db_path, hours=12):
    """Calculate uptime for each device based on heartbeat messages."""
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    # Time window
    now_utc = datetime.now(timezone.utc)
    start_utc = now_utc - timedelta(hours=hours)
    start_iso = start_utc.strftime('%Y-%m-%dT%H:%M:%S')
    
    print(f"=== UPTIME SUMMARY | Last {hours}h | AWST ===")
    print(f"Window: {to_awst(start_utc).strftime('%Y-%m-%d %H:%M')} - {to_awst(now_utc).strftime('%Y-%m-%d %H:%M')}")
    print("-" * 70)
    
    # Get all devices
    cur = conn.execute("SELECT id FROM devices")
    devices = [r['id'] for r in cur.fetchall()]
    
    for device in sorted(devices):
        # Current status
        cur = conn.execute("SELECT status, last_seen FROM devices WHERE id = ?", (device,))
        status_row = cur.fetchone()
        current_status = status_row['status'] if status_row else 'unknown'
        last_seen = status_row['last_seen'] if status_row and status_row['last_seen'] else None
        
        # Count any TX or RX activity from this device in the window
        cur = conn.execute("""
            SELECT COUNT(*) as msg_count,
                   MIN(timestamp) as first_msg,
                   MAX(timestamp) as last_msg
            FROM logs 
            WHERE device_id = ? AND timestamp >= ?
        """, (device, start_iso))
        row = cur.fetchone()
        msg_count = row['msg_count'] if row else 0
        first_msg = row['first_msg'] if row and row['first_msg'] else None
        last_msg = row['last_msg'] if row and row['last_msg'] else None
        
        # Count state updates (sign of healthy operation)
        cur = conn.execute("""
            SELECT COUNT(*) as state_count
            FROM logs 
            WHERE device_id = ? AND timestamp >= ?
            AND message LIKE '%TX STATE%'
        """, (device, start_iso))
        state_count = cur.fetchone()['state_count']
        
        # Determine uptime based on activity
        if msg_count > 0 and first_msg and last_msg:
            def parse_ts(ts):
                s = ts.strip()
                if s.endswith('Z'):
                    s = s[:-1]
                return datetime.fromisoformat(s)
            first_dt = parse_ts(first_msg)
            last_dt = parse_ts(last_msg)
            active_seconds = (last_dt - first_dt).total_seconds()
            uptime_pct = (active_seconds / (hours * 3600)) * 100
            uptime_pct = min(uptime_pct, 100)
            
            if active_seconds >= 3600:
                uptime_str = f"{active_seconds/3600:.1f}h"
            elif active_seconds >= 60:
                uptime_str = f"{active_seconds/60:.0f}m"
            else:
                uptime_str = f"{active_seconds:.0f}s"
        else:
            uptime_str = "-"
            uptime_pct = 0
        
        # Status indicator
        if current_status == 'up' and last_seen:
            last_seen_awst = to_awst(last_seen).strftime('%m-%d %H:%M')
            status_icon = "✓"
        elif current_status == 'down' and last_seen:
            last_seen_awst = to_awst(last_seen).strftime('%m-%d %H:%M')
            status_icon = "✗"
        else:
            last_seen_awst = "-"
            status_icon = "?"
        
        device_short = device.replace('espnow-', '').replace('remote-', 'r-').replace('bridge-', 'bridge-')
        print(f"{status_icon} {device_short:14} {uptime_str:>6}  |  Msgs: {msg_count:5}  |  TX State: {state_count:4}  |  Last: {last_seen_awst}")
    
    conn.close()
    
    print("-" * 70)
    print("✓ = online now  |  ✗ = offline  |  Activity from own logs")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ESP-NOW LR uptime summary")
    parser.add_argument("--hours", type=int, default=12, help="Hours to look back (default: 12)")
    parser.add_argument("--db", "-d", default="cache/esplog.db", help="Path to esplog.db")
    args = parser.parse_args()
    
    get_uptime_summary(args.db, args.hours)
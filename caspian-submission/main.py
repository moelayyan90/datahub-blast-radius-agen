from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from caspian_sdk import CommClient

STATE_FILE = Path(os.getenv("DEADLINE_RELAY_STATE", "deadline_relay_state.json"))
MONEY_RE = re.compile(r"(?i)(?:\$|USD\s*|EUR\s*|GBP\s*|JOD\s*|₹\s*)([\d,]+(?:\.\d{1,2})?)")
HOUR_RE = re.compile(r"(?i)\b(?:in\s+)?(\d{1,3})\s*(hours?|hrs?|h)\b")
DAY_RE = re.compile(r"(?i)\b(?:in\s+)?(\d{1,3})\s*(days?|d)\b")
DATE_RE = re.compile(r"(?i)\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?\b")
COMMAND_RE = re.compile(r"(?i)^\s*(ACK|SNOOZE|ASSIGN|IGNORE)\b(?:\s+(.+))?$")

@dataclass
class Opportunity:
    id: str
    text: str
    created_at: str
    amount: Optional[float]
    deadline_hint: Optional[str]
    hours_remaining: Optional[float]
    category: str
    urgency: int
    status: str = "open"
    assignee: Optional[str] = None

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def parse_amount(text: str) -> Optional[float]:
    match = MONEY_RE.search(text)
    return None if not match else float(match.group(1).replace(",", ""))

def parse_deadline(text: str) -> tuple[Optional[str], Optional[float]]:
    m = HOUR_RE.search(text)
    if m:
        hours = float(m.group(1)); return f"in {int(hours)} hours", hours
    m = DAY_RE.search(text)
    if m:
        hours = float(m.group(1)) * 24; return f"in {m.group(1)} days", hours
    m = DATE_RE.search(text)
    if m:
        year, month, day = map(int, m.group(1, 2, 3)); hour = int(m.group(4) or 23); minute = int(m.group(5) or 59)
        try:
            dt = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
            return dt.isoformat(), max(0.0, (dt - now_utc()).total_seconds() / 3600)
        except ValueError:
            pass
    return None, None

def classify(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ("hackathon", "competition", "challenge", "prize", "bounty")): return "competition"
    if any(k in t for k in ("compliance", "regulation", "policy", "audit", "deadline")): return "compliance"
    if any(k in t for k in ("lead", "proposal", "pilot", "contract", "sales", "buyer")): return "commercial"
    return "general"

def score_urgency(text: str, amount: Optional[float], hours: Optional[float]) -> int:
    score = 15; t = text.lower()
    if any(k in t for k in ("urgent", "today", "asap", "final", "deadline", "expires")): score += 25
    if amount is not None: score += 10 if amount < 1000 else 20 if amount < 10000 else 30
    if hours is not None: score += 35 if hours <= 6 else 25 if hours <= 24 else 15 if hours <= 72 else 5
    return min(100, score)

def parse_opportunity(text: str) -> Opportunity:
    amount = parse_amount(text); deadline_hint, hours = parse_deadline(text); created = now_utc()
    return Opportunity(created.strftime("%Y%m%d%H%M%S%f"), text.strip(), created.isoformat(), amount, deadline_hint, hours, classify(text), score_urgency(text, amount, hours))

def load_state() -> list[dict]:
    if not STATE_FILE.exists(): return []
    try: return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception: return []

def save_state(items: list[dict]) -> None:
    STATE_FILE.write_text(json.dumps(items[-200:], indent=2), encoding="utf-8")

def record(opportunity: Opportunity) -> None:
    items = load_state(); items.append(asdict(opportunity)); save_state(items)

def update_latest(command: str, value: Optional[str]) -> str:
    items = load_state()
    if not items: return "No active item exists yet."
    item = items[-1]; cmd = command.upper()
    if cmd == "ACK": item["status"] = "acknowledged"
    elif cmd == "IGNORE": item["status"] = "ignored"
    elif cmd == "ASSIGN": item["status"] = "assigned"; item["assignee"] = (value or "unassigned").strip()
    elif cmd == "SNOOZE": item["status"] = f"snoozed:{(value or '1h').strip()}"
    save_state(items); return f"Updated {item['id']} → {item['status']}"

def render_summary(op: Opportunity) -> str:
    money = f"${op.amount:,.2f}" if op.amount is not None else "not detected"; deadline = op.deadline_hint or "not detected"
    return ("Deadline Relay\n" f"• category: {op.category}\n" f"• value: {money}\n" f"• deadline: {deadline}\n" f"• urgency: {op.urgency}/100\n" f"• id: {op.id}\n\n" "Reply ACK, SNOOZE <time>, ASSIGN <name>, or IGNORE.")

client = CommClient()

def maybe_escalate(op: Opportunity) -> None:
    connection_id = os.getenv("ESCALATION_CONNECTION_ID", "").strip(); target = os.getenv("ESCALATION_TARGET", "").strip()
    if not connection_id or not target or op.urgency < int(os.getenv("ESCALATION_THRESHOLD", "70")): return
    client.initiate(connection_id, target, "⚠️ Cross-channel escalation\n\n" + render_summary(op) + "\n\nOriginal:\n" + op.text[:1200])

@client.on_message
def handle(message):
    text = (message.text or "").strip(); cmd = COMMAND_RE.match(text)
    if cmd:
        message.reply(update_latest(cmd.group(1), cmd.group(2))); return
    op = parse_opportunity(text); record(op); message.reply(render_summary(op)); maybe_escalate(op)

if __name__ == "__main__":
    client.listen()

import importlib.util
import pathlib
import sys
import types
import unittest

class _DummyClient:
    def on_message(self, fn): return fn
    def initiate(self, *args, **kwargs): pass
    def listen(self): pass

sdk = types.ModuleType("caspian_sdk")
sdk.CommClient = _DummyClient
sys.modules["caspian_sdk"] = sdk

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("deadline_relay_main", ROOT / "main.py")
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

class ParserTests(unittest.TestCase):
    def test_high_value_short_deadline(self):
        op = mod.parse_opportunity("$10,000 hackathon final deadline in 6 hours")
        self.assertEqual(op.amount, 10000)
        self.assertEqual(op.category, "competition")
        self.assertEqual(op.hours_remaining, 6)
        self.assertGreaterEqual(op.urgency, 90)

    def test_compliance(self):
        op = mod.parse_opportunity("Urgent compliance deadline in 2 days")
        self.assertEqual(op.category, "compliance")
        self.assertEqual(op.hours_remaining, 48)
        self.assertGreater(op.urgency, 50)

    def test_command(self):
        self.assertTrue(mod.COMMAND_RE.match("ACK"))
        self.assertTrue(mod.COMMAND_RE.match("SNOOZE 3h"))
        self.assertTrue(mod.COMMAND_RE.match("ASSIGN Mohammad"))

if __name__ == "__main__":
    unittest.main()

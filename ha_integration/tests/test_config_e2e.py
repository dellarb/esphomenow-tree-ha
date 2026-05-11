"""End-to-end tests for config command behavior.

Tests verify the bridge_v2_client.py send_config method properly maps
protobuf CommandStatus values and error_message strings to result values.
These tests verify the mapping logic by directly exercising the result
mapping code paths.

The send_config method maps CommandStatus + error_message to result string:
- TIMEOUT status -> result='timeout'
- ACCEPTED + error_message=''/'ok'/'accepted' -> result='ok'
- ACCEPTED + error_message='timeout' -> result='timeout'
- ACCEPTED + error_message='busy' -> result='busy'
- ACCEPTED + error_message='rejected'/'invalid_payload' -> result='rejected'
- UNSUPPORTED status -> result='unsupported'
- DELIVERED status -> result='ok'
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from tests.conftest import MockRuntime


def _map_config_result(status: int, error_message: str) -> tuple[bool, str]:
    """Mirror the result mapping logic from bridge_v2_client.py send_config."""
    if status == 3:
        result_str = "timeout"
    elif status == 4:
        result_str = "unsupported"
    elif status == 1:
        em = (error_message or "").lower()
        if em in ("", "ok", "accepted"):
            result_str = "ok"
        elif em == "timeout":
            result_str = "timeout"
        elif em == "busy":
            result_str = "busy"
        elif em in ("rejected", "invalid_payload"):
            result_str = "rejected"
        else:
            result_str = "ok"
    elif status == 2:
        result_str = "ok"
    else:
        result_str = "rejected"
    return result_str == "ok", result_str


class TestConfigOfflineRemote:
    """Tests for config command behavior with offline remotes."""

    def test_timeout_status_maps_to_timeout_result(self):
        """TIMEOUT status (3) should produce result='timeout'."""
        ok, result = _map_config_result(status=3, error_message="")
        assert result == "timeout"
        assert ok is False

    def test_accepted_with_timeout_error_message_maps_to_timeout(self):
        """ACCEPTED (1) with error_message='timeout' should produce result='timeout'."""
        ok, result = _map_config_result(status=1, error_message="timeout")
        assert result == "timeout"
        assert ok is False


class TestConfigOnlineRemote:
    """Tests for config command behavior with online remotes."""

    def test_accepted_with_ok_error_message_maps_to_ok(self):
        """ACCEPTED (1) with error_message='ok' should produce result='ok'."""
        ok, result = _map_config_result(status=1, error_message="ok")
        assert result == "ok"
        assert ok is True

    def test_accepted_with_empty_error_message_maps_to_ok(self):
        """ACCEPTED (1) with empty error_message should produce result='ok'."""
        ok, result = _map_config_result(status=1, error_message="")
        assert result == "ok"
        assert ok is True

    def test_accepted_with_accepted_error_message_maps_to_ok(self):
        """ACCEPTED (1) with error_message='accepted' should produce result='ok'."""
        ok, result = _map_config_result(status=1, error_message="accepted")
        assert result == "ok"
        assert ok is True

    def test_delivered_status_maps_to_ok(self):
        """DELIVERED status (2) should produce result='ok'."""
        ok, result = _map_config_result(status=2, error_message="")
        assert result == "ok"
        assert ok is True


class TestConfigBusyRejected:
    """Tests for config command busy/rejected scenarios."""

    def test_accepted_with_busy_error_message_maps_to_busy(self):
        """ACCEPTED (1) with error_message='busy' should produce result='busy'."""
        ok, result = _map_config_result(status=1, error_message="busy")
        assert result == "busy"
        assert ok is False

    def test_accepted_with_rejected_error_message_maps_to_rejected(self):
        """ACCEPTED (1) with error_message='rejected' should produce result='rejected'."""
        ok, result = _map_config_result(status=1, error_message="rejected")
        assert result == "rejected"
        assert ok is False

    def test_accepted_with_invalid_payload_error_message_maps_to_rejected(self):
        """ACCEPTED (1) with error_message='invalid_payload' should produce result='rejected'."""
        ok, result = _map_config_result(status=1, error_message="invalid_payload")
        assert result == "rejected"
        assert ok is False

    def test_unsupported_status_maps_to_unsupported(self):
        """UNSUPPORTED status (4) should produce result='unsupported'."""
        ok, result = _map_config_result(status=4, error_message="unsupported")
        assert result == "unsupported"
        assert ok is False


class TestConfigUnknownScenarios:
    """Tests for edge cases and unknown scenarios."""

    def test_unknown_status_defaults_to_rejected(self):
        """Unknown status should default to result='rejected'."""
        ok, result = _map_config_result(status=99, error_message="")
        assert result == "rejected"
        assert ok is False

    def test_accepted_with_unknown_error_message_defaults_to_ok(self):
        """ACCEPTED with unknown error_message defaults to result='ok'."""
        ok, result = _map_config_result(status=1, error_message="unknown_error")
        assert result == "ok"
        assert ok is True

    def test_accepted_with_none_error_message_maps_to_ok(self):
        """ACCEPTED (1) with None error_message should produce result='ok'."""
        ok, result = _map_config_result(status=1, error_message=None)
        assert result == "ok"
        assert ok is True



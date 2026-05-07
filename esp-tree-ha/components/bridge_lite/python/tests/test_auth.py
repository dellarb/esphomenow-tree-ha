import os
from bridge_lite_client.auth import (
    SessionKeys,
    compute_auth_hmac,
    derive_session_keys,
)


def test_auth_hmac_roundtrip():
    api_key = "0123456789abcdef"
    client_name = "test_addon"
    server_nonce_hex = "a" * 32
    client_nonce_hex = "b" * 32

    hmac1 = compute_auth_hmac(api_key, client_name, server_nonce_hex, client_nonce_hex)
    hmac2 = compute_auth_hmac(api_key, client_name, server_nonce_hex, client_nonce_hex)

    assert hmac1 == hmac2
    assert len(hmac1) == 64


def test_session_key_derivation():
    api_key = "0123456789abcdef"
    server_nonce = bytes.fromhex("a" * 32)
    client_nonce = bytes.fromhex("b" * 32)

    keys = derive_session_keys(api_key, server_nonce, client_nonce)

    assert keys.c2s_counter == 0
    assert keys.s2c_counter == 0


def test_encrypt_decrypt_roundtrip():
    key_c2s = os.urandom(32)
    key_s2c = os.urandom(32)
    keys = SessionKeys(key_c2s, key_s2c)

    plaintext = b"Hello, World!"
    encrypted = keys.encrypt(plaintext)
    assert len(encrypted) >= len(plaintext) + 20

    decrypt_keys = SessionKeys(key_s2c, key_c2s)
    decrypt_keys.s2c_counter = 1
    decrypted = decrypt_keys.decrypt(encrypted)
    assert decrypted == plaintext


def test_counter_increments():
    key_c2s = os.urandom(32)
    key_s2c = os.urandom(32)
    keys = SessionKeys(key_c2s, key_s2c)

    for i in range(5):
        encrypted = keys.encrypt(b"test")
        counter = int.from_bytes(encrypted[:4], "little")
        assert counter == i
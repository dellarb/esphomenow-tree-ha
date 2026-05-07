import hashlib
import hmac
import struct
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

PROTOCOL_NAME = "espnow-tree-lite"
PROTOCOL_VERSION = "v1"
SESSION_INFO = f"{PROTOCOL_NAME}-{PROTOCOL_VERSION}-session"


class SessionKeys:
    def __init__(self, key_c2s: bytes, key_s2c: bytes):
        self.c2s = ChaCha20Poly1305(key_c2s)
        self.s2c = ChaCha20Poly1305(key_s2c)
        self.c2s_counter: int = 0
        self.s2c_counter: int = 0

    def encrypt(self, plaintext: bytes) -> bytes:
        nonce = struct.pack("<I", self.c2s_counter) + b"\x00" * 8
        self.c2s_counter += 1
        ciphertext = self.c2s.encrypt(nonce, plaintext, None)
        return struct.pack("<I", self.c2s_counter - 1) + ciphertext

    def decrypt(self, data: bytes) -> bytes:
        counter = struct.unpack("<I", data[:4])[0]
        nonce = struct.pack("<I", counter) + b"\x00" * 8
        plaintext = self.s2c.decrypt(nonce, data[4:], None)
        return plaintext


def compute_auth_hmac(
    api_key: str, client_name: str, server_nonce_hex: str, client_nonce_hex: str
) -> str:
    msg = f"{PROTOCOL_NAME}|{PROTOCOL_VERSION}|{client_name}|{server_nonce_hex}|{client_nonce_hex}"
    return hmac.new(api_key.encode(), msg.encode(), hashlib.sha256).hexdigest()


def derive_session_keys(api_key: str, server_nonce: bytes, client_nonce: bytes) -> SessionKeys:
    ikm = server_nonce + client_nonce
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=64,
        salt=api_key.encode(),
        info=SESSION_INFO.encode(),
    )
    key_material = hkdf.derive(ikm)
    return SessionKeys(key_material[:32], key_material[32:])
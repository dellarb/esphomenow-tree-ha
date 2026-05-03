from __future__ import annotations

import struct
from typing import BinaryIO

OTA_FRAME_MAGIC = 0x5445
OTA_FRAME_VERSION = 1
OTA_FRAME_HEADER_LEN = 24
OTA_FRAME_FLAG_FINAL = 0x0001

MAX_WS_CHUNK_SIZE = 2048
OTA_WINDOW_SIZE = 4


def _build_crc32_table() -> list[int]:
    poly = 0xEDB88320
    table = []
    for i in range(256):
        crc = i
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ poly
            else:
                crc >>= 1
        table.append(crc)
    return table


_CRC32_TABLE = _build_crc32_table()


def crc32(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for byte in data:
        crc = (crc >> 8) ^ _CRC32_TABLE[(crc ^ byte) & 0xFF]
    return crc ^ 0xFFFFFFFF


def encode_chunk(
    job_id: int,
    sequence: int,
    payload: bytes,
    max_chunk_size: int,
    is_final: bool = False,
) -> bytes:
    flags = OTA_FRAME_FLAG_FINAL if is_final else 0
    payload_length = len(payload)
    payload_crc = crc32(payload)
    firmware_offset = sequence * max_chunk_size

    header = struct.pack(
        "<HBBIIIHHI",
        OTA_FRAME_MAGIC,
        OTA_FRAME_VERSION,
        OTA_FRAME_HEADER_LEN,
        job_id,
        sequence,
        firmware_offset,
        payload_length,
        flags,
        payload_crc,
    )
    return header + payload


def decode_chunk(data: bytes) -> tuple[int, int, int, int, int, int, bytes]:
    if len(data) < OTA_FRAME_HEADER_LEN:
        raise ValueError(f"frame too short: {len(data)} < {OTA_FRAME_HEADER_LEN}")

    (
        magic,
        version,
        header_len,
        job_id,
        sequence,
        firmware_offset,
        payload_length,
        flags,
        payload_crc,
    ) = struct.unpack_from("<HBBIIIHHI", data, 0)

    if magic != OTA_FRAME_MAGIC:
        raise ValueError(f"bad magic: 0x{magic:04X}")
    if version != OTA_FRAME_VERSION:
        raise ValueError(f"bad version: {version}")
    if header_len != OTA_FRAME_HEADER_LEN:
        raise ValueError(f"bad header_len: {header_len}")

    total_len = OTA_FRAME_HEADER_LEN + payload_length
    if len(data) < total_len:
        raise ValueError(f"truncated frame: {len(data)} < {total_len}")

    payload = data[OTA_FRAME_HEADER_LEN : total_len]

    if crc32(payload) != payload_crc:
        raise ValueError("CRC mismatch")

    is_final = bool(flags & OTA_FRAME_FLAG_FINAL)

    return job_id, sequence, firmware_offset, payload_length, flags, is_final, payload


def read_chunk_from_file(
    fp: BinaryIO,
    sequence: int,
    chunk_size: int,
) -> bytes:
    fp.seek(sequence * chunk_size)
    return fp.read(chunk_size)


def total_chunks(file_size: int, chunk_size: int) -> int:
    return (file_size + chunk_size - 1) // chunk_size

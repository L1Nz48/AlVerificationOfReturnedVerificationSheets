"""ขั้นที่ 3 — รับไฟล์เข้าระบบ: ค้นไฟล์ แปลง PDF เป็นภาพ ย่อ/บีบอัดก่อนส่ง AI"""

import io
import shutil
from pathlib import Path
from typing import List, Tuple

from PIL import Image

SUPPORTED = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic"}


def discover(source_dir: str) -> List[Path]:
    """คืนรายการไฟล์เอกสารในโฟลเดอร์ต้นทาง (1 ชุด = 1 ไฟล์)"""
    src = Path(source_dir)
    if not src.exists():
        return []
    return sorted(
        p for p in src.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED and not p.name.startswith(".")
    )


def _optimize(img: Image.Image, max_px: int, quality: int) -> bytes:
    """ย่อด้านยาวสุดไม่เกิน max_px แล้วบีบเป็น JPEG เพื่อลด bandwidth"""
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    scale = max_px / float(max(w, h))
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def to_images(path: Path, max_px: int = 2048, quality: int = 85) -> Tuple[List[bytes], int]:
    """แปลงเอกสารเป็นรายการภาพ JPEG พร้อมจำนวนหน้า"""
    if path.suffix.lower() == ".pdf":
        import fitz  # PyMuPDF

        pages: List[bytes] = []
        with fitz.open(str(path)) as pdf:
            for page in pdf:
                # 300 dpi ตาม Sequence Diagram (72 dpi ฐาน × 4.17)
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                pages.append(_optimize(img, max_px, quality))
        return pages, len(pages)

    with Image.open(path) as img:
        return [_optimize(img, max_px, quality)], 1


def archive(path: Path, archive_dir: str) -> Path:
    """เก็บภาพต้นฉบับไว้เป็นหลักฐาน (Audit Log / Storage) โดยไม่เขียนทับของเดิม"""
    dst_dir = Path(archive_dir)
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / path.name
    n = 1
    while dst.exists():
        dst = dst_dir / "{0} ({1}){2}".format(path.stem, n, path.suffix)
        n += 1
    shutil.copy2(path, dst)
    return dst

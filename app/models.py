"""โครงสร้างข้อมูลกลาง — อิงเอกสารจริง "บัญชีรายชื่อนักศึกษา (ขอตรวจสอบวุฒิ)"

หัวเอกสาร : ที่ มหป.(ตทน) …/…, ชุดที่ …, ชื่อโรงเรียน/สถาบัน + รหัสสถาบัน
ตาราง     : ลำดับ | รหัสนักศึกษา | ชื่อ-สกุล | คณะ/วิทยาลัย | ผลตรวจ 3 กลุ่ม | หมายเหตุ
ท้ายเอกสาร: ลายมือชื่อผู้ตรวจสอบ 1 จุด + ชื่อในวงเล็บ + ตำแหน่ง
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional

VERDICT_AUTO = "auto"            # ผ่านเกณฑ์ บันทึกเข้า SCMS อัตโนมัติ
VERDICT_EXCEPTION = "exception"  # เข้าคิวให้เจ้าหน้าที่ตรวจ (ขั้นที่ 8–9)

FORM_SPU = "spu"                 # แบบฟอร์มของมหาวิทยาลัย
FORM_OTHER = "other"             # ฟอร์มที่โรงเรียนทำเอง → ไม่ผ่านเกณฑ์ทันที

# ผลตรวจ 3 กลุ่มในตาราง (กลุ่มละ 2 ช่อง)
GRADUATION = {"pass": "สำเร็จ", "fail": "ไม่สำเร็จ"}          # การสำเร็จการศึกษา
CORRECTNESS = {"correct": "ถูกต้อง", "incorrect": "ไม่ถูกต้อง"}  # วันที่สำเร็จ / วุฒิฯ ที่สำเร็จ
UNCLEAR = "unclear"              # กาไม่ชัด หรือกาทั้งสองช่อง
GROUPS = ("graduation", "doc_date", "degree")
GROUP_LABEL = {
    "graduation": "การสำเร็จการศึกษา",
    "doc_date": "วันที่สำเร็จในเอกสาร",
    "degree": "วุฒิฯ ที่สำเร็จในเอกสาร",
}
ADVERSE = {"fail", "incorrect"}  # ผลลบ — ห้าม Auto-Post ต้องให้เจ้าหน้าที่ดำเนินการ


@dataclass
class RowResult:
    row_no: int
    student_id: Optional[str] = None          # รหัสนักศึกษา (ไม่มีเลขบัตร ปชช. ในฟอร์มนี้)
    full_name: Optional[str] = None
    faculty: Optional[str] = None             # คณะ/วิทยาลัย
    graduation: Optional[str] = None          # pass | fail | unclear | None
    doc_date: Optional[str] = None            # correct | incorrect | unclear | None
    degree: Optional[str] = None              # correct | incorrect | unclear | None
    note: Optional[str] = None                # หมายเหตุลายมือ เช่น "ปลอมแปลง"
    confidence: float = 0.0
    source_page: int = 1
    # เติมโดย rules.py
    scms_match: Optional[bool] = None
    scms_name: Optional[str] = None
    issues: List[str] = field(default_factory=list)
    edited: bool = False

    @property
    def marks(self) -> List[Optional[str]]:
        return [self.graduation, self.doc_date, self.degree]

    @property
    def adverse(self) -> bool:
        return any(m in ADVERSE for m in self.marks)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["marks"] = self.marks
        d["adverse"] = self.adverse
        return d


@dataclass
class DocResult:
    file_path: str
    file_name: str
    form_type: str = FORM_SPU
    doc_no: Optional[str] = None              # ที่ มหป.(ตทน) 01933/2569
    set_no: Optional[str] = None              # ชุดที่ 68539
    school_name: Optional[str] = None
    school_code: Optional[str] = None         # (00040384)
    rows: List[RowResult] = field(default_factory=list)
    pages: int = 1

    # ลายมือชื่อผู้ตรวจสอบท้ายเอกสาร (จุดเดียว)
    verifier_signed: bool = False
    verifier_name: Optional[str] = None
    verifier_position: Optional[str] = None

    verdict: str = VERDICT_EXCEPTION
    reasons: List[str] = field(default_factory=list)
    readable_rows: int = 0
    min_confidence: float = 0.0
    status: str = "pending"                   # pending | posted | confirmed | rejected
    doc_id: Optional[int] = None
    error: Optional[str] = None

    @property
    def row_count(self) -> int:
        return len(self.rows)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["row_count"] = self.row_count
        d["rows"] = [r.to_dict() for r in self.rows]
        return d


@dataclass
class RunSummary:
    run_id: int
    total: int = 0
    auto: int = 0
    exception: int = 0
    posted: int = 0
    started_at: str = ""
    finished_at: str = ""
    status: str = "running"

    def to_dict(self) -> dict:
        return asdict(self)

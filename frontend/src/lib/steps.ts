export interface StepDef {
  no: number;
  nm: string;
  ds: string;
  human?: boolean;
}

export const STEPS: StepDef[] = [
  { no: 3, nm: "รับไฟล์เข้าระบบ", ds: "สแกน 300 dpi · 1 ชุด = 1 PDF" },
  { no: 4, nm: "ตรวจชนิดฟอร์ม", ds: "บัญชีรายชื่อนักศึกษา (SPU) หรือไม่ใช่" },
  { no: 5, nm: "อ่านรหัส นศ. / ชื่อ / คณะ", ds: "OCR + cross-check SCMS" },
  { no: 6, nm: "AI อ่านผลตรวจ", ds: "3 กลุ่ม · หมายเหตุ · ลายมือชื่อผู้ตรวจสอบ" },
  { no: 7, nm: "ตรวจตามกฎอัตโนมัติ", ds: "ครบทุกแถว / conf ≥ 95%" },
  { no: 8, nm: "รับเคสเข้าคิว Exception", ds: "เทียบภาพกับค่าที่อ่านได้", human: true },
  { no: 9, nm: "เจ้าหน้าที่ยืนยัน/แก้ไข", ds: "กดยืนยันทีละแถว", human: true },
  { no: 10, nm: "บันทึกผลเข้า SCMS", ds: "อัตโนมัติ + แนบภาพหลักฐาน" },
];

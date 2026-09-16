import { cc, pct } from "../../lib/format";
import type { DocResult } from "../../types";

export default function DocDetail({ d }: { d: DocResult }) {
  return (
    <>
      <dl className="kv" style={{ marginBottom: 16 }}>
        <dt>ชนิดฟอร์ม</dt><dd>{d.form_type === "spu" ? "ฟอร์ม SPU" : "ฟอร์มโรงเรียน"}</dd>
        <dt>อ่านได้ตามเกณฑ์</dt><dd>{d.readable_rows}/{d.row_count} แถว</dd>
        <dt>Confidence ต่ำสุด</dt><dd style={{ color: cc(d.min_confidence) }}>{pct(d.min_confidence)}</dd>
        <dt>ผลการตัดสิน</dt>
        <dd>{d.verdict === "auto"
          ? <span className="chip c-lime">ผ่านอัตโนมัติ · บันทึกเข้า SCMS</span>
          : <span className="chip c-amber">เข้าคิวตรวจสอบ</span>}</dd>
        <dt>สถานะ</dt><dd>{d.status}</dd>
      </dl>
      <table className="t">
        <thead><tr><th>แถว</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th>ผลตรวจ</th><th>Conf</th><th>แก้ไข</th></tr></thead>
        <tbody>
          {(d.rows || []).map(r => (
            <tr key={r.row_no}>
              <td className="num">{r.row_no}</td>
              <td>{r.student_id}</td>
              <td>{r.full_name}</td>
              <td>{r.adverse ? <span className="chip c-red">มีผลลบ</span> : <span className="chip c-lime">ผ่าน</span>}</td>
              <td className="num" style={{ color: cc(r.confidence) }}>{pct(r.confidence)}</td>
              <td>{r.edited ? <span className="chip c-amber">edited</span> : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

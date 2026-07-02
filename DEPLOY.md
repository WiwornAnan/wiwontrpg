# คู่มือขึ้นเว็บ WiwonAnant (ฟรี)

คู่มือนี้พาขึ้นเว็บจริงแบบฟรี ด้วย **GitHub + Render** โดยเก็บทุกอย่าง (บทความ, ไอเทม, รูปภาพ)
ไว้ในฐานข้อมูล Postgres ที่เดียว ไม่ต้องใช้ที่เก็บไฟล์แยก

> ทำตามทีละขั้น ใช้เวลาประมาณ 15–20 นาที

---

## ภาพรวมสถาปัตยกรรม

```
ผู้ใช้ ──▶  Render Web Service (Node/Express)  ──▶  Postgres
                 │  เสิร์ฟหน้าเว็บ React (build แล้ว)
                 │  + API ทั้งหมด  + รูปภาพ (เก็บใน DB)
```

- เว็บกับ API อยู่ **โดเมนเดียวกัน** (same-origin) → คุกกี้ล็อกอินทำงานได้ ไม่มีปัญหา CORS
- รูปภาพเก็บเป็นไบต์ในตาราง `Upload` → **อยู่รอดข้าม deploy** ไม่หาย

---

## สิ่งที่ต้องมี (คุณมีครบแล้ว)

- [x] บัญชี **GitHub**
- [x] บัญชี **Render** (render.com — สมัครด้วย GitHub ได้เลย)

---

## ขั้นที่ 1 — ดันโค้ดขึ้น GitHub

1. สร้าง repo ใหม่บน GitHub (เว้นว่าง ไม่ต้องติ๊ก README) เช่นชื่อ `wiwonanant`
2. ในเครื่อง (โฟลเดอร์โปรเจกต์) รันคำสั่งตามที่ GitHub บอก โดยแทน `<URL>` เป็นลิงก์ repo ของคุณ:

```bash
git remote add origin <URL>       # เช่น https://github.com/yourname/wiwonanant.git
git push -u origin implement-wiwonanant
```

> โค้ดอยู่บน branch `implement-wiwonanant` — ดันขึ้นไปได้เลย ไม่ต้องรวมเข้า main ก่อน
> (ตอนตั้งค่า Render จะเลือก branch นี้)

---

## ขั้นที่ 2 — Deploy บน Render (แบบคลิกเดียว)

ไฟล์ `render.yaml` ในโปรเจกต์เป็น "พิมพ์เขียว" (Blueprint) ที่บอก Render ให้สร้าง
ฐานข้อมูล + เว็บเซอร์วิสให้อัตโนมัติ

1. เข้า Render Dashboard → **New +** → **Blueprint**
2. เชื่อม GitHub แล้วเลือก repo `wiwonanant` + branch `implement-wiwonanant`
3. Render จะอ่าน `render.yaml` แล้วขึ้นรายการ: `wiwonanant-db` (Postgres) + `wiwonanant` (web)
4. กด **Apply** — Render เริ่ม build

ระหว่าง build Render จะรัน:
- `npm install`
- `npm run render:build` → สร้าง schema Postgres → สร้างตาราง (`prisma db push`) → seed ข้อมูลเริ่มต้น → build หน้าเว็บ
- เสร็จแล้วรัน `npm run render:start`

---

## ขั้นที่ 3 — ตั้งค่า Environment (สำคัญ)

Render จะถามค่า 3 ตัวที่ต้องกรอกเอง (ไปที่เซอร์วิส `wiwonanant` → **Environment**):

| ตัวแปร | ใส่อะไร |
|---|---|
| `DEV_INVITE_CODE` | โค้ดลับสำหรับสมัครเป็น dev เช่น `WIWON-DEV-2569` |
| `ADMIN_EMAIL` | อีเมลแอดมินคนแรกของคุณ |
| `ADMIN_PASSWORD` | รหัสผ่านแอดมิน (ตั้งให้ยาว ๆ) |

> `DATABASE_URL` และ `SESSION_SECRET` — Render กรอก/สุ่มให้เองแล้ว ไม่ต้องแตะ

กรอกเสร็จกด **Save Changes** → Render deploy รอบใหม่ พร้อมสร้างบัญชีแอดมินให้อัตโนมัติ

---

## ขั้นที่ 4 — เข้าใช้งาน

- เปิด URL ที่ Render ให้ (เช่น `https://wiwonanant.onrender.com`)
- ล็อกอินด้วย `ADMIN_EMAIL` / `ADMIN_PASSWORD` ที่ตั้งไว้ → ได้สิทธิ์ dev ทันที
  (เข้าหน้า Content Editor, อนุมัติ Homebrew, จัดการ Tag ได้)
- ผู้ใช้ทั่วไปกด "สมัคร" เองได้ (ไม่ต้องใส่โค้ด) — ถ้าจะสมัครเป็น dev ต้องกรอก `DEV_INVITE_CODE`

🎉 เว็บขึ้นออนไลน์แล้ว

---

## ⚠️ ข้อควรรู้เรื่องแพ็กเกจฟรี

1. **เว็บ "หลับ" หลังไม่มีคนเข้า 15 นาที** — คนเข้าครั้งถัดไปจะช้า ~30 วิ (ตื่นขึ้นมา) แล้วเร็วปกติ
2. **Render Postgres ฟรีถูกลบทิ้งใน 90 วัน** — ถ้าจะใช้ยาว ให้ย้ายไป Neon (ข้างล่าง)
3. **พื้นที่เก็บ ~1 GB** (Render) / ~0.5 GB (Neon) — ข้อความเก็บได้แทบไม่จำกัด, รูปได้หลักร้อย–พันใบ

---

## (ทางเลือก) ใช้ Neon แทน — ฐานข้อมูลฟรีถาวร

Neon ให้ Postgres ฟรี ~0.5 GB ที่ **ไม่หมดอายุ** เหมาะกับใช้ยาว ๆ

1. สมัคร [neon.tech](https://neon.tech) → สร้าง project → คัดลอก **connection string**
   (เลือกแบบมี `?sslmode=require`)
2. ใน `render.yaml` ลบบล็อก `databases:` ทั้งก้อน และลบบล็อก `DATABASE_URL` ที่เป็น `fromDatabase`
3. ในหน้า Render → Environment เพิ่ม `DATABASE_URL` เอง วาง connection string ของ Neon
4. Deploy ใหม่

> ถ้าตั้งค่า Render ไปแล้วด้วย Render Postgres ก็แค่แก้ค่า `DATABASE_URL` ให้ชี้ Neon แล้ว deploy ใหม่
> (ข้อมูลเก่าใน Render Postgres จะไม่ย้ายตามให้เอง — ทำตั้งแต่ยังไม่มีข้อมูลจะง่ายสุด)

---

## (ทางเลือก) ใช้โดเมนตัวเอง + DNS ที่ Hostinglotus

Hostinglotus เป็นโฮสต์แบบ FTP รัน Node.js ไม่ได้ แต่ใช้ **ตั้ง DNS ชี้มาที่ Render** ได้

1. Render → เซอร์วิส `wiwonanant` → **Settings → Custom Domains** → เพิ่มโดเมนของคุณ
2. Render จะให้ค่า DNS มา (ปกติเป็น CNAME) เช่น `wiwonanant.onrender.com`
3. เข้าแผงจัดการโดเมน/DNS ของ Hostinglotus → เพิ่มเรคคอร์ด:
   - โดเมนย่อย (เช่น `www`): **CNAME** → `wiwonanant.onrender.com`
   - โดเมนหลัก (root): ตามที่ Render แนะนำ (มักเป็น ALIAS/ANAME หรือ A record ตาม IP ที่ Render ให้)
4. รอ DNS อัปเดต (ไม่กี่นาที–ไม่กี่ชม.) Render จะออกใบรับรอง HTTPS ให้อัตโนมัติ

---

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| Build ล้ม ตอน `prisma db push` | `DATABASE_URL` ยังไม่ถูกตั้ง — เช็กว่า Blueprint สร้าง DB สำเร็จ หรือวาง Neon URL แล้ว |
| ล็อกอินแอดมินไม่ได้ | ยังไม่ได้ตั้ง `ADMIN_EMAIL`/`ADMIN_PASSWORD` ก่อน deploy — ตั้งแล้ว deploy ใหม่ |
| ล็อกอินแล้วหลุดทันที | ปกติในโหมด production ต้องเป็น HTTPS (Render เป็น HTTPS อยู่แล้ว) — ตรวจว่า `NODE_ENV=production` |
| เข้าเว็บครั้งแรกช้ามาก | เว็บเพิ่งตื่นจากหลับ (แพ็กเกจฟรี) — รอ ~30 วิ |
| รูปอัปโหลดไม่ขึ้น | ไฟล์เกิน 8 MB หรือไม่ใช่รูปภาพ — ระบบจำกัดไว้ |

---

## สรุปคำสั่ง (อ้างอิง)

```bash
# ดันโค้ด
git push -u origin implement-wiwonanant

# Render รันให้เองตาม render.yaml:
npm install
npm run render:build   # schema → db push → seed → build web
npm run render:start   # tsx src/server.ts (เสิร์ฟเว็บ + API พอร์ตเดียว)
```

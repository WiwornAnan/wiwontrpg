# คู่มือขึ้นเว็บ WiwonAnant (ฟรีถาวร) — แบบจับมือทำ

ขึ้นเว็บจริงแบบฟรี ด้วย **GitHub + Render + Neon**
- **Render** = รันเว็บ (ฟรี)
- **Neon** = ฐานข้อมูล Postgres (ฟรี ~0.5 GB **ไม่หมดอายุ**)
- เก็บทุกอย่าง (บทความ, ไอเทม, รูปภาพ) ไว้ใน Neon ที่เดียว รูปไม่หายข้าม deploy

> ใช้เวลารวม ~20 นาที ทำตามทีละข้อ

---

## ภาพรวม

```
ผู้ใช้ ──▶  Render (Node/Express)  ──▶  Neon Postgres (ถาวร)
                เสิร์ฟหน้าเว็บ + API + รูปภาพ พอร์ตเดียว
```

---

## ขั้นที่ 1 — โค้ดขึ้น GitHub

สร้าง repo เปล่าชื่อ `wiwonanant` (อย่าติ๊ก README/​.gitignore/​license) แล้ว push branch `implement-wiwonanant` ขึ้นไป

```bash
git remote add origin <URL-repo-ของคุณ>
git push -u origin implement-wiwonanant
```
> ตอนถาม password ให้วาง **Personal Access Token** ของ GitHub (สร้างที่ github.com/settings/tokens สิทธิ์ `repo`)

---

## ขั้นที่ 2 — สร้างฐานข้อมูล Neon (ฟรีถาวร)

1. เปิด **neon.tech** → **Sign up** (ล็อกอินด้วย GitHub ได้เลย)
2. มันจะให้สร้าง project อัตโนมัติ — ตั้งชื่ออะไรก็ได้ เช่น `wiwonanant`, region เลือก **Singapore** (ใกล้ไทย)
3. กด **Create project**
4. หน้าถัดมาจะมีกล่อง **Connection string** — กด **Copy** (หน้าตาแบบ
   `postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/dbname?sslmode=require`)
5. **เก็บลิงก์นี้ไว้** เดี๋ยวเอาไปวางที่ Render ในขั้นที่ 4

> ต้องมี `?sslmode=require` ต่อท้าย — ถ้าไม่มี Neon มักมีปุ่มเลือกให้ ติ๊กเอา

---

## ขั้นที่ 3 — Deploy บน Render

1. เปิด **render.com** → **Get Started** → **Sign in with GitHub**
2. Dashboard → มุมขวาบน **New +** → **Blueprint**
3. กด **Connect** repo `wiwonanant`
   - ถ้าไม่เห็น repo → **Configure account** → อนุญาต repo `wiwonanant` → กลับมา
4. เลือก **Branch = `implement-wiwonanant`** (สำคัญ อย่าเลือก main)
5. Render อ่าน `render.yaml` เอง แล้วโชว์เซอร์วิส `wiwonanant`
6. กด **Apply**

---

## ขั้นที่ 4 — ใส่ค่า Environment (4 ตัว)

Render จะถามค่าที่ต้องกรอกเอง — ไปที่เซอร์วิส `wiwonanant` → เมนูซ้าย **Environment**:

| ช่อง | ใส่อะไร |
|---|---|
| `DATABASE_URL` | วาง connection string ของ **Neon** (จากขั้นที่ 2 ข้อ 4) |
| `DEV_INVITE_CODE` | โค้ดลับสมัคร dev เช่น `WIWON-DEV-2569` |
| `ADMIN_EMAIL` | อีเมลแอดมินของคุณ |
| `ADMIN_PASSWORD` | รหัสผ่านแอดมิน (ยาว ๆ) |

> `SESSION_SECRET`, `NODE_ENV`, `NODE_VERSION` — Render ตั้งให้เองแล้ว ไม่ต้องแตะ

กด **Save Changes** → Render deploy ใหม่ ระหว่างนั้นจะรัน:
`npm install` → สร้างตารางใน Neon (`prisma db push`) → seed ข้อมูล + สร้างบัญชีแอดมิน → build หน้าเว็บ

---

## ขั้นที่ 5 — เข้าใช้งาน

1. รอจนสถานะขึ้น **Live** (เขียว) ~3–5 นาที
2. กดลิงก์ที่ Render ให้ (เช่น `https://wiwonanant.onrender.com`)
3. ล็อกอินด้วย `ADMIN_EMAIL` / `ADMIN_PASSWORD` → ได้สิทธิ์ dev เต็ม
   (Content Editor, อนุมัติ Homebrew, จัดการ Tag)
4. ผู้ใช้ทั่วไปกด "สมัคร" เองได้ (ไม่ต้องใส่โค้ด)

🎉 เว็บออนไลน์แล้ว — ฐานข้อมูลอยู่ถาวรบน Neon

---

## ⚠️ ข้อควรรู้เรื่องแพ็กเกจฟรี

1. **เว็บ Render "หลับ" หลังไม่มีคนเข้า 15 นาที** — คนเข้าครั้งถัดไปรอ ~30 วิ (ตื่น) แล้วเร็วปกติ
   ฐานข้อมูล Neon ไม่หลับแบบนั้น ข้อมูลอยู่ครบเสมอ
2. **พื้นที่ Neon ฟรี ~0.5 GB** — ข้อความเก็บได้แทบไม่จำกัด, รูปได้หลักร้อย–พันใบ
   (รูปจำกัดใบละ ≤ 8 MB) พอโตค่อยอัปเกรด Neon โดยไม่ต้องแก้โค้ด

---

## (ทางเลือก) โดเมนตัวเอง + DNS ที่ Hostinglotus

Hostinglotus รัน Node ไม่ได้ แต่ตั้ง DNS ชี้มา Render ได้

1. Render → `wiwonanant` → **Settings → Custom Domains** → เพิ่มโดเมน
2. Render ให้ค่า DNS มา (มักเป็น CNAME → `wiwonanant.onrender.com`)
3. แผง DNS ของ Hostinglotus → เพิ่มเรคคอร์ดตามที่ Render บอก
   - `www` → **CNAME** → `wiwonanant.onrender.com`
   - root → ตามที่ Render แนะนำ (ALIAS/ANAME หรือ A record)
4. รอ DNS อัปเดต Render ออกใบ HTTPS ให้เอง

---

## แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| Build ล้มตอน `prisma db push` | `DATABASE_URL` ผิด/ไม่มี `?sslmode=require` — ก๊อป Neon string ใหม่ให้ครบ |
| ล็อกอินแอดมินไม่ได้ | ยังไม่ได้ตั้ง `ADMIN_EMAIL`/`ADMIN_PASSWORD` ก่อน deploy — ตั้งแล้ว deploy ใหม่ |
| เข้าเว็บครั้งแรกช้ามาก | เว็บเพิ่งตื่นจากหลับ (ปกติของแพ็กเกจฟรี) รอ ~30 วิ |
| รูปอัปโหลดไม่ขึ้น | ไฟล์เกิน 8 MB หรือไม่ใช่รูปภาพ |

---

## สรุปคำสั่งที่ Render รันให้เอง (อ้างอิง)

```bash
npm install --include=dev
npm run render:build   # gen postgres schema → db push (Neon) → seed → build web
npm run render:start   # tsx src/server.ts (เสิร์ฟเว็บ + API พอร์ตเดียว)
```

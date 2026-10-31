# 🎵 BeatDrop (TH & INTL)

> **BeatDrop** — เกมทายเพลงไทยและเพลงสากลจากเสี้ยววินาที (Snippet Music Guessing Game) ที่สร้างแรงบันดาลใจและถอดรหัสงานออกแบบจาก [Songspot (songspot.co)](https://songspot.co/) พร้อมอัปเกรดฟีเจอร์สำหรับแฟนเพลงชาวไทยและสากลเต็มรูปแบบ พัฒนาด้วยสถาปัตยกรรม **Next.js 15 (App Router)** รวม Frontend + Serverless API บนโปรเจกต์เดียว พร้อมรองรับทั้ง **Supabase PostgreSQL** บน Cloud และ **SQLite (Offline Mode)** ในเครื่อง

---

## 🌟 จุดเด่นและฟีเจอร์หลัก (Features)

### 1. 🇹🇭 & 🌍 หมวดหมู่เพลงไทย เพลงสากล และ Mixed รวมฮิต
- **เพลงไทย (TH):** คลังเพลง T-Pop, สตริง, ร็อก, อินดี้ (Three Man Down, Tilly Birds, NONT TANONT, Palmy, Bodyslam, Jeff Satur, 4EVE, PROXIE, ฯลฯ)
- **เพลงสากล (INTL):** คลังเพลงฮิตระดับโลก (Taylor Swift, Olivia Rodrigo, The Weeknd, Bruno Mars, Dua Lipa, Billie Eilish, ฯลฯ)
- **Mixed รวมฮิต:** ผสมผสานเพลงไทยและสากลร่วมกัน

### 2. 🎮 โหมดการเล่นหลากหลาย (Game Modes)
- **โหมดทั่วไป (Default / 3-Row Reels):** จำลอง UI Reel 3 แถวแบบ Songspot (`GENRES`, `ERAS`, `ARTISTS`) เลือกผสมหมวดได้อย่างอิสระ
- **🎯 Song Guesser (Hear it. Pick it.):** โหมด 4 ตัวเลือก (A, B, C, D) ไม่ต้องพิมพ์หา ฟังคลิปเสียงแล้วแตะเลือกคำตอบได้ทันที
- **📅 Daily Challenge:** ทายเพลง 5 ข้อประจำวัน (รีเซ็ตทุกเที่ยงคืน 00:00 น. เวลาไทย UTC+7 ชุดเดียวกันทุกคน)
- **🏆 Leaderboard:** บันทึกคะแนนและแสดงตารางจัดอันดับประจำวันและคะแนนรวม
- **🎤 Artist Mode:** ล็อกเป้าหมายทายเฉพาะเพลงของศิลปินคนโปรด พร้อมระบบซิงค์เพลงเข้าคลังได้ถึง 200 เพลง/ศิลปิน
- **📆 Year / Era Mode:** เลือกทายตามยุคสมัย (2020s, 2010s, 2000s หรือเจาะจงปี 2000-2026)
- **🎸 Genre Mode:** เจาะจงแนวเพลง เช่น T-Pop, Rock, Pop, Indie, Hip-Hop, R&B

### 3. ⚡ เลือกระดับความยากและ Time Range
1. **Easy:** 3s → 5s → 10s → 15s (ปลดล็อกเร็ว เพลงฮิต)
2. **Medium:** 1s → 2s → 4s → 8s → 15s (มาตรฐาน)
3. **Hard:** 0.5s → 2s → 6s → 8s → 15s
4. **Expert:** 0.2s → 0.5s → 1.5s → 3s → 6s
5. **Impossible:** 0.1s → 0.3s → 0.8s → 2s → 4s (เสี้ยววินาทีระดับหูทิพย์)
- **Time Range Presets:** Relaxed, Standard, Songspot (0.5s → 10s) และ Custom กำหนดเองได้

### 4. 💿 Vinyl Spin & 30s Post-Game Player
- เมื่อทายถูกหรือเฉลยเพลง แผ่นเสียงไวนิลหมุน 360 องศา พร้อมเล่นคลิปพรีวิวเต็ม 30 วินาทีแบบ Hi-Res พร้อม Seek Bar ควบคุมเสียง
- สรุปผลลัพธ์ด้วย Emoji Grid (`🟩`, `🟥`, `⬜`) เพื่อแชร์ลง Social Media ได้ทันที

### 5. 🎨 Multi-Theme System & Thai Font
- รองรับธีมสีหลากหลาย (BeatDrop Emerald, Spotify Studio, Sunset Glow, Cyber Neon)
- ตัวอักษรภาษาไทยคมชัดสวยงามด้วย Google Fonts **Noto Sans Thai**

---

## 🛠️ สถาปัตยกรรมและเทคโนโลยี (Tech Stack)

- **Framework:** [Next.js 15 (App Router)](https://nextjs.org/) — Fullstack รวม Frontend + API Route Handlers ในที่เดียว
- **UI & Styling:** React 19, Tailwind CSS, Lucide Icons, Custom Audio Controller Hooks
- **Database (Dual Mode):**
  - **Cloud:** [Supabase PostgreSQL](https://supabase.com/) (คลังเพลง, ศิลปิน, Daily Challenge, Leaderboard พร้อม Full-Text Trigram Index)
  - **Offline / Local:** SQLite (`data/beatdrop.db`) ด้วย Node built-in `node:sqlite` สำหรับการรันแบบไม่ต้องต่อเน็ต
- **State & Tokens:** HMAC-SHA256 Stateless Round Tokens ป้องกัน Session หลุดข้าม Serverless Instances บน Vercel
- **Automation:** Vercel Cron / pg_cron สุ่ม Daily Challenge อัตโนมัติทุก 00:00 น. (UTC+7)

---

## 💻 การติดตั้งและรันในเครื่อง (Local Setup)

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. กำหนดโหมดฐานข้อมูลใน `.env.local`

คัดลอกไฟล์ตัวอย่าง `.env.example` เป็น `.env.local`:

```bash
cp .env.example .env.local
```

เลือกโหมดที่ต้องการใช้งานใน `.env.local`:

#### แบบที่ 1: รันแบบ Offline SQLite (ไม่ต้องต่อ Supabase)
เหมาะสำหรับการทดสอบ เล่นคนเดียว หรือช่วงที่ไม่มีอินเทอร์เน็ต โดยระบบจะอ่านคลังเพลง 3,700+ เพลงจากไฟล์ `data/beatdrop.db` โดยตรง:

```env
DB_LOCAL=true
ROUND_TOKEN_SECRET="my-super-secret-key-32-chars-long"
```

#### แบบที่ 2: เชื่อมต่อ Supabase PostgreSQL (Cloud Mode)
เมื่อตั้งค่า `DB_LOCAL=false` หรือ**ไม่ได้ใส่ `DB_LOCAL`** ระบบจะเชื่อมต่อไปยัง Supabase Cloud:

```env
DB_LOCAL=false
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
ROUND_TOKEN_SECRET="my-super-secret-key-32-chars-long"
```

### 3. รันโปรเจกต์ (Development Mode)

```bash
npm run dev
```

เปิดบราวเซอร์ไปที่: `http://localhost:3000` 🎉

---

## 🚀 แนวทางการ Deploy บน Vercel + Supabase (Production Deployment)

BeatDrop ถูกออกแบบให้ Deploy ขึ้น **Vercel** โปรเจกต์เดียว (Frontend + Serverless API + Cron Job) คู่กับ **Supabase PostgreSQL** ได้ง่ายๆ ใน 4 ขั้นตอน:

### ขั้นตอนที่ 1: เตรียมฐานข้อมูลบน Supabase
1. สร้างโปรเจกต์ใหม่ที่ [Supabase Dashboard](https://supabase.com/dashboard)
2. ไปที่เมนู **SQL Editor** แล้วคัดลอกโค้ดจากไฟล์ [`supabase/schema.sql`](supabase/schema.sql) ไปวางแล้วกด **Run**
   - คำสั่งนี้จะสร้างตาราง `artists`, `songs`, `daily_challenges`, `leaderboard` พร้อม Indexes, Constraints และฟังก์ชันสุ่ม Daily Challenge อัตโนมัติ
3. ไปที่ **Project Settings > API** เพื่อคัดลอก:
   - `Project URL` (สำหรับ `SUPABASE_URL`)
   - `service_role secret` (สำหรับ `SUPABASE_SERVICE_ROLE_KEY`)
   - `anon public` (สำหรับ `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### ขั้นตอนที่ 2: ย้ายเพลงจาก Local SQLite ขึ้น Supabase (One-time Migration)
รันสคริปต์เพื่ออัปโหลดเพลงทั้ง 3,763 เพลง, ศิลปิน 8 คน และอันดับ Leaderboard ขึ้น Supabase (ใช้เวลาประมาณ 5-10 วินาที):

```bash
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
npm run migrate:supabase
```

### ขั้นตอนที่ 3: ตั้งค่า Environment Variables บน Vercel
เมื่อนำโปรเจกต์ขึ้น GitHub และเชื่อมต่อไปยัง [Vercel Dashboard](https://vercel.com/):
1. ไปที่แท็บ **Settings > Environment Variables**
2. เพิ่มตัวแปรดังนี้:
   - `DB_LOCAL` = `false` (หรือเว้นว่างไว้)
   - `SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `your-service-role-key`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-public-key`
   - `ROUND_TOKEN_SECRET` = สตริงสุ่ม 32 ตัวอักษรขึ้นไป
   - `CRON_SECRET` = สตริงสุ่มสำหรับ Vercel Cron Security

### ขั้นตอนที่ 4: Deploy & ตรวจสอบ Cron Job
1. กด **Deploy** บน Vercel ระบบจะตรวจพบ Next.js อัตโนมัติและสั่ง `next build` ให้ทันที
2. ระบบ Cron Job จะถูกตั้งค่าตามไฟล์ [`vercel.json`](vercel.json) โดยอัตโนมัติ:
   - `path`: `/api/cron/daily`
   - `schedule`: `0 17 * * *` (เวลา 17:00 UTC ตรงกับ **00:00 น. เวลาไทย UTC+7**)
   - ทุกวันเวลาเที่ยงคืน Vercel Cron จะเรียก API เพื่อสุ่ม 5 เพลงประจำวันบันทึกลงตาราง `daily_challenges`

---

## 📡 สรุป API Endpoints

| Endpoint | Method | คำอธิบาย |
|---|---|---|
| `/api/rounds/start` | POST | เริ่มรอบใหม่ สุ่มเพลงและออก Signed Token |
| `/api/rounds/guess` | POST | ส่งคำตอบ ตรวจสอบด้วย Signed Token โดยไม่ต้องเก็บ session ใน memory |
| `/api/rounds/skip` | POST | ข้าม Stage ปลดล็อกความยาวเสียงคลิปถัดไป |
| `/api/daily` | GET | ดึง 5 เพลง Daily Challenge ประจำวัน (เวลาไทย UTC+7) |
| `/api/cron/daily` | GET | Cron Job สร้าง Daily Challenge ล่วงหน้าประจำวัน |
| `/api/artists` | GET | ดึงรายชื่อศิลปินพร้อมจำนวนเพลงในคลัง |
| `/api/artists/sync` | POST | ดึงเพลงจาก iTunes สูงสุด 200 เพลงและ Batch Upsert เข้า Supabase / SQLite |
| `/api/leaderboard` | GET / POST | ดูอันดับและบันทึกคะแนนผู้เล่น |

---

## 💖 อ้างอิงและกิตติกรรมประกาศ (Credits & Attribution)

โปรเจกต์นี้ได้รับการพัฒนาขึ้นโดยอ้างอิงไอเดียและงานออกแบบระดับมาสเตอร์พีซจาก:
- **Original Website:** [Songspot (https://songspot.co/)](https://songspot.co/)
- **Special Credit:** ขอขอบคุณทีมงานผู้สร้าง **Songspot** สำหรับแนวคิดเกมทายเพลงจากเสี้ยววินาทีที่ยอดเยี่ยม ประสบการณ์ผู้ใช้ที่ลื่นไหล และไอเดีย Timeline การฟังเพลงที่ท้าทาย

*Disclaimer: โปรเจกต์ BeatDrop จัดทำขึ้นเพื่อการศึกษา พัฒนาทักษะ Full-Stack TypeScript และเพื่อความบันเทิงของกลุ่มผู้ฟังเพลง โดยข้อมูลเสียงพรีวิวความยาว 30 วินาทีถูกส่งตรงจาก Apple iTunes Public Search API เพื่อใช้เป็นตัวอย่างเท่านั้น*

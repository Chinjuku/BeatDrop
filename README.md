# 🎵 BeatDrop (TH & INTL)

> **BeatDrop** — เกมทายเพลงไทยและเพลงสากลจากเสี้ยววินาที (Snippet Music Guessing Game) ที่สร้างแรงบันดาลใจและถอดรหัสงานออกแบบจาก [Songspot (songspot.co)](https://songspot.co/) พร้อมอัปเกรดฟีเจอร์สำหรับแฟนเพลงชาวไทยและสากลเต็มรูปแบบ

---

## 🌟 จุดเด่นและฟีเจอร์หลัก (Features)

### 1. 🇹🇭 & 🌍 หมวดหมู่เพลงไทย เพลงสากล และ Mixed รวมฮิต
- **เพลงไทย (TH):** คลังเพลง T-Pop, สตริง, ร็อก, อินดี้ (Three Man Down, Tilly Birds, NONT TANONT, Palmy, Bodyslam, Jeff Satur, 4EVE, PROXIE, ฯลฯ)
- **เพลงสากล (INTL):** คลังเพลงฮิตระดับโลก (Taylor Swift, Olivia Rodrigo, The Weeknd, Bruno Mars, Dua Lipa, Billie Eilish, ฯลฯ)
- **Mixed รวมฮิต:** ผสมผสานเพลงไทยและสากลร่วมกัน

### 2. 🎮 โหมดการเล่นหลากหลาย (Game Modes)
- **โหมดทั่วไป (Default / 3-Row Reels):** จำลอง UI Reel 3 แถวแบบ Songspot (`GENRES`, `ERAS`, `ARTISTS`) เลือกผสมหมวดได้อย่างอิสระ
- **🎯 Song Guesser (Hear it. Pick it.):** โหมด 4 ตัวเลือก (A, B, C, D) ไม่ต้องพิมพ์หา ฟังคลิปเสียงแล้วแตะเลือกคำตอบได้ทันที
- **📅 Daily Challenge:** ทายเพลง 5 ข้อประจำวัน (สุ่มด้วย Deterministic Seed วันที่ YYYY-MM-DD ชุดเดียวกันทุกคน)
- **🏆 Leaderboard:** บันทึกคะแนนและแสดงตารางจัดอันดับประจำวัน
- **🎤 Artist Mode:** ล็อกเป้าหมายทายเฉพาะเพลงของศิลปินคนโปรด พร้อมระบบค้นหาเพลงที่ถูก Scope เฉพาะศิลปินนั้น
- **📆 Year / Era Mode:** เลือกทายตามยุคสมัย (2020s, 2010s, 2000s หรือเจาะจงปี 2000-2026)
- **🎸 Genre Mode:** เจาะจงแนวเพลง เช่น T-Pop, Rock, Pop, Indie, Hip-Hop, R&B

### 3. ⚡ เลือกระดับความยากได้ 5 ระดับ (Difficulty Levels)
1. **Easy:** 3s → 5s → 10s → 15s (ปลดล็อกเร็ว เพลงฮิต)
2. **Medium:** 1s → 2s → 4s → 8s → 15s (มาตรฐาน)
3. **Hard:** 0.5s → 1s → 2.5s → 5s → 10s
4. **Expert:** 0.2s → 0.5s → 1.5s → 3s → 6s
5. **Impossible:** 0.1s → 0.3s → 0.8s → 2s → 4s (เสี้ยววินาทีระดับหูทิพย์)

### 4. 💿 Vinyl Spin & 30s Post-Game Player
- เมื่อทายถูกหรือเฉลยเพลง แผ่นเสียงไวนิลหมุน 360 องศา พร้อมเล่นคลิปพรีวิวเต็ม 30 วินาทีแบบ Hi-Res พร้อม Seek Bar ควบคุมเสียง
- สรุปผลลัพธ์ด้วย Emoji Grid (`🟩`, `🟥`, `⬜`) เพื่อแชร์ลง Social Media ได้ทันที

### 5. 🎨 Multi-Theme System & Thai Font
- รองรับธีมสีหลากหลาย (BeatDrop Default Emerald Dark, Spotify Studio, Sunset Glow, Cyber Neon, Crimson Dark, Minimal Pure Light)
- ตัวอักษรภาษาไทยคมชัดสวยงามด้วย Google Fonts **Noto Sans Thai**

---

## 🛠️ สถาปัตยกรรมและเทคโนโลยี (Tech Stack)

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Custom Audio Controller Hooks
- **Backend:** Node.js, Express, TypeScript, iTunes Search API Engine (พร้อม In-Memory Cache & Deep Catalog Warmup 100+ tracks/artist)
- **Design Inspiration:** ถอดรหัส UI/UX, CSS Variables, Timeline Segment Logic จาก [songspot.co](https://songspot.co/)

---

## 🚀 วิธีการติดตั้งและรันในเครื่อง (Installation & Setup)

### 1. ข้อกำหนดของระบบ (Prerequisites)
- [Node.js](https://nodejs.org/) เวอร์ชั่น 18.0.0 ขึ้นไป
- `npm` หรือ `pnpm` / `yarn`

### 2. โคลนโปรเจกต์และติดตั้ง Dependencies

เปิด Terminal และรันคำสั่ง:

```bash
# 1. ติดตั้ง dependencies ของฝั่ง Server
cd server
npm install

# 2. ติดตั้ง dependencies ของฝั่ง Client
cd ../client
npm install
```

### 3. เริ่มรันโปรเจกต์ (Development Mode)

แนะนำให้เปิด 2 หน้าต่าง Terminal:

**Terminal 1 (Backend Server):**
```bash
cd server
npm run dev
```
> Server จะเริ่มทำงานที่: `http://localhost:3001` พร้อมระบบ Warmup คลังเพลงไทยและสากลอัตโนมัติ

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
```
> Vite จะเปิด Web App ที่: `http://localhost:5173` (มี Proxy ส่ง request `/api/*` ไปยังพอร์ต 3001)

เปิดบราวเซอร์ไปที่ `http://localhost:5173` เพื่อเริ่มเล่นเกมได้ทันที! 🎉

---

## 📦 การ Build สำหรับ Production

```bash
# Build Client
cd client
npm run build

# Build Server
cd ../server
npm run build
```

---

## 💖 อ้างอิงและกิตติกรรมประกาศ (Credits & Attribution)

โปรเจกต์นี้ได้รับการพัฒนาขึ้นโดยอ้างอิงไอเดียและงานออกแบบระดับมาสเตอร์พีซจาก:
- **Original Website:** [Songspot (https://songspot.co/)](https://songspot.co/)
- **Special Credit:** ขอขอบคุณทีมงานผู้สร้าง **Songspot** สำหรับแนวคิดเกมทายเพลงจากเสี้ยววินาทีที่ยอดเยี่ยม ประสบการณ์ผู้ใช้ที่ลื่นไหล และไอเดีย Timeline การฟังเพลงที่ท้าทาย

*Disclaimer: โปรเจกต์ BeatDrop จัดทำขึ้นเพื่อการศึกษา พัฒนาทักษะ Full-Stack TypeScript และเพื่อความบันเทิงของกลุ่มผู้ฟังเพลง โดยข้อมูลเสียงพรีวิวความยาว 30 วินาทีถูกส่งตรงจาก Apple iTunes Public Search API เพื่อใช้เป็นตัวอย่างเท่านั้น*


import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black mb-4 border"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--song-accent) 15%, transparent)',
          borderColor: 'var(--song-accent)',
          color: 'var(--song-accent-text)',
        }}
      >
        404
      </div>
      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2">
        ไม่พบหน้าที่คุณต้องการ (Page Not Found)
      </h2>
      <p className="text-xs sm:text-sm max-w-sm mb-6 opacity-75" style={{ color: 'var(--song-muted)' }}>
        หน้าที่คุณกำลังค้นหาอาจถูกย้าย ลบ หรือไม่มีอยู่ในระบบ
      </p>
      <Link
        href="/play"
        className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition hover:brightness-110 shadow-lg"
        style={{
          backgroundColor: 'var(--song-accent)',
          color: 'var(--song-accent-on)',
        }}
      >
        กลับสู่หน้าหลัก (Back to Play)
      </Link>
    </div>
  );
}


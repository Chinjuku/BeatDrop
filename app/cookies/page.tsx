import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '../../components/LegalPage';
import { CookiePreferencesButton } from '../../components/CookiePreferencesButton';
import { CONTACT_EMAIL, SITE_NAME, absoluteUrl } from '../../lib/siteConfig';

const LAST_UPDATED = '2026-11-13';

export const metadata: Metadata = {
  title: 'นโยบายคุกกี้ (Cookie Policy)',
  description:
    `${SITE_NAME} ใช้คุกกี้และที่จัดเก็บข้อมูลในเบราว์เซอร์อย่างไร: รายการคุกกี้ทั้งหมด วัตถุประสงค์ ` +
    'อายุการเก็บ และวิธีเปลี่ยนหรือถอนความยินยอมของคุณ',
  alternates: { canonical: absoluteUrl('/cookies') },
  openGraph: {
    title: `นโยบายคุกกี้ — ${SITE_NAME}`,
    url: absoluteUrl('/cookies'),
    type: 'article',
  },
};

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="นโยบายคุกกี้"
      subtitle={`${SITE_NAME} ใช้คุกกี้เพียงเท่าที่จำเป็น และใช้พื้นที่จัดเก็บในเบราว์เซอร์ (localStorage / sessionStorage) เพื่อให้เกมทำงานและจำการตั้งค่าของคุณ หน้านี้ระบุทุกรายการอย่างครบถ้วน`}
      updated={LAST_UPDATED}
    >
      <LegalSection id="what" heading="1. คุกกี้คืออะไร และเราใช้อะไรแทน">
        <p>
          คุกกี้คือไฟล์ข้อความขนาดเล็กที่เว็บไซต์ฝากไว้ในเบราว์เซอร์และถูกส่งกลับไปที่เซิร์ฟเวอร์ในทุกคำขอ
          {SITE_NAME} ใช้คุกกี้เพียงรายการเดียวคือการบันทึกตัวเลือกความยินยอมของคุณ
          ส่วนข้อมูลการเล่นเกมอื่น ๆ เราเก็บใน <strong>localStorage</strong> และ <strong>sessionStorage</strong>{' '}
          ซึ่งอยู่ในอุปกรณ์ของคุณและ<strong>ไม่</strong>ถูกส่งไปที่เซิร์ฟเวอร์โดยอัตโนมัติ
          นโยบายนี้ครอบคลุมทั้งสองแบบ
        </p>
      </LegalSection>

      <LegalSection id="necessary" heading="2. จำเป็นต่อการใช้งาน (ปิดไม่ได้)">
        <table>
          <caption className="sr-only">รายการที่จัดเก็บซึ่งจำเป็นต่อการใช้งาน</caption>
          <thead>
            <tr>
              <th scope="col">ชื่อ</th>
              <th scope="col">ชนิด</th>
              <th scope="col">วัตถุประสงค์</th>
              <th scope="col">อายุ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>beatdrop_consent</code>
              </td>
              <td>คุกกี้ (first-party)</td>
              <td>จำว่าคุณอนุญาตหรือปฏิเสธคุกกี้หมวดที่เป็นทางเลือก</td>
              <td>180 วัน</td>
            </tr>
            <tr>
              <td>
                <code>beatdrop_admin_key</code>
              </td>
              <td>sessionStorage</td>
              <td>เก็บคีย์ผู้ดูแลระบบระหว่างเซสชัน เฉพาะผู้ที่เข้าหน้าผู้ดูแลเท่านั้น</td>
              <td>ปิดแท็บแล้วหาย</td>
            </tr>
            <tr>
              <td>
                <code>beatdrop_lb_sub_*</code>
              </td>
              <td>sessionStorage</td>
              <td>ป้องกันการส่งคะแนนขึ้นลีดเดอร์บอร์ดซ้ำในเซสชันเดียวกัน</td>
              <td>ปิดแท็บแล้วหาย</td>
            </tr>
          </tbody>
        </table>
      </LegalSection>

      <LegalSection id="preferences" heading="3. การตั้งค่าและความชอบ (ต้องได้รับความยินยอม)">
        <p>
          ทุกรายการใช้คำนำหน้า <code>songspot:</code> ใน localStorage และถูกลบทั้งหมดทันทีเมื่อคุณปิดหมวดนี้
        </p>
        <table>
          <caption className="sr-only">รายการที่จัดเก็บสำหรับการตั้งค่าและความชอบ</caption>
          <thead>
            <tr>
              <th scope="col">ชื่อ</th>
              <th scope="col">วัตถุประสงค์</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>songspot:theme-id</code>, <code>songspot:sync-difficulty-accent</code>
              </td>
              <td>ธีมสีที่เลือกและการซิงก์สีตามระดับความยาก</td>
            </tr>
            <tr>
              <td>
                <code>songspot:time-range-preset</code>, <code>songspot:custom-stages</code>
              </td>
              <td>พรีเซ็ตความยาวสนิปเพ็ตและค่าที่คุณตั้งเอง</td>
            </tr>
            <tr>
              <td>
                <code>songspot:streak</code>, <code>songspot:best-streak</code>,{' '}
                <code>songspot:fastest-time</code>
              </td>
              <td>สถิติส่วนตัวของคุณ</td>
            </tr>
            <tr>
              <td>
                <code>songspot:played-ids</code>
              </td>
              <td>รายการเพลงที่เพิ่งเล่น เพื่อลดการสุ่มซ้ำ</td>
            </tr>
            <tr>
              <td>
                <code>songspot:daily-category</code>, <code>songspot:daily-difficulty</code>,{' '}
                <code>songspot:daily-active-round</code>
              </td>
              <td>ตัวเลือกและความคืบหน้าของ Daily Challenge บนอุปกรณ์นี้</td>
            </tr>
            <tr>
              <td>
                <code>songspot:custom-artists</code>
              </td>
              <td>ศิลปินที่คุณเพิ่มไว้เองในเครื่อง</td>
            </tr>
            <tr>
              <td>
                <code>songspot:player-name</code>
              </td>
              <td>ชื่อที่คุณใช้ส่งคะแนน เพื่อไม่ต้องพิมพ์ใหม่ทุกครั้ง</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>หมายเหตุ:</strong> การปิดหมวดนี้ไม่ลบคะแนนที่คุณ<em>ส่งขึ้นลีดเดอร์บอร์ดแล้ว</em>{' '}
          เพราะคะแนนนั้นอยู่ในฐานข้อมูลของเรา หากต้องการให้ลบ โปรดดู{' '}
          <Link href="/privacy#rights">สิทธิของคุณ</Link>
        </p>
      </LegalSection>

      <LegalSection id="analytics" heading="4. สถิติการใช้งาน (ต้องได้รับความยินยอม)">
        <p>
          ปัจจุบัน {SITE_NAME} <strong>ยังไม่ได้ติดตั้ง</strong> เครื่องมือวิเคราะห์การใช้งานใด ๆ
          และหมวดนี้ปิดเป็นค่าเริ่มต้น เราเตรียมหมวดนี้ไว้ล่วงหน้าเพื่อให้โปร่งใส
          หากในอนาคตเราเพิ่มการวัดผลแบบรวมและไม่ระบุตัวบุคคล เครื่องมือนั้นจะทำงานเฉพาะเมื่อคุณเปิดหมวดนี้
          และเราจะอัปเดตหน้านี้พร้อมขอความยินยอมใหม่ก่อนเริ่มใช้งาน
        </p>
      </LegalSection>

      <LegalSection id="third-party" heading="5. เนื้อหาจากภายนอก">
        <p>
          บางส่วนของหน้าโหลดทรัพยากรจากโดเมนอื่น ซึ่งผู้ให้บริการเหล่านั้นจะเห็นที่อยู่ IP และ User-Agent ของคุณ
          แต่เราไม่ได้ฝังตัวติดตามเพื่อโฆษณา
        </p>
        <ul>
          <li>
            <strong>Apple iTunes</strong> — ไฟล์ตัวอย่างเสียงและภาพปกอัลบั้ม
          </li>
          <li>
            <strong>Google Fonts</strong> — ฟอนต์ Noto Sans Thai
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="manage" heading="6. วิธีจัดการความยินยอม">
        <ul>
          <li>กดปุ่มด้านล่างเพื่อเปิดแผงตั้งค่า เปลี่ยนได้ทุกเมื่อ</li>
          <li>
            ลบคุกกี้และข้อมูลเว็บไซต์ในเบราว์เซอร์ของคุณ เพื่อรีเซ็ตทุกอย่างและให้เราถามความยินยอมใหม่
          </li>
          <li>
            การปิดคุกกี้ทั้งหมดในระดับเบราว์เซอร์ยังเล่นเกมได้ แต่การตั้งค่าจะไม่ถูกจำ
            และเราจะถามความยินยอมใหม่ทุกครั้งที่เข้าเว็บ
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <CookiePreferencesButton />
          <Link
            href="/privacy"
            className="rounded-xl border px-4 py-2.5 text-xs font-extrabold no-underline transition hover:bg-white/5"
            style={{ borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
          >
            อ่านนโยบายความเป็นส่วนตัว
          </Link>
        </div>
      </LegalSection>

      <LegalSection id="contact" heading="7. ติดต่อเรา">
        <p>
          คำถามเกี่ยวกับคุกกี้หรือข้อมูลส่วนบุคคล ส่งมาที่{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}

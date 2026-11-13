import { Link } from '../../i18n/navigation';
import { LegalSection, LegalTable } from '../LegalPage';
import { CookiePreferencesButton } from '../CookiePreferencesButton';
import { CONTACT_EMAIL, SITE_NAME } from '../../lib/siteConfig';

/** Thai privacy policy body. Keep sections, tables and links in step with PrivacyContentEn. */
export function PrivacyContentTh() {
  return (
    <>
    <LegalSection id="scope" heading="1. ขอบเขตและผู้ควบคุมข้อมูล">
      <p>
        นโยบายนี้ใช้กับเว็บแอป {SITE_NAME} และ API ภายใต้โดเมนเดียวกัน ไม่ครอบคลุมเว็บไซต์ภายนอกที่เราลิงก์ไปถึง
        หากมีคำถามหรือต้องการใช้สิทธิของคุณ ติดต่อได้ที่{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
      <p>
        <strong>เราไม่มีระบบบัญชีผู้ใช้</strong> คุณไม่ต้องให้ชื่อ อีเมล หรือเบอร์โทรเพื่อเล่นเกม
      </p>
    </LegalSection>

    <LegalSection id="data" heading="2. ข้อมูลที่เราเก็บ">
      <LegalTable label="ประเภทข้อมูล วัตถุประสงค์ ที่จัดเก็บ และระยะเวลา">
        <table>
          <caption className="sr-only">ประเภทข้อมูล วัตถุประสงค์ ที่จัดเก็บ และระยะเวลา</caption>
          <thead>
            <tr>
              <th scope="col">ข้อมูล</th>
              <th scope="col">วัตถุประสงค์</th>
              <th scope="col">จัดเก็บที่</th>
              <th scope="col">ระยะเวลา</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>การตั้งค่าเกม (ธีม ความยาวสนิปเพ็ต โหมด หมวดหมู่ ระดับความยาก)</td>
              <td>จำค่าที่คุณเลือกไว้เมื่อกลับมาเล่นอีกครั้ง</td>
              <td>localStorage ในอุปกรณ์ของคุณ</td>
              <td>จนกว่าคุณจะลบ หรือถอนความยินยอมหมวด &ldquo;การตั้งค่า&rdquo;</td>
            </tr>
            <tr>
              <td>สถิติส่วนตัว (สตรีค สตรีคสูงสุด เวลาที่เร็วที่สุด เพลงที่เคยเล่น)</td>
              <td>แสดงความคืบหน้าและเลี่ยงการสุ่มเพลงซ้ำ</td>
              <td>localStorage ในอุปกรณ์ของคุณ</td>
              <td>เช่นเดียวกับข้างต้น</td>
            </tr>
            <tr>
              <td>ชื่อผู้เล่นที่คุณพิมพ์เอง และคะแนน Daily Challenge</td>
              <td>แสดงบนลีดเดอร์บอร์ดสาธารณะ</td>
              <td>ฐานข้อมูลของเรา (Supabase, PostgreSQL)</td>
              <td>เก็บเป็นสถิติการแข่งขัน จนกว่าคุณจะขอให้ลบ</td>
            </tr>
            <tr>
              <td>Round token (ลายเซ็น HMAC ของรอบเกม)</td>
              <td>ตรวจสอบคำตอบและเวลาที่ฝั่งเซิร์ฟเวอร์ เพื่อกันการโกง</td>
              <td>ส่งไปกลับระหว่างเบราว์เซอร์กับ API</td>
              <td>หมดอายุเมื่อจบรอบ</td>
            </tr>
            <tr>
              <td>ตัวเลือกความยินยอมคุกกี้</td>
              <td>จำว่าคุณอนุญาตหรือปฏิเสธหมวดใด</td>
              <td>คุกกี้ <code>beatdrop_consent</code> (first-party)</td>
              <td>180 วัน</td>
            </tr>
            <tr>
              <td>ข้อมูลคำขอทางเทคนิค (IP, User-Agent, เส้นทาง, เวลา)</td>
              <td>ความปลอดภัย การจำกัดอัตราการเรียก (rate limiting) และแก้ไขข้อผิดพลาด</td>
              <td>ล็อกของผู้ให้บริการโฮสต์ (Vercel) และ Upstash Redis</td>
              <td>ตามรอบการเก็บล็อกของผู้ให้บริการ โดยทั่วไปไม่เกิน 30 วัน</td>
            </tr>
          </tbody>
        </table>
      </LegalTable>
      <p>
        <strong>เราไม่เก็บ</strong> ข้อมูลการชำระเงิน ข้อมูลตำแหน่งที่แม่นยำ รายชื่อผู้ติดต่อ
        เสียงจากไมโครโฟน หรือข้อมูลอ่อนไหวตามกฎหมาย และเราไม่ขายข้อมูลของคุณให้ใคร
      </p>
    </LegalSection>

    <LegalSection id="legal-basis" heading="3. ฐานทางกฎหมาย">
      <ul>
        <li>
          <strong>ความจำเป็นในการให้บริการตามที่คุณขอ</strong> — การสร้างรอบเกม การตรวจคำตอบ และการส่งคะแนนที่คุณกดส่งเอง
        </li>
        <li>
          <strong>ประโยชน์อันชอบธรรม</strong> — ความปลอดภัยของระบบ การป้องกันการโกงและการใช้งานในทางที่ผิด
        </li>
        <li>
          <strong>ความยินยอม</strong> — การจำการตั้งค่าในเครื่อง และสถิติการใช้งานแบบไม่ระบุตัวบุคคล
          ซึ่งคุณถอนได้ทุกเมื่อ
        </li>
      </ul>
    </LegalSection>

    <LegalSection id="third-parties" heading="4. ผู้ให้บริการภายนอก">
      <ul>
        <li>
          <strong>Vercel</strong> — โฮสต์เว็บแอปและ API (ล็อกคำขอ)
        </li>
        <li>
          <strong>Supabase</strong> — ฐานข้อมูล PostgreSQL สำหรับแค็ตตาล็อกเพลง ศิลปิน และลีดเดอร์บอร์ด
        </li>
        <li>
          <strong>Upstash Redis</strong> — แคชและการจำกัดอัตราการเรียก (ถ้าเปิดใช้งาน)
        </li>
        <li>
          <strong>Apple iTunes Search API</strong> — แหล่งข้อมูลเพลงและไฟล์ตัวอย่างเสียงสาธารณะ
          เมื่อเบราว์เซอร์ของคุณโหลดตัวอย่างเสียงหรือภาพปกอัลบั้ม Apple อาจเห็น IP ของคุณ
        </li>
        <li>
          <strong>Google Fonts</strong> — ฟอนต์ Noto Sans Thai ซึ่งโหลดจากเซิร์ฟเวอร์ของ Google
        </li>
      </ul>
      <p>
        เราไม่ได้ติดตั้งเครือข่ายโฆษณาหรือตัวติดตามข้ามเว็บไซต์ (cross-site tracker) ใด ๆ
      </p>
    </LegalSection>

    <LegalSection id="children" heading="5. ผู้เยาว์">
      <p>
        {SITE_NAME} เหมาะกับผู้เล่นทุกวัยและไม่ได้มุ่งเก็บข้อมูลจากเด็กโดยเฉพาะ
        โปรดอย่าใส่ชื่อจริง อีเมล หรือข้อมูลที่ระบุตัวตนในช่องชื่อผู้เล่นของลีดเดอร์บอร์ด
        เพราะชื่อดังกล่าวจะแสดงต่อสาธารณะ
      </p>
    </LegalSection>

    <LegalSection id="rights" heading="6. สิทธิของคุณ">
      <ul>
        <li>ขอเข้าถึง แก้ไข หรือลบข้อมูลที่เราเก็บไว้ในฐานข้อมูล เช่น ชื่อผู้เล่นบนลีดเดอร์บอร์ด</li>
        <li>ถอนความยินยอมสำหรับคุกกี้/ที่จัดเก็บข้อมูลที่เป็นทางเลือกได้ทุกเมื่อ</li>
        <li>คัดค้านการประมวลผลที่อาศัยประโยชน์อันชอบธรรม</li>
        <li>ร้องเรียนต่อหน่วยงานกำกับดูแลด้านข้อมูลส่วนบุคคลในประเทศของคุณ</li>
      </ul>
      <p>
        ข้อมูลที่เก็บในเครื่องของคุณ คุณลบได้เองทั้งหมดโดยปฏิเสธหมวด &ldquo;การตั้งค่า&rdquo;
        หรือล้างข้อมูลเว็บไซต์ในเบราว์เซอร์ สำหรับคำขออื่น ส่งอีเมลมาที่{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> เราจะตอบกลับภายใน 30 วัน
      </p>
    </LegalSection>

    <LegalSection id="security" heading="7. ความปลอดภัย">
      <p>
        การรับส่งข้อมูลทั้งหมดใช้ HTTPS คะแนนและเวลาถูกตรวจสอบที่ฝั่งเซิร์ฟเวอร์ด้วย token ที่เซ็นด้วย HMAC
        และคีย์ความลับถูกเก็บเป็นตัวแปรสภาพแวดล้อมฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งไปที่เบราว์เซอร์
        อย่างไรก็ดี ไม่มีระบบใดปลอดภัยสมบูรณ์ หากพบช่องโหว่โปรดแจ้งเราทางอีเมล
      </p>
    </LegalSection>

    <LegalSection id="changes" heading="8. การแก้ไขนโยบาย">
      <p>
        หากมีการเปลี่ยนแปลงที่กระทบสาระสำคัญ เราจะอัปเดตวันที่ด้านบนและขอความยินยอมใหม่เมื่อจำเป็น
      </p>
    </LegalSection>

    <LegalSection id="controls" heading="9. จัดการความยินยอมของคุณ">
      <p>
        เปิดแผงตั้งค่าได้ที่นี่ หรือจากลิงก์ &ldquo;การตั้งค่าคุกกี้&rdquo; ที่ด้านล่างของทุกหน้า
      </p>
      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
        <CookiePreferencesButton />
        <Link
          href="/cookies"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-xs font-extrabold no-underline transition hover:bg-white/5"
          style={{ borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
        >
          อ่านนโยบายคุกกี้
        </Link>
      </div>
    </LegalSection>
    </>
  );
}

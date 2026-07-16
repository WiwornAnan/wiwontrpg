// Buff / Debuff catalogues shared by the Dweller Sheet and the Librarian Sheet.
// [key, label, desc]
export const BUFF_EFFECTS: [string, string, string][] = [
  ['Blessed', 'ได้รับพร (Blessed)', 'ทอยได้สถานการณ์เป็นใจในครั้งถัดไป'],
  ['Inspired', 'ฮึกเหิม (Inspired)', 'ได้โบนัสลูกเต๋าเสริมในการกระทำ'],
  ['Hasted', 'เร่งความเร็ว (Hasted)', 'ระยะก้าวเพิ่มขึ้น · ได้ AP เพิ่ม'],
  ['Shielded', 'ปกป้อง (Shielded)', 'NA เพิ่มขึ้นชั่วคราว'],
  ['Regenerating', 'ฟื้นฟู (Regenerating)', 'ฟื้น Scratch ทุกเทิร์น'],
  ['Empowered', 'เสริมพลัง (Empowered)', 'ความเสียหายเพิ่มขึ้น'],
  ['Focused', 'จดจ่อ (Focused)', 'ทักษะที่เลือกได้เปรียบ'],
  ['Warded', 'ป้องกันเวท (Warded)', 'ต้านทานเวทมนตร์'],
  ['Hidden', 'พรางตัว (Hidden)', 'ตรวจจับได้ยาก'],
  ['Fortified', 'แข็งแกร่ง (Fortified)', 'ต้านทานสถานะผิดปกติ'],
];
export const STATUS_EFFECTS: [string, string, string][] = [
  ['มานาเฮือดแห้ง', 'มานาเฮือดแห้ง (Mana Drained)', 'มานาติดลบ — ฟื้นฟูช้า ใช้เวทที่ต้องมานาไม่ได้จนกว่าจะกลับมาเป็นบวก'],
  ['Injured', 'บาดเจ็บ', 'เคลื่อนไหวช้าลงครึ่งหนึ่ง · STR ได้สถานการณ์ไม่เป็นใจ'],
  ['Bleeding', 'เลือดออก', 'Scratch −2 ทุกครั้งที่ติ๊ก Action Point'],
  ['Fractured', 'กระดูกร้าว', 'ช้าลงครึ่งหนึ่ง · Ego Dice เหลือ D4'],
  ['Broken', 'กระดูกหัก', 'ไม่สามารถใช้อวัยวะนั้นได้'],
  ['Maimed', 'อวัยวะเสียหาย', 'แขนขาด นิ้วขาด ตาบอด (ระบุตำแหน่ง)'],
  ['Internal Injury', 'ช้ำใน', 'STR ได้สถานการณ์ไม่เป็นใจ'],
  ['Infected', 'ติดเชื้อ', 'ลดผลฟื้นฟู Scratch ลงครึ่งหนึ่ง'],
  ['Slowed', 'ชะงัก', 'ความเร็วลดลง'],
  ['Entangled', 'ติดพัน', 'ขยับได้ยาก'],
  ['Immobilized', 'ถูกตรึง', 'เคลื่อนไหวไม่ได้ แต่ยังสู้ได้'],
  ['Prone', 'ล้ม', 'หลบระยะไกลง่าย · สู้ประชิดเสียเปรียบ'],
  ['Knocked Down', 'หงายหลัง', 'ล้มพร้อมเสียจังหวะ'],
  ['Grappled', 'ถูกจับล็อก', 'ต้องทอย 3RR ชนะการจับกุม'],
  ['Overburdened', 'แบกภาระเกิน', 'น้ำหนักมากไป · ระยะก้าวครึ่งเดียว'],
  ['Blind', 'ตาบอด', 'การกระทำที่ใช้การมองเห็นทำไม่ได้'],
  ['Deaf', 'หูหนวก', 'การกระทำที่ใช้การได้ยินทำไม่ได้'],
  ['Dazed', 'มึนงง', 'ทุกการกระทำได้สถานการณ์ไม่เป็นใจ'],
  ['Confused', 'สับสน', 'แยกมิตร/ศัตรูยาก'],
  ['Stunned', 'ช็อก', 'เสียการกระทำ 1 เทิร์น'],
  ['Paralyzed', 'อัมพาต', 'ขยับไม่ได้'],
  ['Unconscious', 'สลบ', 'หมดสติ'],
  ['Burning', 'ถูกเผาไหม้', 'Scratch d6/d8/d10 ทุกเทิร์น'],
  ['Frozen', 'แช่แข็ง', 'เคลื่อนที่ลำบาก'],
  ['Wet', 'เปียก', 'มีผลกับไฟฟ้าและความหนาว'],
  ['Poisoned', 'สารพิษสะสม', 'ทานอาหาร/น้ำไม่ได้จนพิษออก'],
  ['Suffocating', 'ขาดอากาศ', 'นับถอยหลัง 10 + END เทิร์น'],
  ['Fear', 'หวาดกลัว', 'ไม่กล้าเข้าใกล้เป้าหมาย'],
  ['Panic', 'ตื่นตระหนก', 'ทำอะไรไม่ได้จนได้สติ'],
  ['Despair', 'สิ้นหวัง', 'Willpower ไม่คืนกลับ'],
  ['Madness', 'คลุ้มคลั่ง', 'ใช้ทักษะ AUT/CVN ไม่ได้'],
  ['Hallucinating', 'ประสาทหลอน', 'เห็นสิ่งที่ไม่มีอยู่จริง'],
  ['Possessed', 'ถูกครอบงำ', 'มีบางสิ่งควบคุมร่างคุณ'],
  ['Hungry', 'หิว', 'ไม่กิน 1 อาทิตย์ → ลด Wounds'],
  ['Thirsty', 'กระหาย', 'ไม่ดื่ม 3 วัน → ลด Wounds'],
  ['Sleep-Deprived', 'อดนอน', 'เสียค่าสติวันละ d6 SAN'],
];

export interface CampaignMemberDTO { memberId: string; character: import('@wiwonanant/shared').Character }
export interface CampaignDTO {
  id: string;
  name: string;
  joinCode: string;
  librarianUserId: string;
  isLibrarian: boolean;
  data: Record<string, unknown>;
  members: CampaignMemberDTO[];
  extraSlots?: number;
  memberCap?: number;
  createdAt: string;
  updatedAt: string;
}

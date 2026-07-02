import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const devHash = await bcrypt.hash('devpass', 10);
  const userHash = await bcrypt.hash('playerpass', 10);

  const dev = await prisma.user.upsert({
    where: { email: 'dev@wiwonanant.local' },
    update: {},
    create: {
      email: 'dev@wiwonanant.local',
      passwordHash: devHash,
      displayName: 'ผู้พัฒนา',
      role: 'dev',
      devCodeVerifiedAt: new Date(),
      creditBalance: 0,
    },
  });

  const player = await prisma.user.upsert({
    where: { email: 'player@wiwonanant.local' },
    update: {},
    create: {
      email: 'player@wiwonanant.local',
      passwordHash: userHash,
      displayName: 'ผู้เล่นทดลอง',
      role: 'user',
      creditBalance: 12,
    },
  });

  // ---- Core Rules articles (only seed once) ----
  const existing = await prisma.article.count({ where: { category: 'core-rules' } });
  if (existing === 0) {
    const coreDocs = [
      {
        partSection: 'Part 1: World & Lore (Wiwon-Anant)',
        title: 'The Cosmic Genesis',
        summary: 'จุดกำเนิดของจักรวาล WiwonAnant จากความว่างเปล่าอันเต็มไปด้วยศักยภาพ ก่อนกฎเกณฑ์แรกจะถือกำเนิด.',
        bodyText:
          'WiwonAnant เริ่มต้นจากความว่างเปล่าอันเต็มไปด้วยศักยภาพ ก่อนกฎเกณฑ์แรกของจักรวาลจะถือกำเนิด.\n\nเนื้อหาส่วนนี้วางรากฐานทุกอย่าง ตั้งแต่ที่มาของโลก ระบบเกม ไปจนถึงเวทมนตร์และอสูร ผู้เล่นและ GM ควรเริ่มอ่านจากที่นี่.',
        tags: ['Lore', 'Cosmos', 'Genesis'],
        authorName: 'ทีมพัฒนา',
        status: 'published',
      },
      {
        partSection: 'Part 1: World & Lore (Wiwon-Anant)',
        title: 'The Golden Age',
        summary: 'ยุคทองแห่ง Golden Revelations เมื่อสรรพชีวิตรุ่งเรืองภายใต้แสงสว่างของวิวรณ์อนันต์.',
        bodyText:
          'ยุคทองคือช่วงเวลาที่ Golden Revelations ส่องสว่างทั่วจักรวาล มอบความรู้และพลังแก่ผู้ที่พร้อมรับ.\n\nแต่ทุกยุคทองย่อมมีจุดจบ และเงาของความเปลี่ยนแปลงก็เริ่มคืบคลานเข้ามา.',
        tags: ['Lore', 'History', 'Golden'],
        authorName: 'ทีมพัฒนา',
        status: 'published',
      },
      {
        partSection: 'Part 2: Core Rules & Gameplay',
        title: 'Core Concepts & Game Themes',
        summary: 'แนวคิดหลักและธีมของเกม — จินตนาการที่มีตรรกะรองรับ เพื่อประสบการณ์ TRPG ที่สมจริง.',
        bodyText:
          'WiwonAnant สร้างขึ้นจากความตั้งใจที่จะมอบกรอบตรรกะให้กับจักรวาลแฟนตาซี.\n\nทุกการกระทำถูกตัดสินด้วยระบบลูกเต๋าที่ชัดเจน เพื่อให้ทั้งผู้เล่นและ GM เข้าใจผลลัพธ์ได้ตรงกัน.',
        tags: ['Rules', 'Gameplay', 'Core'],
        authorName: 'ทีมพัฒนา',
        status: 'published',
      },
      {
        partSection: 'Part 2: Core Rules & Gameplay',
        title: 'Dice Rolling',
        summary: 'ระบบการทอยลูกเต๋าหลักที่ใช้ตัดสินผลของการกระทำทุกอย่างในเกม.',
        bodyText:
          'ระบบลูกเต๋าของ WiwonAnant ใช้การเปรียบเทียบผลทอยกับค่าความยาก (TN).\n\nยิ่งทักษะสูง ลูกเต๋าที่ใช้ก็ยิ่งมีขนาดใหญ่ เพิ่มโอกาสความสำเร็จ.',
        tags: ['Rules', 'Dice'],
        authorName: 'ทีมพัฒนา',
        status: 'published',
      },
      {
        partSection: 'Part 2: Core Rules & Gameplay',
        title: 'Turn Structure (ฉบับร่าง)',
        summary: 'โครงสร้างเทิร์นในการต่อสู้ — ยังอยู่ระหว่างการร่างเนื้อหา.',
        bodyText: 'ร่างเนื้อหาเกี่ยวกับลำดับการกระทำในเทิร์น ยังไม่สมบูรณ์.',
        tags: ['Rules', 'Combat'],
        authorName: 'ทีมพัฒนา',
        status: 'draft',
      },
    ];

    let idx = 0;
    for (const d of coreDocs) {
      await prisma.article.create({
        data: {
          category: 'core-rules',
          partSection: d.partSection,
          orderIndex: idx++,
          title: d.title,
          summary: d.summary,
          bodyText: d.bodyText,
          notes: '[]',
          tables: '[]',
          images: '[]',
          tags: JSON.stringify(d.tags),
          authorName: d.authorName,
          status: d.status,
        },
      });
    }
    console.log(`Seeded ${coreDocs.length} core-rules articles`);
  }

  // ---- one home comment (if none) ----
  if ((await prisma.comment.count()) === 0) {
    await prisma.comment.create({
      data: { authorUserId: player.id, body: 'เว็บสวยมากครับ รอเนื้อหา Part ต่อไปอยู่!' },
    });
  }

  console.log('Seeded users:', dev.email, player.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

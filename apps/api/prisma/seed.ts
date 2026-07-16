import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const isProd = process.env.NODE_ENV === 'production';

  // Production: create a dev/admin account from env only (never a hardcoded
  // password on a public site). Dev: create the demo dev + player accounts.
  let dev: { id: string } | null = null;
  let player: { id: string } | null = null;

  if (isProd) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPass) {
      dev = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
          email: adminEmail,
          passwordHash: await bcrypt.hash(adminPass, 10),
          displayName: 'ผู้ดูแลระบบ',
          role: 'dev',
          devCodeVerifiedAt: new Date(),
        },
      });
      console.log('Ensured admin account:', adminEmail);
    } else {
      console.log('No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping admin creation.');
    }
  } else {
    dev = await prisma.user.upsert({
      where: { email: 'dev@wiwonanant.local' },
      update: {},
      create: {
        email: 'dev@wiwonanant.local',
        passwordHash: await bcrypt.hash('devpass', 10),
        displayName: 'ผู้พัฒนา',
        role: 'dev',
        devCodeVerifiedAt: new Date(),
      },
    });
    player = await prisma.user.upsert({
      where: { email: 'player@wiwonanant.local' },
      update: {},
      create: {
        email: 'player@wiwonanant.local',
        passwordHash: await bcrypt.hash('playerpass', 10),
        displayName: 'ผู้เล่นทดลอง',
        role: 'user',
        creditBalance: 12,
      },
    });
  }

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

  // ---- Wiwon covers + articles (seed once) ----
  if ((await prisma.wiwonCover.count()) === 0) {
    const vol1 = await prisma.wiwonCover.create({
      data: {
        name: 'Wiwon เล่มที่ 1',
        updateDateLabel: '15/06/2569',
        heroTitle: 'Cosmic Geography',
        heroSubtitle: 'แผนที่จักรวาล Wiwon ครอบคลุมทวีปนับไม่ถ้วน แต่ละแห่งหล่อหลอมด้วยพลังอาคมที่ผันผวน.',
        hasData: true,
        orderIndex: 0,
      },
    });
    const vol2 = await prisma.wiwonCover.create({
      data: {
        name: 'Wiwon เล่มที่ 2',
        updateDateLabel: '18/06/2569',
        heroTitle: 'Characters & Species',
        heroSubtitle: 'สารบบเผ่าพันธุ์และวัฒนธรรมของสรรพชีวิตในจักรวาล Wiwon.',
        hasData: true,
        orderIndex: 1,
      },
    });
    // empty cover
    await prisma.wiwonCover.create({
      data: { name: 'Wiwon เล่มที่ 3', updateDateLabel: '(เร็ว ๆ นี้)', hasData: false, orderIndex: 2 },
    });

    const wiwonDocs = [
      { cover: vol1.id, part: 'World & Geography', title: 'The World Mapping & Continents', summary: 'ภาพรวมแผนที่โลกและทวีปหลักของ Wiwon.', body: 'จักรวาล Wiwon ประกอบด้วยทวีปมากมายที่เปลี่ยนแปลงตามพลังอาคม.\n\nนักผจญภัยต้องเรียนรู้สัญญาณของ Wiwon เพื่อนำทาง.' },
      { cover: vol1.id, part: 'World & Geography', title: 'The Celestial Realms & Night Sky', summary: 'อาณาจักรสวรรค์และท้องฟ้ายามค่ำคืน.', body: 'เหนือผืนแผ่นดินคืออาณาจักรสวรรค์ที่เต็มไปด้วยความลี้ลับ.' },
      { cover: vol2.id, part: 'Characters & Species', title: 'The Concept of Life in Wiwon-Anant', summary: 'แนวคิดเรื่องชีวิตในจักรวาล Wiwon-Anant.', body: 'ชีวิตในจักรวาลนี้มีรูปแบบหลากหลาย ตั้งแต่มนุษย์ไปจนถึงสิ่งมีชีวิตเหนือธรรมชาติ.' },
    ];
    let widx = 0;
    for (const d of wiwonDocs) {
      await prisma.article.create({
        data: {
          category: 'wiwon',
          wiwonCoverId: d.cover,
          partSection: d.part,
          orderIndex: widx++,
          title: d.title,
          summary: d.summary,
          bodyText: d.body,
          notes: '[]',
          tables: '[]',
          images: '[]',
          tags: JSON.stringify(['Wiwon', 'Lore']),
          authorName: 'ทีมพัฒนา',
          status: 'published',
        },
      });
    }
    console.log(`Seeded ${wiwonDocs.length} wiwon articles across covers`);
  }

  // ---- Characters articles (seed once) ----
  if ((await prisma.article.count({ where: { category: 'characters' } })) === 0) {
    const charDocs = [
      { part: 'Character Foundations', title: 'Primary Attributes', summary: 'คุณลักษณะพื้นฐานหกประการที่นิยามความสามารถของตัวละครทุกตัว.', body: 'คุณลักษณะพื้นฐานครอบคลุมพละกำลัง ความคล่องแคล่ว ความอดทน ไปจนถึงเสน่ห์.\n\nแต่ละค่ากำหนดขนาดลูกเต๋าที่ใช้ในการทดสอบทักษะที่เกี่ยวข้อง.' },
      { part: 'Character Foundations', title: 'Specialized Skills', summary: 'ทักษะเฉพาะทางที่ตัวละครฝึกฝนจนเชี่ยวชาญ.', body: 'ทักษะเฉพาะทางแบ่งเป็นหลายหมวด แต่ละหมวดผูกกับคุณลักษณะพื้นฐานหนึ่งอย่าง.' },
      { part: 'Species & Heritage', title: 'Playable Species', summary: 'เผ่าพันธุ์ที่ผู้เล่นสามารถเลือกสร้างตัวละครได้.', body: 'จักรวาล Wiwon เต็มไปด้วยเผ่าพันธุ์หลากหลาย แต่ละเผ่ามีคุณลักษณะและวัฒนธรรมเฉพาะตัว.' },
    ];
    let cidx = 0;
    for (const d of charDocs) {
      await prisma.article.create({
        data: {
          category: 'characters',
          partSection: d.part,
          orderIndex: cidx++,
          title: d.title,
          summary: d.summary,
          bodyText: d.body,
          notes: '[]',
          tables: '[]',
          images: '[]',
          tags: JSON.stringify(['Character', 'Attributes']),
          authorName: 'ทีมพัฒนา',
          status: 'published',
        },
      });
    }
    console.log(`Seeded ${charDocs.length} characters articles`);
  }

  // ---- Catalog items (seed once per category) ----
  type SeedItem = { name: string; isFeature?: boolean; tags: string[]; source: string; description: string; fields: Record<string, unknown> };
  const catalogSeed: Record<'equipment' | 'magic' | 'monster', SeedItem[]> = {
    equipment: [
      { name: 'Hunter Bow', source: "Player's Handbook", tags: ['Weapon', 'Wood', 'Piercing', 'Two-Handed'], description: 'ธนูล่าสัตว์ฝีมือช่างชำนาญ ยืดหยุ่นและน้ำหนักเบา เป็นที่ไว้วางใจของนักล่าและนักผจญภัย.', fields: { type: 'Weapon', tag: 'Weapon', equipType: 'อาวุธ (Weapon)', dmgBonus: 4, rarity: 'Common', cost: '75 Cr.', costNum: 75, weight: '0.9 kg', weightNum: 0.9, material: 'Wood', availability: 'Kiosk', professionalLevel: 'Amateur', damage: 'Piercing', wielding: 'Two-Handed', requirements: 'Proficiency', source: "Player's Handbook" } },
      { name: 'Heal Potion', source: "Player's Handbook", tags: ['Potion', 'Consumable', 'Restorative'], description: 'ยาฟื้นพลังชีวิตขั้นพื้นฐาน หาซื้อได้ทั่วไป ฟื้น HP เล็กน้อยเมื่อดื่ม.', fields: { type: 'Potion', tag: 'Potion', rarity: 'Poor', cost: '80 Cr.', costNum: 80, weight: '0.28 kg', weightNum: 0.28, material: 'Crystal', availability: 'Common', professionalLevel: 'Amateur', damage: 'None', wielding: 'None', requirements: 'None', source: "Player's Handbook" } },
      { name: 'Iron Greaves', source: "Player's Handbook", tags: ['Armor', 'Metal', 'Defense'], description: 'สนับแข้งเหล็กหลอม ป้องกันขาส่วนล่างได้มั่นคง แลกกับน้ำหนัก.', fields: { type: 'Armor', tag: 'Armor', equipType: 'เกราะ (Armor)', rarity: 'Common', cost: '120 Cr.', costNum: 120, weight: '2.4 kg', weightNum: 2.4, material: 'Metal', availability: 'Smithy', professionalLevel: 'Journeyman', damage: 'None', wielding: 'Worn', requirements: 'Strength', source: "Player's Handbook" } },
      { name: 'Ember Shortblade', source: "Player's Handbook", tags: ['Weapon', 'Metal', 'Fire', 'Slashing'], description: 'ดาบสั้นหลอมจากเหล็กไฟ ใบมีดอุ่นตลอดเวลา สร้างความเสียหายไฟติดตัวเล็กน้อย.', fields: { type: 'Weapon', tag: 'Weapon', equipType: 'อาวุธ (Weapon)', dmgBonus: 6, rarity: 'Uncommon', cost: '210 Cr.', costNum: 210, weight: '1.3 kg', weightNum: 1.3, material: 'Metal', availability: 'Smithy', professionalLevel: 'Journeyman', damage: 'Slashing', wielding: 'One-Handed', requirements: 'Dexterity', source: "Player's Handbook" } },
      { name: 'Rune Lantern', source: 'Arcane Compendium', tags: ['Tool', 'Magic', 'Light', 'Arcane'], description: 'โคมไฟสลักรูนส่องแสงด้วยพลังอาคม ไม่ต้องใช้เชื้อเพลิง และเผยร่องรอยเวทมนตร์รอบตัว.', fields: { type: 'Tool', tag: 'Tool', rarity: 'Rare', cost: '340 Cr.', costNum: 340, weight: '0.6 kg', weightNum: 0.6, material: 'Crystal', availability: 'Vault', professionalLevel: 'Expert', damage: 'None', wielding: 'One-Handed', requirements: 'Proficiency', source: 'Arcane Compendium' } },
    ],
    magic: [
      { name: 'Fireball', source: 'Arcane Compendium', tags: ['Fire', 'Evocation', 'AoE'], description: 'ลูกไฟพลังสูงที่ระเบิดเป็นวงกว้าง สร้างความเสียหาย [3RR+8] แก่ทุกเป้าหมายในรัศมี.', fields: { school: 'Evocation', rarity: 'Rare', tag: 'Fire', cost: '3 Slot', costNum: 3, castLevel: 'V', range: '30 m', duration: 'Instant', components: 'Material', ql: '3 QL', knowledge: '2 KP', curiosity: '3 CP', source: 'Arcane Compendium', type: 'Spell' } },
      { name: 'Arcane Ward', source: 'Arcane Compendium', tags: ['Arcane', 'Abjuration', 'Shield'], description: 'เกราะพลังอาคมที่ดูดซับความเสียหายชั่วคราว ปกป้องผู้ร่ายจากการโจมตี.', fields: { school: 'Abjuration', rarity: 'Uncommon', tag: 'Arcane', cost: '2 Slot', costNum: 2, castLevel: 'III', range: 'Self', duration: '10 min', components: 'Somatic', ql: '2 QL', knowledge: '1 KP', curiosity: '1 CP', source: 'Arcane Compendium', type: 'Spell' } },
      { name: 'Mending Light', source: "Player's Handbook", tags: ['Evocation', 'Water', 'Healing'], description: 'ลำแสงอ่อนโยนที่สมานบาดแผล ฟื้นฟูพลังชีวิต [3RR+3] ให้พันธมิตร.', fields: { school: 'Evocation', rarity: 'Common', tag: 'Water', cost: '1 Slot', costNum: 1, castLevel: 'I', range: 'Touch', duration: 'Instant', components: 'Verbal', ql: '1 QL', knowledge: '1 KP', curiosity: '1 CP', source: "Player's Handbook", type: 'Spell' } },
      { name: 'Grave Grasp', source: 'Arcane Compendium', tags: ['Necromancy', 'Void', 'Control'], description: 'มือแห่งความตายผุดจากพื้น คว้าและตรึงศัตรู สร้างความเสียหาย [3RR+4] ต่อเทิร์น.', fields: { school: 'Necromancy', rarity: 'Rare', tag: 'Void', cost: '4 Slot', costNum: 4, castLevel: 'IV', range: '18 m', duration: 'Instant', components: 'Somatic', ql: '3 QL', knowledge: '3 KP', curiosity: '3 CP', source: 'Arcane Compendium', type: 'Spell' } },
      // features (isFeature)
      { name: 'Iron Stance', isFeature: true, source: "Player's Handbook", tags: ['Stance', 'Defense'], description: 'ตั้งการ์ดมั่นคง ลดความเสียหายที่ได้รับ [3RR+2] ตลอดฉาก.', fields: { class: 'Defender', mode: 'Passive', rarity: 'Common', tag: 'Stance', cost: '2 WP', costNum: 2, duration: '1 scene', ql: '1 QL', knowledge: '1 KP', curiosity: '1 CP', source: "Player's Handbook", type: 'Feature' } },
      { name: 'Rallying Cry', isFeature: true, source: 'GM Guide', tags: ['Active', 'Buff'], description: 'ตะโกนปลุกใจ ฟื้น Willpower และเพิ่มขวัญกำลังใจให้พันธมิตรทั้งหมด.', fields: { class: 'Support', mode: 'Active', rarity: 'Uncommon', tag: 'Active', cost: '4 WP', costNum: 4, duration: 'Once/day', ql: '2 QL', knowledge: '2 KP', curiosity: '2 CP', source: 'GM Guide', type: 'Feature' } },
    ],
    monster: [
      { name: 'Gloom Wisp', source: "Player's Handbook", tags: ['Aberration', 'Void', 'Spectral'], description: 'ดวงวิญญาณมืดที่ล่องลอยในรอยแยกมิติ ดูดกลืนแสงและความทรงจำ โจมตี [3RR+3].', fields: { type: 'Aberration', dr: 'DR 3', drNum: 3, tag: 'Aberration', habitat: 'Void', size: '0.6 m', weight: '2 kg', behavior: 'Cunning', friendliness: 'Hostile', resistances: 'Arcane', source: "Player's Handbook" } },
      { name: 'Cinder Drake', source: 'GM Guide', tags: ['Dragon', 'Fire', 'Cavern'], description: 'มังกรไฟที่อาศัยในถ้ำภูเขาไฟ พ่นเปลวเพลิง [3RR+10] และหวงแหนสมบัติ.', fields: { type: 'Dragon', dr: 'DR 7', drNum: 7, tag: 'Dragon', habitat: 'Cavern', size: '4.5 m', weight: '900 kg', behavior: 'Aggressive', friendliness: 'Hostile', resistances: 'Fire', source: 'GM Guide' } },
      { name: 'Dusk Wolf', source: "Player's Handbook", tags: ['Beast', 'Forest', 'Pack'], description: 'หมาป่าสนธยาที่ล่าเป็นฝูง ปราดเปรียวและดุร้ายเมื่อปกป้องอาณาเขต กัด [3RR+2].', fields: { type: 'Beast', dr: 'DR 2', drNum: 2, tag: 'Beast', habitat: 'Forest', size: '1.4 m', weight: '55 kg', behavior: 'Territorial', friendliness: 'Wary', resistances: 'Physical', source: "Player's Handbook" } },
      { name: 'Stone Sentinel', source: 'Arcane Compendium', tags: ['Elemental', 'Stone', 'Guardian'], description: 'หุ่นหินที่ถูกปลุกด้วยอาคม เฝ้าสถานที่ศักดิ์สิทธิ์อย่างไม่รู้เหน็ดเหนื่อย.', fields: { type: 'Elemental', dr: 'DR 5', drNum: 5, tag: 'Elemental', habitat: 'Cavern', size: '3.0 m', weight: '1200 kg', behavior: 'Passive', friendliness: 'Neutral', resistances: 'Physical', source: 'Arcane Compendium' } },
    ],
  };

  if ((await prisma.catalogItem.count()) === 0) {
    let n = 0;
    for (const [category, list] of Object.entries(catalogSeed)) {
      for (const it of list) {
        await prisma.catalogItem.create({
          data: {
            category,
            isFeature: !!it.isFeature,
            name: it.name,
            subtitle: null,
            fields: JSON.stringify(it.fields),
            description: it.description,
            tags: JSON.stringify(it.tags),
            source: it.source,
            isHomebrew: false,
            isOfficialAdded: false,
          },
        });
        n++;
      }
    }
    // one player-owned homebrew item (dev demo only)
    if (player) {
      await prisma.catalogItem.create({
        data: {
          category: 'equipment',
          name: 'Whisperwind Dagger (โฮมบรูว์)',
          fields: JSON.stringify({ type: 'Weapon', tag: 'Weapon', equipType: 'อาวุธ (Weapon)', dmgBonus: 3, rarity: 'Uncommon', cost: '150 Cr.', costNum: 150, weight: '0.5 kg', weightNum: 0.5, material: 'Metal', availability: 'Quest', damage: 'Slashing', wielding: 'One-Handed' }),
          description: 'มีดสั้นที่ผู้เล่นออกแบบเอง ว่ากันว่าเบาราวสายลม.',
          tags: JSON.stringify(['Weapon', 'Homebrew', 'Wind']),
          source: 'Homebrew',
          isHomebrew: true,
          ownerUserId: player.id,
        },
      });
    }
    console.log(`Seeded ${n} official catalog items`);
  }

  // ---- one home comment (dev demo only) ----
  if (player && (await prisma.comment.count()) === 0) {
    await prisma.comment.create({
      data: { authorUserId: player.id, body: 'เว็บสวยมากครับ รอเนื้อหา Part ต่อไปอยู่!' },
    });
  }

  // Default top-up packages (admin can add/edit/close these later).
  if ((await prisma.topupPackage.count()) === 0) {
    await prisma.topupPackage.createMany({
      data: [
        { label: 'เริ่มต้น', priceTHB: 50, credits: 50, bonusCredits: 0, sortOrder: 1 },
        { label: 'คุ้มค่า', priceTHB: 100, credits: 100, bonusCredits: 10, sortOrder: 2 },
        { label: 'ยอดนิยม', priceTHB: 300, credits: 300, bonusCredits: 50, sortOrder: 3 },
        { label: 'จัดเต็ม', priceTHB: 500, credits: 500, bonusCredits: 100, sortOrder: 4 },
      ],
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

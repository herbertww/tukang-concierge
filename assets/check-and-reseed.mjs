import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// 14 handymen covering all Singapore areas
// services and areas stored as JSON arrays (required by server/db.ts JSON.parse)
const handymen = [
  {
    name: 'Ahmad Bin Razali',
    phone: '+6591234567',
    whatsappPhone: '+6591234567',
    services: JSON.stringify(['plumbing', 'pipe repair', 'toilet repair', 'water heater']),
    areas: JSON.stringify(['Tampines', 'Pasir Ris', 'Bedok', 'Changi']),
    rateMin: 70, rateMax: 90, currency: 'SGD',
    rating: 4.8, reviewCount: 47,
    acraRegistered: 1, acraNumber: 'SG20121234A',
    bio: 'Experienced plumber and general handyman serving East Singapore for 12 years.',
    yearsExperience: 12, available: 1,
  },
  {
    name: 'Ravi Kumar',
    phone: '+6592345678',
    whatsappPhone: '+6592345678',
    services: JSON.stringify(['plumbing', 'pipe repair', 'toilet installation', 'drainage']),
    areas: JSON.stringify(['Jurong West', 'Jurong East', 'Clementi', 'Buona Vista', 'Jurong']),
    rateMin: 65, rateMax: 80, currency: 'SGD',
    rating: 4.7, reviewCount: 63,
    acraRegistered: 1, acraNumber: 'SG20145678B',
    bio: 'Reliable plumber covering Jurong and West Singapore. Fast response, clean work, fair pricing.',
    yearsExperience: 8, available: 1,
  },
  {
    name: 'Muthu Selvam',
    phone: '+6593456789',
    whatsappPhone: '+6593456789',
    services: JSON.stringify(['plumbing', 'drainage', 'waterproofing', 'pipe repair']),
    areas: JSON.stringify(['Jurong West', 'Boon Lay', 'Pioneer', 'Jurong', 'Tuas']),
    rateMin: 60, rateMax: 75, currency: 'SGD',
    rating: 4.9, reviewCount: 112,
    acraRegistered: 1, acraNumber: 'SG20089012C',
    bio: 'Senior plumber with 15 years of experience. Specialises in drainage issues and waterproofing.',
    yearsExperience: 15, available: 1,
  },
  {
    name: 'James Tan',
    phone: '+6594567890',
    whatsappPhone: '+6594567890',
    services: JSON.stringify(['electrical', 'wiring', 'lighting', 'circuit breaker', 'fan installation']),
    areas: JSON.stringify(['Jurong West', 'Jurong East', 'Tuas', 'Lakeside', 'Jurong']),
    rateMin: 75, rateMax: 95, currency: 'SGD',
    rating: 4.8, reviewCount: 78,
    acraRegistered: 1, acraNumber: 'SG20133456D',
    bio: 'Licensed electrician covering Jurong and West Singapore. Handles wiring, lighting, and all electrical faults.',
    yearsExperience: 10, available: 1,
  },
  {
    name: 'Sarah Lim',
    phone: '+6595678901',
    whatsappPhone: '+6595678901',
    services: JSON.stringify(['aircon', 'aircon servicing', 'aircon repair', 'aircon installation', 'gas top up']),
    areas: JSON.stringify(['Jurong West', 'Clementi', 'Dover', 'Buona Vista', 'Jurong', 'West Coast']),
    rateMin: 85, rateMax: 100, currency: 'SGD',
    rating: 5.0, reviewCount: 34,
    acraRegistered: 1, acraNumber: 'SG20117890E',
    bio: 'Top-rated aircon specialist. Handles all brands. Jurong and West Singapore coverage.',
    yearsExperience: 12, available: 1,
  },
  {
    name: 'Wong Ah Kow',
    phone: '+6596789012',
    whatsappPhone: '+6596789012',
    services: JSON.stringify(['plumbing', 'general repair', 'tiling', 'toilet repair']),
    areas: JSON.stringify(['Tiong Bahru', 'Queenstown', 'Buona Vista', 'Redhill', 'Alexandra']),
    rateMin: 65, rateMax: 85, currency: 'SGD',
    rating: 4.6, reviewCount: 29,
    acraRegistered: 1, acraNumber: 'SG20172345F',
    bio: 'Versatile handyman covering Central-South Singapore. Plumbing, tiling, and general repairs.',
    yearsExperience: 6, available: 1,
  },
  {
    name: 'Siva Subramaniam',
    phone: '+6597890123',
    whatsappPhone: '+6597890123',
    services: JSON.stringify(['general repair', 'carpentry', 'painting', 'plumbing', 'electrical', 'handyman']),
    areas: JSON.stringify(['All Singapore', 'Jurong', 'Tampines', 'Woodlands', 'Yishun', 'Ang Mo Kio', 'Bishan', 'Toa Payoh', 'Jurong West', 'Jurong East']),
    rateMin: 55, rateMax: 70, currency: 'SGD',
    rating: 4.5, reviewCount: 201,
    acraRegistered: 1, acraNumber: 'SG20036789G',
    bio: 'All-rounder handyman with 20 years experience. Covers all of Singapore. Affordable rates, reliable service.',
    yearsExperience: 20, available: 1,
  },
  {
    name: 'Tan Wei Ming',
    phone: '+6598901234',
    whatsappPhone: '+6598901234',
    services: JSON.stringify(['electrical', 'aircon', 'appliance repair', 'lighting', 'wiring']),
    areas: JSON.stringify(['Ang Mo Kio', 'Bishan', 'Toa Payoh', 'Serangoon', 'Hougang']),
    rateMin: 80, rateMax: 95, currency: 'SGD',
    rating: 4.7, reviewCount: 56,
    acraRegistered: 1, acraNumber: 'SG20149012H',
    bio: 'Electrical and aircon specialist covering Central-North Singapore. Quick turnaround, transparent pricing.',
    yearsExperience: 9, available: 1,
  },
  {
    name: 'Rajesh Pillai',
    phone: '+6589012345',
    whatsappPhone: '+6589012345',
    services: JSON.stringify(['plumbing', 'waterproofing', 'bathroom renovation', 'pipe repair']),
    areas: JSON.stringify(['Woodlands', 'Yishun', 'Sembawang', 'Canberra', 'Admiralty']),
    rateMin: 68, rateMax: 82, currency: 'SGD',
    rating: 4.6, reviewCount: 41,
    acraRegistered: 1, acraNumber: 'SG20123456I',
    bio: 'Plumbing and waterproofing expert covering North Singapore. Bathroom renovations and pipe repairs.',
    yearsExperience: 11, available: 1,
  },
  {
    name: 'Kevin Ong',
    phone: '+6580123456',
    whatsappPhone: '+6580123456',
    services: JSON.stringify(['carpentry', 'furniture assembly', 'shelving', 'general repair', 'door repair']),
    areas: JSON.stringify(['Punggol', 'Sengkang', 'Hougang', 'Buangkok', 'Fernvale']),
    rateMin: 62, rateMax: 78, currency: 'SGD',
    rating: 4.8, reviewCount: 88,
    acraRegistered: 0, acraNumber: null,
    bio: 'Carpenter and furniture specialist covering North-East Singapore. IKEA assembly, custom shelving, and repairs.',
    yearsExperience: 7, available: 1,
  },
  {
    name: 'Faizal Rahman',
    phone: '+6571234567',
    whatsappPhone: '+6571234567',
    services: JSON.stringify(['painting', 'plastering', 'general repair', 'wall painting', 'touch up']),
    areas: JSON.stringify(['Geylang', 'Aljunied', 'Paya Lebar', 'Eunos', 'Kembangan']),
    rateMin: 60, rateMax: 75, currency: 'SGD',
    rating: 4.5, reviewCount: 33,
    acraRegistered: 0, acraNumber: null,
    bio: 'Painting and plastering specialist covering East-Central Singapore. Clean work, affordable rates.',
    yearsExperience: 8, available: 1,
  },
  {
    name: 'Lim Boon Keng',
    phone: '+6572345678',
    whatsappPhone: '+6572345678',
    services: JSON.stringify(['aircon', 'electrical', 'lighting installation', 'aircon servicing', 'aircon repair']),
    areas: JSON.stringify(['Bukit Timah', 'Holland Village', 'Sixth Avenue', 'King Albert Park', 'Clementi']),
    rateMin: 90, rateMax: 110, currency: 'SGD',
    rating: 4.9, reviewCount: 67,
    acraRegistered: 1, acraNumber: 'SG20096789J',
    bio: 'Premium aircon and electrical services for Central Singapore. Trusted by landed property owners.',
    yearsExperience: 14, available: 1,
  },
  {
    name: 'Suresh Nair',
    phone: '+6573456789',
    whatsappPhone: '+6573456789',
    services: JSON.stringify(['plumbing', 'electrical', 'aircon', 'general repair', 'handyman']),
    areas: JSON.stringify(['Kallang', 'Lavender', 'Bendemeer', 'Boon Keng', 'Potong Pasir']),
    rateMin: 72, rateMax: 88, currency: 'SGD',
    rating: 4.7, reviewCount: 52,
    acraRegistered: 1, acraNumber: 'SG20107890K',
    bio: 'Multi-trade handyman covering Central Singapore. Plumbing, electrical, and aircon all in one.',
    yearsExperience: 13, available: 1,
  },
  {
    name: 'David Chen',
    phone: '+6574567890',
    whatsappPhone: '+6574567890',
    services: JSON.stringify(['renovation', 'tiling', 'carpentry', 'painting', 'floor tiling', 'wall tiling']),
    areas: JSON.stringify(['Marine Parade', 'Katong', 'Siglap', 'Bedok', 'Tampines']),
    rateMin: 82, rateMax: 98, currency: 'SGD',
    rating: 4.8, reviewCount: 74,
    acraRegistered: 1, acraNumber: 'SG20071234L',
    bio: 'Renovation specialist covering East Singapore. Tiling, carpentry, and painting for HDB and condo.',
    yearsExperience: 16, available: 1,
  },
];

// Clear and re-insert with correct JSON format
await db.execute('DELETE FROM reviews');
await db.execute('DELETE FROM handymen');
console.log('Cleared existing data. Inserting', handymen.length, 'handymen with proper JSON arrays...\n');

for (const h of handymen) {
  await db.execute(
    `INSERT INTO handymen (name, phone, whatsappPhone, services, areas, rateMin, rateMax, currency, rating, reviewCount, acraRegistered, acraNumber, bio, yearsExperience, available)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [h.name, h.phone, h.whatsappPhone, h.services, h.areas, h.rateMin, h.rateMax, h.currency, h.rating, h.reviewCount, h.acraRegistered, h.acraNumber, h.bio, h.yearsExperience, h.available]
  );
  const areas = JSON.parse(h.areas);
  const services = JSON.parse(h.services);
  console.log(`  ✓ ${h.name}`);
  console.log(`    Services: ${services.join(', ')}`);
  console.log(`    Areas: ${areas.join(', ')}\n`);
}

// Verify search works
const [final] = await db.execute('SELECT COUNT(*) as cnt FROM handymen');
console.log('✅ Total handymen in DB:', final[0].cnt);

// Quick test: fetch all and simulate search for "plumbing" in "Jurong"
const [all] = await db.execute('SELECT name, services, areas FROM handymen WHERE available = 1');
const jurongPlumbers = all.filter(h => {
  const svcs = JSON.parse(h.services);
  const areas = JSON.parse(h.areas);
  const hasPlumbing = svcs.some(s => s.toLowerCase().includes('plumbing'));
  const hasJurong = areas.some(a => a.toLowerCase().includes('jurong'));
  return hasPlumbing && hasJurong;
});
console.log('\n🔍 Test: plumbers in Jurong →', jurongPlumbers.length, 'found:');
jurongPlumbers.forEach(h => console.log('  -', h.name));

await db.end();
process.exit(0);

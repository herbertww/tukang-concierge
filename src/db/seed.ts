/**
 * seed.ts
 * Populates the database with realistic Singaporean handyman data for development/demo.
 * Run: npm run seed
 */

import { initDatabase, execute, queryAll } from "./database.js";
import { v4 as uuidv4 } from "uuid";

const HANDYMEN = [
  {
    id: uuidv4(),
    name: "Ahmad Bin Yusof",
    phone: "+6591234001",
    whatsapp: "+6591234001",
    service_types: JSON.stringify(["plumbing", "ac_repair"]),
    location: "Tampines",
    rating: 4.8,
    bookings: 312,
    trust_score: 9.2,
    price_min: 60,
    price_max: 200,
    acra_reg: "53123456A",
    acra_status: "verified",
    bio: "15 years experience in plumbing and aircon servicing. HDB & condo specialist.",
  },
  {
    id: uuidv4(),
    name: "Sarah Lim Wei Ling",
    phone: "+6591234002",
    whatsapp: "+6591234002",
    service_types: JSON.stringify(["cleaning", "painting"]),
    location: "Jurong West",
    rating: 4.9,
    bookings: 487,
    trust_score: 9.5,
    price_min: 50,
    price_max: 150,
    acra_reg: "53234567B",
    acra_status: "verified",
    bio: "Professional cleaning and painting services. Eco-friendly products used.",
  },
  {
    id: uuidv4(),
    name: "Ravi Subramaniam",
    phone: "+6591234003",
    whatsapp: "+6591234003",
    service_types: JSON.stringify(["electrical", "carpentry"]),
    location: "Woodlands",
    rating: 4.7,
    bookings: 228,
    trust_score: 8.8,
    price_min: 80,
    price_max: 350,
    acra_reg: "53345678C",
    acra_status: "verified",
    bio: "Licensed electrician (EMA). Custom carpentry and furniture assembly.",
  },
  {
    id: uuidv4(),
    name: "John Tan Boon Kiat",
    phone: "+6591234004",
    whatsapp: "+6591234004",
    service_types: JSON.stringify(["ac_repair", "electrical"]),
    location: "Bishan",
    rating: 5.0,
    bookings: 156,
    trust_score: 9.8,
    price_min: 70,
    price_max: 280,
    acra_reg: "53456789D",
    acra_status: "verified",
    bio: "Aircon specialist with BCA certification. Same-day service available.",
  },
  {
    id: uuidv4(),
    name: "Amy Ng Siew Fen",
    phone: "+6591234005",
    whatsapp: "+6591234005",
    service_types: JSON.stringify(["cleaning", "plumbing"]),
    location: "Ang Mo Kio",
    rating: 4.9,
    bookings: 341,
    trust_score: 9.3,
    price_min: 55,
    price_max: 180,
    acra_reg: "53567890E",
    acra_status: "verified",
    bio: "Deep cleaning specialist. Also handles minor plumbing repairs.",
  },
  {
    id: uuidv4(),
    name: "David Chua Eng Huat",
    phone: "+6591234006",
    whatsapp: "+6591234006",
    service_types: JSON.stringify(["carpentry", "painting", "cleaning"]),
    location: "Bedok",
    rating: 4.6,
    bookings: 198,
    trust_score: 8.5,
    price_min: 65,
    price_max: 400,
    acra_reg: null,
    acra_status: "unverified",
    bio: "General handyman — carpentry, painting, and home maintenance.",
  },
  {
    id: uuidv4(),
    name: "Muthu Krishnan",
    phone: "+6591234007",
    whatsapp: "+6591234007",
    service_types: JSON.stringify(["plumbing", "electrical"]),
    location: "Yishun",
    rating: 4.5,
    bookings: 142,
    trust_score: 8.2,
    price_min: 55,
    price_max: 220,
    acra_reg: "53678901F",
    acra_status: "verified",
    bio: "Plumbing and electrical repairs for HDB flats. Fast response.",
  },
  {
    id: uuidv4(),
    name: "Linda Goh Bee Choo",
    phone: "+6591234008",
    whatsapp: "+6591234008",
    service_types: JSON.stringify(["cleaning", "painting"]),
    location: "Clementi",
    rating: 4.8,
    bookings: 267,
    trust_score: 9.0,
    price_min: 45,
    price_max: 160,
    acra_reg: "53789012G",
    acra_status: "verified",
    bio: "Move-in/move-out cleaning. Interior painting with 2-year warranty.",
  },
];

const REVIEWS: Array<{
  handyman_index: number;
  user_id: string;
  rating: number;
  comment: string;
  service_type: string;
}> = [
  { handyman_index: 0, user_id: "user_001", rating: 5, comment: "Ahmad fixed my pipe burst at midnight. Lifesaver!", service_type: "plumbing" },
  { handyman_index: 0, user_id: "user_002", rating: 4.5, comment: "Good work on the aircon, a bit pricey.", service_type: "ac_repair" },
  { handyman_index: 1, user_id: "user_003", rating: 5, comment: "Sarah is amazing! My flat sparkles now.", service_type: "cleaning" },
  { handyman_index: 1, user_id: "user_004", rating: 5, comment: "Painting done in one day. Highly recommend!", service_type: "painting" },
  { handyman_index: 2, user_id: "user_005", rating: 4.8, comment: "Ravi rewired my kitchen safely and quickly.", service_type: "electrical" },
  { handyman_index: 3, user_id: "user_006", rating: 5, comment: "John is the best aircon guy in Singapore!", service_type: "ac_repair" },
  { handyman_index: 4, user_id: "user_007", rating: 5, comment: "Amy is thorough and professional.", service_type: "cleaning" },
  { handyman_index: 5, user_id: "user_008", rating: 4.5, comment: "David built my wardrobe perfectly.", service_type: "carpentry" },
];

async function seed(): Promise<void> {
  await initDatabase();

  const existing = queryAll("SELECT id FROM handymen");
  if (existing.length > 0) {
    console.log(`Database already seeded with ${existing.length} handymen. Skipping.`);
    return;
  }

  for (const h of HANDYMEN) {
    execute(
      `INSERT INTO handymen (id, name, phone, whatsapp, service_types, location, rating, bookings, trust_score, price_min, price_max, acra_reg, acra_status, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [h.id, h.name, h.phone, h.whatsapp, h.service_types, h.location, h.rating, h.bookings, h.trust_score, h.price_min, h.price_max, h.acra_reg ?? null, h.acra_status, h.bio]
    );
  }

  for (const r of REVIEWS) {
    const handyman = HANDYMEN[r.handyman_index];
    execute(
      `INSERT INTO reviews (id, handyman_id, user_id, rating, comment, service_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), handyman.id, r.user_id, r.rating, r.comment, r.service_type]
    );
  }

  console.log(`✅ Seeded ${HANDYMEN.length} handymen and ${REVIEWS.length} reviews.`);
}

seed().catch(console.error);

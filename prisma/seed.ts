import {
  AccessRequestStatus,
  EquipmentType,
  JobType,
  PrismaClient,
  ResourceStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

function isTruthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "TRUE";
}

async function seedAdminUser() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    console.log("Seed admin saltato: SEED_ADMIN_EMAIL non impostata.");
    return;
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      firstName: process.env.SEED_ADMIN_FIRST_NAME?.trim() || "Admin",
      lastName: process.env.SEED_ADMIN_LAST_NAME?.trim() || "GiGEST",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: adminEmail,
      firstName: process.env.SEED_ADMIN_FIRST_NAME?.trim() || "Admin",
      lastName: process.env.SEED_ADMIN_LAST_NAME?.trim() || "GiGEST",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Admin inizializzato: ${adminEmail}`);
}

async function seedDemoData() {
  const demoPerson = await prisma.person.upsert({
    where: { id: "seed-person-mario-rossi" },
    update: {},
    create: {
      id: "seed-person-mario-rossi",
      fullName: "Mario Rossi",
      roleDescription: "Capocantiere",
      status: ResourceStatus.ACTIVE,
    },
  });

  const existingPersonCost = await prisma.personCost.findFirst({
    where: { personId: demoPerson.id },
  });

  if (!existingPersonCost) {
    await prisma.personCost.create({
      data: {
        personId: demoPerson.id,
        hourlyCost: 28.5,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }

  const demoEquipment = await prisma.equipment.upsert({
    where: { id: "seed-equipment-cat-302" },
    update: {},
    create: {
      id: "seed-equipment-cat-302",
      nameDescription: "Escavatore CAT 302",
      type: EquipmentType.VEHICLE,
      status: ResourceStatus.ACTIVE,
    },
  });

  const existingEquipmentCost = await prisma.equipmentCost.findFirst({
    where: { equipmentId: demoEquipment.id },
  });

  if (!existingEquipmentCost) {
    await prisma.equipmentCost.create({
      data: {
        equipmentId: demoEquipment.id,
        hourlyCost: 45.0,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }

  const demoJobOrder = await prisma.jobOrder.upsert({
    where: { id: "seed-joborder-milano-centro" },
    update: {},
    create: {
      id: "seed-joborder-milano-centro",
      name: "Cantiere Milano Centro",
      type: JobType.SITE,
      status: ResourceStatus.ACTIVE,
    },
  });

  const existingActivities = await prisma.diaryActivity.count({
    where: {
      OR: [{ personId: demoPerson.id }, { equipmentId: demoEquipment.id }],
    },
  });

  if (existingActivities === 0) {
    await prisma.diaryActivity.createMany({
      data: [
        {
          referenceDate: new Date("2026-03-27T00:00:00.000Z"),
          resourceType: "PERSON",
          personId: demoPerson.id,
          jobOrderId: demoJobOrder.id,
          hours: 8,
          activityDescription: "Coordinamento e sopralluogo.",
        },
        {
          referenceDate: new Date("2026-03-27T00:00:00.000Z"),
          resourceType: "EQUIPMENT",
          equipmentId: demoEquipment.id,
          jobOrderId: demoJobOrder.id,
          hours: 6,
          activityDescription: "Scavo fondazioni.",
        },
      ],
    });
  }

  await prisma.accessRequest.upsert({
    where: { email: "pending@example.com" },
    update: {},
    create: {
      email: "pending@example.com",
      firstName: "Utente",
      lastName: "In Attesa",
      status: AccessRequestStatus.PENDING,
    },
  });

  console.log("Dati demo inizializzati.");
}

async function main() {
  await seedAdminUser();

  if (isTruthy(process.env.SEED_DEMO_DATA)) {
    await seedDemoData();
  } else {
    console.log("Seed demo saltato: SEED_DEMO_DATA non attivo.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

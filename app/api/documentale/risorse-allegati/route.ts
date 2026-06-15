import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [people, equipment] = await Promise.all([
    prisma.person.findMany({
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        roleDescription: true,
        trainings: {
          orderBy: { trainingDate: "desc" },
          select: {
            id: true,
            course: true,
            trainingDate: true,
            documents: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                createdAt: true,
              },
            },
          },
        },
      },
    }),
    prisma.equipment.findMany({
      orderBy: { nameDescription: "asc" },
      select: {
        id: true,
        nameDescription: true,
        type: true,
        maintenances: {
          orderBy: { interventionDate: "desc" },
          select: {
            id: true,
            interventionType: true,
            interventionDate: true,
            documents: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                createdAt: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const peopleFolders = people
    .map((person) => ({
      id: person.id,
      name: person.fullName,
      subtitle: person.roleDescription ?? "",
      items: person.trainings.flatMap((training) =>
        training.documents.map((document) => ({
          id: document.id,
          kind: "training" as const,
          title: training.course,
          date: toInputDate(training.trainingDate),
          fileName: document.fileName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt.toISOString(),
          openUrl: `/api/risorse/personale/${person.id}/training/document/${document.id}`,
        }))
      ),
    }))
    .filter((folder) => folder.items.length > 0);

  const equipmentFolders = equipment
    .map((item) => ({
      id: item.id,
      name: item.nameDescription,
      subtitle: item.type === "VEHICLE" ? "Mezzo" : "Attrezzatura",
      items: item.maintenances.flatMap((maintenance) =>
        maintenance.documents.map((document) => ({
          id: document.id,
          kind: "maintenance" as const,
          title: maintenance.interventionType,
          date: toInputDate(maintenance.interventionDate),
          fileName: document.fileName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt.toISOString(),
          openUrl: `/api/risorse/mezzi/${item.id}/maintenance/document/${document.id}`,
        }))
      ),
    }))
    .filter((folder) => folder.items.length > 0);

  return NextResponse.json({
    groups: [
      { key: "people", label: "Personale", folders: peopleFolders },
      { key: "equipment", label: "Mezzi e Attrezzature", folders: equipmentFolders },
    ],
  });
}

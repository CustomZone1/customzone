import { NextResponse } from "next/server";

import type { BRMode, BRPrizeType } from "@/data/tournaments";
import { createTournamentRecord, listTournaments } from "@/lib/server/tournamentStore";
import { pushInboxMessageMany } from "@/lib/server/inboxStore";
import { listPublicUsers } from "@/lib/server/userStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hideRoom<T extends { room?: unknown }>(tournament: T) {
  const { room: _room, ...safe } = tournament;
  return {
    ...safe,
    roomPublished: Boolean(
      (tournament as any)?.room?.id || (tournament as any)?.room?.pass
    ),
  };
}

export async function GET() {
  const tournaments = await listTournaments();
  return NextResponse.json({ tournaments: tournaments.map(hideRoom) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawBrMode = String(body?.brMode ?? "").toUpperCase();
    const rawPrizeType = String(body?.brPrizeType ?? "").toUpperCase();
    const brMode: BRMode | null =
      rawBrMode === "SOLO" || rawBrMode === "DUO" || rawBrMode === "SQUAD"
        ? (rawBrMode as BRMode)
        : null;
    const brPrizeType: BRPrizeType | null =
      rawPrizeType === "PER_KILL" || rawPrizeType === "BOOYAH" || rawPrizeType === "BOTH"
        ? (rawPrizeType as BRPrizeType)
        : null;

    const created = await createTournamentRecord({
      game: String(body?.game ?? "Free Fire"),
      matchType: String(body?.matchType ?? "BR") as "BR" | "CS",
      brMode,
      brPrizeType,
      formatInfo: String(body?.formatInfo ?? ""),
      rules: String(body?.rules ?? ""),
      prizePool: Number(body?.prizePool ?? 0),
      winningPrize: Number(body?.winningPrize ?? 0),
      perKillPrize: Number(body?.perKillPrize ?? 0),
      additionalInfo: String(body?.additionalInfo ?? ""),
      name: String(body?.name ?? ""),
      dateTime: String(body?.dateTime ?? ""),
      entryFee: Number(body?.entryFee ?? 0),
      maxSlots: Number(body?.maxSlots ?? 1),
    });

    try {
      const users = await listPublicUsers();
      const userIds = users.map((user) => user.id);
      if (userIds.length > 0) {
        const matchLabel =
          created.matchType === "BR"
            ? `BR ${created.brMode ?? ""}`.trim()
            : "CS";
        await pushInboxMessageMany(userIds, {
          type: "SYSTEM",
          title: `New Tournament: ${created.name}`,
          message:
            `A new tournament is now live.\n` +
            `Game: ${created.game}\n` +
            `Type: ${matchLabel}\n` +
            `Start: ${created.dateTime}\n` +
            `Entry: Rs ${created.entryFee}\n` +
            `Slots: ${created.maxSlots}\n` +
            `Book quickly from the tournaments page.`,
        });
      }
    } catch {
      // ignore inbox failures, tournament creation already saved
    }

    return NextResponse.json({ tournament: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

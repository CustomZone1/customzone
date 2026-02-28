import fs from "fs/promises";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

async function readJson(relPath) {
  const p = path.join(process.cwd(), relPath);
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function supabaseInsert(table, rows) {
  if (!rows || rows.length === 0) return { ok: true, inserted: 0 };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert into ${table} failed: ${res.status} ${text}`);
  }

  return { ok: true, inserted: rows.length };
}

function mapTournament(t) {
  return {
    id: t.id,
    name: t.name ?? t.title ?? "Untitled Tournament",
    game: t.game ?? "Free Fire",
    match_type: t.matchType ?? "BR",
    br_mode: t.brMode ?? null,
    br_prize_type: t.brPrizeType ?? null,
    date_time: t.dateTime ?? "",
    entry_fee: Number(t.entryFee ?? 0),
    max_slots: Number(t.maxSlots ?? 0),
    booked_count: Number(t.bookedCount ?? 0),
    manual_sold_slots: Number(t.manualSoldSlots ?? 0),
    status: t.status ?? "OPEN",
    prize_pool: Number(t.prizePool ?? 0),
    winning_prize: Number(t.winningPrize ?? 0),
    per_kill_prize: Number(t.perKillPrize ?? 0),
    format_info: t.formatInfo ?? "",
    rules: t.rules ?? "",
    additional_info: t.additionalInfo ?? "",
    room_id: t.room?.id ?? null,
    room_pass: t.room?.pass ?? null,
  };
}

async function main() {
  // 1) tournaments + bookings
  const tourStore = await readJson("data/tournaments.db.json");
  const tournaments = (tourStore.tournaments ?? []).map(mapTournament);
  const bookings = (tourStore.bookings ?? []).map((b) => ({
    id: b.id,
    tournament_id: b.tournamentId,
    user_id: b.userId,
    username: b.username ?? null,
    player_name: b.playerName,
    team_members: b.teamMembers ?? [],
    team_size: Number(b.teamSize ?? 1),
    slot_number: Number(b.slotNumber ?? 1),
    status: b.status ?? "CONFIRMED",
    created_at: b.createdAt ?? new Date().toISOString(),
  }));

  // 2) users
  let users = [];
  try {
    const userStore = await readJson("data/users.db.json");
    users = (userStore.users ?? []).map((u) => ({
      id: u.id,
      username: u.username ?? null,
      phone: u.phone ?? null,
      created_at: u.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    // ignore if file not present
  }

  // 3) wallet
  let walletBalances = [];
  let walletLedger = [];
  try {
    const walletStore = await readJson("data/wallet.db.json");
    walletBalances = (walletStore.balances ?? []).map((x) => ({
      user_id: x.userId,
      balance: Number(x.balance ?? 0),
      updated_at: x.updatedAt ?? new Date().toISOString(),
    }));

    walletLedger = (walletStore.ledger ?? []).map((x) => ({
      id: x.id,
      user_id: x.userId,
      type: x.type ?? "SYSTEM",
      amount: Number(x.amount ?? 0),
      note: x.note ?? "",
      created_at: x.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    // ignore if file not present
  }

  console.log("Inserting tournaments:", tournaments.length);
  await supabaseInsert("tournaments", tournaments);

  console.log("Inserting users:", users.length);
  if (users.length) await supabaseInsert("users", users);

  console.log("Inserting bookings:", bookings.length);
  if (bookings.length) await supabaseInsert("bookings", bookings);

  console.log("Inserting wallet_balance:", walletBalances.length);
  if (walletBalances.length) await supabaseInsert("wallet_balance", walletBalances);

  console.log("Inserting wallet_ledger:", walletLedger.length);
  if (walletLedger.length) await supabaseInsert("wallet_ledger", walletLedger);

  console.log("DONE ✅");
}

main().catch((e) => {
  console.error("SEED FAILED ❌", e);
  process.exit(1);
});
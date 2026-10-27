// Deterministic Open Play pairing core. No tournament or production DB side effects.
const number = value => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) ? Number(value) : NaN;
export function validateOpenPlayParticipant(p) {
  const id = String(p?.id ?? "").trim();
  const rating = number(p?.rating);
  if (!id || id.length > 128) throw new Error("INVALID_PLAYER_ID");
  if (!Number.isFinite(rating) || rating < 1 || rating > 8) throw new Error("INVALID_PLAYER_RATING");
  return { id, rating };
}
export function buildOpenPlayPairs(players, options = {}) {
  if (!Array.isArray(players)) throw new Error("INVALID_PLAYERS");
  const maxCombinedRating = Number(options.maxCombinedRating ?? 5.2);
  const tolerance = Number(options.tolerance ?? 0);
  if (!Number.isFinite(maxCombinedRating) || maxCombinedRating <= 0 ||
      !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 0.5) throw new Error("INVALID_RATING_LIMIT");
  const normalized = players.map(validateOpenPlayParticipant);
  const ids = new Set();
  for (const p of normalized) {
    if (ids.has(p.id)) throw new Error("DUPLICATE_PLAYER");
    ids.add(p.id);
  }
  // Deterministic by ID. Avoids depending on server clock, array order, or random seed.
  normalized.sort((a,b) => a.id.localeCompare(b.id, "en"));
  const limit = maxCombinedRating + tolerance;
  const memo = new Map();
  const solve = remaining => {
    const key = remaining.map(p => p.id).join("|");
    if (memo.has(key)) return memo.get(key);
    if (!remaining.length) return {pairs:[],unpaired:[],score:0};
    const [first,...rest] = remaining;
    let best = solve(rest);
    best = {pairs:best.pairs,unpaired:[first,...best.unpaired],score:best.score};
    for (let i=0;i<rest.length;i++) {
      const partner=rest[i];
      if (first.rating+partner.rating > limit + 1e-9) continue;
      const next=solve(rest.filter((_,index)=>index!==i));
      const candidate={pairs:[[first,partner],...next.pairs],unpaired:next.unpaired,
        score:next.score + first.rating + partner.rating};
      if (candidate.pairs.length>best.pairs.length ||
         (candidate.pairs.length===best.pairs.length && candidate.score>best.score+1e-9)) best=candidate;
    }
    memo.set(key,best);
    return best;
  };
  // Exact matching is exponential; limit is intentional to prevent resource exhaustion.
  if(normalized.length>16) throw new Error("OPEN_PLAY_BATCH_TOO_LARGE");
  const result=solve(normalized);
  return {pairs:result.pairs.map(([a,b])=>({playerIds:[a.id,b.id],combinedRating:+(a.rating+b.rating).toFixed(3)})),
    unpairedIds:result.unpaired.map(p=>p.id),maxCombinedRating,tolerance};
}

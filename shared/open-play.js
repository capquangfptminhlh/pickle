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
  // Two-pointer matching: O(n log n). The lowest-rated player partners with
  // the highest-rated compatible one. This maximizes the number of legal pairs
  // for a simple combined-rating cap; deterministic ID tie-break prevents drift.
  normalized.sort((a,b)=>a.rating-b.rating||a.id.localeCompare(b.id,"en"));
  if(normalized.length>256)throw new Error("OPEN_PLAY_BATCH_TOO_LARGE");
  const limit=maxCombinedRating+tolerance, pairs=[],unpaired=[];
  let low=0,high=normalized.length-1;
  while(low<high){
    const a=normalized[low],b=normalized[high];
    if(a.rating+b.rating<=limit+1e-9){
      pairs.push({playerIds:[a.id,b.id],combinedRating:+(a.rating+b.rating).toFixed(3)});
      low++;high--;
    }else{
      unpaired.push(b.id);
      high--;
    }
  }
  if(low===high)unpaired.push(normalized[low].id);
  return {pairs,unpairedIds:unpaired.sort((a,b)=>a.localeCompare(b,"en")),maxCombinedRating,tolerance};
}

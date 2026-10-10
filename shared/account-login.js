export const normalizeLogin=value=>String(value??'').trim().toLowerCase();
export const validLoginEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validRefereeUsername=value=>/^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
export const validLoginIdentifier=value=>validLoginEmail(value)||validRefereeUsername(value);

// The legacy email column is the unique login identifier, not a contact field.
// Keep legacy email writes strict while permitting explicit referee usernames.
export function accountLogin(body,role,previous=''){
 const usernameMode=role==='referee'&&(body.username!==undefined||(body.email===undefined&&previous&&!previous.includes('@')));
 const value=normalizeLogin(role==='referee'&&body.username!==undefined?body.username:(body.email??previous));
 return {value,valid:usernameMode?validLoginIdentifier(value):validLoginEmail(value),error:usernameMode?'INVALID_USERNAME':'INVALID_EMAIL'};
}
export const accountUsername=row=>validRefereeUsername(normalizeLogin(row.email))?normalizeLogin(row.email):null;

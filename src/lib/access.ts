// The platform is shared: one login + access key for everyone. The login is
// stored in Supabase Auth as an e-mail on a domain that never receives mail.
const DOMAIN = "pontual.app";

export const loginEmail = (login: string) => `${login.trim().toLowerCase()}@${DOMAIN}`;

export const loginName = (email: string) => email.replace(`@${DOMAIN}`, "");

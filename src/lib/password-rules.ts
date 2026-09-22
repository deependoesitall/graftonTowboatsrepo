// Shared floor for crew/customer passwords. Must match hosted Supabase Auth
// (password_min_length defaults to 6 and hosted projects will not go lower).
// The form, API, and helper text all use this so staff never see "min 4"
// then get rejected for 6.
export const MIN_PASSWORD_LENGTH = 6;

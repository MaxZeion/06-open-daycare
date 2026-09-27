export type CurrentUserRole = "staff" | "parent" | "admin";

export interface CurrentUser {
  userId: string;
  email: string | null;
  daycareId: string;
  role: CurrentUserRole;
  fullName: string;
}

export interface WishlistItem {
  title: string;
  url?: string | null;
  notes?: string;
}

export type ExchangeStatus = 'open' | 'drawn' | 'completed';

export interface Exchange {
  id: string;
  title: string;
  description: string;
  budget_amount: number | null;
  currency: string;
  exchange_date: string | null;
  target_participants: number | null;
  invite_code: string;
  organizer_id: string;
  status: ExchangeStatus;
  drawn_at: string | null;
  created_at: string;
}

export interface Participant {
  id: string;
  exchange_id: string;
  user_id: string;
  display_name: string;
  alias?: string;
  wishlist_items: WishlistItem[];
  dislikes: string;
  delivery_notes: string;
  joined_at: string;
}

export interface Exclusion {
  id: string;
  exchange_id: string;
  giver_participant_id: string;
  excluded_participant_id: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  exchange_id: string;
  giver_id: string;
  recipient_id: string;
  revealed_at: string | null;
  created_at: string;
}

// Stored DB/API role value ('santa' represents the Anonymous Gifter)
export type AnonymousSenderRole = 'santa' | 'recipient';

export interface AnonymousMessage {
  id: string;
  exchange_id: string;
  assignment_id: string;
  sender_role: AnonymousSenderRole;
  body: string;
  created_at: string;
}

export interface InvitePreview {
  exchange_id: string;
  title: string;
  description: string;
  budget_amount: number | null;
  currency: string;
  exchange_date: string | null;
  status: ExchangeStatus;
  participant_count: number;
  target_participants: number | null;
}

export interface JoinExchangeResponse {
  exchange_id: string;
  participant_id: string;
  already_joined: boolean;
}

export interface DrawResponse {
  exchange_id: string;
  status: ExchangeStatus;
  participant_count: number;
  drawn_at: string;
}

export interface ResetDrawResponse {
  exchange_id: string;
  status: ExchangeStatus;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

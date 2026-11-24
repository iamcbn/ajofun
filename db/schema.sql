-- Àjọfún: Neon PostgreSQL Schema, RLS Policies & Least-Privilege Grants
-- Target: Neon PostgreSQL with Neon Auth (auth.user_id()) and Neon Data API (authenticated role)
-- Note: Do NOT enable FORCE ROW LEVEL SECURITY on these tables; the FastAPI backend
--       connects as the database owner (DATABASE_URL) to run blind draws, public invite
--       previews, and invite-code joins while Neon Data API requests run as `authenticated`.

-- Ensure pg_session_jwt is installed so the `auth` schema and auth.user_id() exist
CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

-- Ensure required role exists when running outside managed Neon Data API bootstrap
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- ============================================================================
-- 1. Tables & Constraints
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 100),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  budget_amount NUMERIC(10, 2) CHECK (budget_amount IS NULL OR budget_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (char_length(trim(currency)) BETWEEN 1 AND 10),
  exchange_date DATE,
  target_participants INTEGER CHECK (target_participants IS NULL OR target_participants >= 3),
  invite_code TEXT NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  organizer_id TEXT NOT NULL DEFAULT auth.user_id(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawn', 'completed')),
  drawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exchanges
  ADD COLUMN IF NOT EXISTS target_participants INTEGER
  CHECK (target_participants IS NULL OR target_participants >= 3);

CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT auth.user_id(),
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
  alias TEXT NOT NULL DEFAULT '' CHECK (char_length(alias) <= 40),
  wishlist_items JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(wishlist_items) = 'array' AND jsonb_array_length(wishlist_items) <= 20),
  dislikes TEXT NOT NULL DEFAULT '' CHECK (char_length(dislikes) <= 500),
  delivery_notes TEXT NOT NULL DEFAULT '' CHECK (char_length(delivery_notes) <= 500),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, user_id)
);

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS alias TEXT NOT NULL DEFAULT ''
  CHECK (char_length(alias) <= 40);

CREATE TABLE IF NOT EXISTS public.exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  giver_participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  excluded_participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, giver_participant_id, excluded_participant_id),
  CHECK (giver_participant_id <> excluded_participant_id)
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  giver_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, giver_id),
  UNIQUE (exchange_id, recipient_id),
  CHECK (giver_id <> recipient_id)
);

-- Deliberately contains NO giver_id / sender_user_id column so recipients reading
-- incoming messages from their Anonymous Gifter never receive giver identity via JSON.
CREATE TABLE IF NOT EXISTS public.anonymous_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('santa', 'recipient')),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lookups and foreign keys
CREATE INDEX IF NOT EXISTS idx_exchanges_organizer_id ON public.exchanges (organizer_id);
CREATE INDEX IF NOT EXISTS idx_participants_exchange_id ON public.participants (exchange_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.participants (user_id);
CREATE INDEX IF NOT EXISTS idx_exclusions_exchange_id ON public.exclusions (exchange_id);
CREATE INDEX IF NOT EXISTS idx_assignments_exchange_giver ON public.assignments (exchange_id, giver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_exchange_recipient ON public.assignments (exchange_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_anon_messages_thread ON public.anonymous_messages (exchange_id, assignment_id, created_at);

-- ============================================================================
-- 2. Private Helper Schema (Prevents RLS Recursion & PostgREST RPC Exposure)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_exchange_organizer(p_exchange_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.exchanges e
    WHERE e.id = p_exchange_id
      AND e.organizer_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_exchange_member(p_exchange_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.exchange_id = p_exchange_id
      AND p.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_exchange_open(p_exchange_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exchanges e
    WHERE e.id = p_exchange_id
      AND e.status = 'open'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_exchange_active(p_exchange_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exchanges e
    WHERE e.id = p_exchange_id
      AND e.status IN ('open', 'drawn')
  );
$$;

CREATE OR REPLACE FUNCTION app_private.participants_in_exchange(p_exchange_id UUID, p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants p1
    WHERE p1.id = p_a AND p1.exchange_id = p_exchange_id
  ) AND EXISTS (
    SELECT 1 FROM public.participants p2
    WHERE p2.id = p_b AND p2.exchange_id = p_exchange_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_assignment_thread(p_assignment_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND (a.giver_id = p_user_id OR a.recipient_id = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_assignment_giver(p_assignment_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND a.giver_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_assignment_recipient(p_assignment_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND a.recipient_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.assignment_matches_exchange(p_assignment_id UUID, p_exchange_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND a.exchange_id = p_exchange_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_open_spot(p_exchange_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exchanges e
    WHERE e.id = p_exchange_id
      AND (
        e.target_participants IS NULL
        OR (
          SELECT COUNT(*)
          FROM public.participants p
          WHERE p.exchange_id = e.id
        ) < e.target_participants
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.valid_target_participants(p_exchange_id UUID, p_target INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_target IS NULL OR (
    p_target >= 3
    AND p_target >= (
      SELECT COUNT(*)
      FROM public.participants p
      WHERE p.exchange_id = p_exchange_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.normalize_identity_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(
    lower(regexp_replace(COALESCE(p_text, ''), U&'[\200B\200C\200D\FEFF]', '', 'g')),
    'áàâäãåéèêëíìîïóòôöõúùûüýÿñç013457@$',
    'aaaaaaeeeeiiiiooooouuuuyyncoieastas'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_anonymous_message_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, neon_auth
AS $$
DECLARE
  v_sender_user_id TEXT;
  v_display_name TEXT;
  v_alias TEXT;
  v_account_name TEXT;
  v_email TEXT;
  v_clean_email TEXT;
  v_local_part TEXT;
  v_zw_stripped TEXT;
  v_clean_body TEXT;
  v_collapsed_body TEXT;
  v_name TEXT;
  v_norm_name TEXT;
  v_collapsed_name TEXT;
  v_raw_token TEXT;
  v_norm_token TEXT;
  v_candidate TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND (
    SELECT COUNT(*)
    FROM public.anonymous_messages
    WHERE assignment_id = NEW.assignment_id
  ) >= 200 THEN
    RAISE EXCEPTION 'This anonymous Q&A thread has reached its message limit.'
      USING ERRCODE = '54000';
  END IF;

  SELECT CASE WHEN NEW.sender_role = 'santa' THEN a.giver_id ELSE a.recipient_id END
  INTO v_sender_user_id
  FROM public.assignments a
  WHERE a.id = NEW.assignment_id
    AND a.exchange_id = NEW.exchange_id;

  IF v_sender_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid assignment thread for anonymous message.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p.display_name, ''), COALESCE(p.alias, '')
  INTO v_display_name, v_alias
  FROM public.participants p
  WHERE p.exchange_id = NEW.exchange_id
    AND p.user_id = v_sender_user_id;

  SELECT COALESCE(u.name, ''), COALESCE(u.email, '')
  INTO v_account_name, v_email
  FROM neon_auth."user" u
  WHERE u.id::text = v_sender_user_id;

  v_zw_stripped := regexp_replace(NEW.body, U&'[\200B\200C\200D\FEFF]', '', 'g');
  v_clean_body := app_private.normalize_identity_text(v_zw_stripped);
  v_collapsed_body := regexp_replace(v_clean_body, '[^a-z0-9]', '', 'g');

  -- 1. Block sender email address and local-part handle
  v_clean_email := lower(trim(regexp_replace(COALESCE(v_email, ''), U&'[\200B\200C\200D\FEFF]', '', 'g')));
  IF v_clean_email <> '' THEN
    IF position(v_clean_email in lower(v_zw_stripped)) > 0 THEN
      RAISE EXCEPTION 'Identity guard: sharing your email address is not allowed in Anonymous Q&A.'
        USING ERRCODE = '22023';
    END IF;
    IF position('@' in v_clean_email) > 0 THEN
      v_local_part := regexp_replace(split_part(v_clean_email, '@', 1), '[^a-z0-9]', '', 'g');
      IF char_length(v_local_part) >= 4
         AND v_local_part NOT IN (
           'the', 'and', 'for', 'you', 'are', 'not', 'but', 'all', 'any', 'can', 'had', 'her', 'was',
           'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
           'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
           'may', 'joy', 'art', 'red', 'tea', 'mug', 'box', 'bag', 'hat', 'cup', 'pen', 'book', 'gift',
           'santa', 'gifter', 'secret', 'match', 'will', 'hope', 'like', 'love', 'want', 'need', 'just',
           'from', 'with', 'have', 'this', 'that', 'what', 'when', 'where', 'which', 'your', 'here', 'there'
         )
         AND v_clean_body ~* ('\m' || v_local_part || '\M') THEN
        RAISE EXCEPTION 'Identity guard: your message includes your account handle ("%"). Remove it to stay anonymous.', v_local_part
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  -- 2. Block full display name, alias, account name, and individual name parts
  FOR v_name IN
    SELECT DISTINCT trim(term)
    FROM unnest(ARRAY[v_display_name, v_alias, v_account_name]) AS t(term)
    WHERE char_length(trim(term)) >= 2
  LOOP
    v_norm_name := trim(app_private.normalize_identity_text(v_name));
    v_collapsed_name := regexp_replace(v_norm_name, '[^a-z0-9]', '', 'g');
    IF char_length(v_norm_name) >= 2 THEN
      IF v_clean_body ~* ('\m' || regexp_replace(v_norm_name, '([^\w\s])', '\\\1', 'g') || '\M')
         OR (char_length(v_collapsed_name) >= 3 AND position(v_collapsed_name in v_collapsed_body) > 0) THEN
        RAISE EXCEPTION 'Identity guard: your message contains your name or alias. Keep your Anonymous Gifter identity secret!'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    FOR v_raw_token IN
      SELECT trim(tok)
      FROM regexp_split_to_table(v_name, '[\s._-]+') AS tok
      WHERE char_length(trim(tok)) >= 3
    LOOP
      v_norm_token := regexp_replace(app_private.normalize_identity_text(v_raw_token), '[^a-z0-9]', '', 'g');
      IF char_length(v_norm_token) >= 3
         AND v_norm_token NOT IN (
           'the', 'and', 'for', 'you', 'are', 'not', 'but', 'all', 'any', 'can', 'had', 'her', 'was',
           'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
           'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
           'may', 'joy', 'art', 'red', 'tea', 'mug', 'box', 'bag', 'hat', 'cup', 'pen', 'book', 'gift',
           'santa', 'gifter', 'secret', 'match', 'will', 'hope', 'like', 'love', 'want', 'need', 'just',
           'from', 'with', 'have', 'this', 'that', 'what', 'when', 'where', 'which', 'your', 'here', 'there',
           'anonymous'
         ) THEN
        IF v_clean_body ~* ('\m' || v_norm_token || '\M')
           OR (char_length(v_norm_token) >= 4 AND position(v_norm_token in v_collapsed_body) > 0) THEN
          RAISE EXCEPTION 'Identity guard: your message includes your name ("%"). No spoilers allowed!', v_raw_token
            USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- 3. Block self-introduction clauses ("vee here", "it's vee", "this is vee", "from vee")
  FOR v_candidate IN
    SELECT lower((regexp_matches(v_zw_stripped, '(?:^|[.!?,;:\n]\s*|\s-\s*)([a-z]{2,20})\s+here(?:\s*[.!?,;:]|$)', 'gi'))[1])
  LOOP
    IF v_candidate NOT IN (
      'santa', 'gifter', 'secret', 'just', 'still', 'not', 'back', 'right', 'over', 'up', 'down', 'out',
      'in', 'from', 'around', 'new', 'almost', 'nearly', 'already', 'always', 'never', 'also',
      'only', 'even', 'both', 'all', 'none', 'some', 'any', 'every', 'very', 'so', 'too', 'no',
      'yes', 'yeah', 'hey', 'hi', 'hello', 'well', 'ok', 'okay', 'wait', 'look', 'see', 'come',
      'go', 'stay', 'be', 'am', 'is', 'are', 'was', 'were', 'been', 'living', 'working',
      'sitting', 'waiting', 'typing', 'writing', 'asking', 'checking', 'hoping', 'wishing',
      'freezing', 'snowing', 'raining', 'cold', 'warm', 'hot', 'dark', 'late', 'early', 'quick',
      'short', 'long', 'good', 'great', 'nice', 'fine', 'happy', 'glad', 'sorry', 'thanks',
      'thank', 'please', 'question', 'note', 'hint', 'clue', 'gift', 'present', 'package',
      'parcel', 'delivery', 'shipping', 'size', 'color', 'coffee', 'tea', 'book', 'list',
      'wishlist', 'nothing', 'something', 'anything', 'everything', 'nobody', 'somebody',
      'anybody', 'everybody', 'who', 'what', 'where', 'when', 'why', 'how', 'we', 'they', 'it',
      'he', 'she', 'you', 'i', 'me', 'us', 'them', 'him', 'her', 'this', 'that', 'these',
      'those', 'there', 'then', 'now'
    ) THEN
      RAISE EXCEPTION 'Identity guard: it looks like you are signing in by name. Keep your message anonymous.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_candidate IN
    SELECT lower((regexp_matches(v_zw_stripped, '(?:^|[.!?,;:\n]\s*|\s-\s*)(?:it''?s|its|this\s+is)\s+([a-z]{2,20})(?:\s*[.!?,;:]|$)', 'gi'))[1])
  LOOP
    IF v_candidate NOT IN (
      'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'not', 'no', 'so', 'very',
      'really', 'just', 'only', 'still', 'already', 'almost', 'about', 'for', 'from', 'to',
      'in', 'on', 'at', 'of', 'with', 'by', 'santa', 'gifter', 'secret', 'ok', 'okay', 'fine', 'good',
      'great', 'nice', 'cool', 'fun', 'easy', 'hard', 'cold', 'warm', 'hot', 'late', 'early',
      'true', 'false', 'real', 'possible', 'impossible', 'important', 'helpful', 'useful',
      'better', 'best', 'worse', 'worst', 'time', 'going', 'coming', 'snowing', 'raining',
      'getting', 'looking', 'working', 'happening', 'done', 'ready', 'here', 'there',
      'something', 'nothing', 'anything', 'everything', 'someone', 'anyone', 'everyone',
      'either', 'neither', 'both', 'all', 'one', 'two', 'three', 'small', 'medium', 'large',
      'extra', 'blue', 'red', 'green', 'black', 'white', 'pink', 'purple', 'yellow', 'orange',
      'brown', 'gray', 'grey', 'gold', 'silver', 'free', 'cheap', 'expensive', 'worth', 'up',
      'down', 'out', 'off', 'over', 'under', 'super', 'pretty', 'quite', 'too', 'much', 'more',
      'less', 'such', 'what', 'why', 'how', 'when', 'where', 'who', 'which', 'that', 'this',
      'because', 'like', 'kind', 'sort', 'way', 'alright', 'actually', 'probably', 'definitely',
      'maybe', 'hopefully', 'totally', 'completely', 'mostly', 'mainly', 'basically',
      'honestly', 'literally', 'seriously', 'obviously', 'clearly', 'simply', 'purely',
      'fairly', 'rather', 'especially', 'particularly', 'usually', 'normally', 'generally',
      'currently', 'recently', 'finally', 'soon', 'later', 'today', 'tomorrow', 'tonight',
      'gift', 'present', 'surprise', 'anonymous', 'private', 'blind', 'random', 'optional',
      'required', 'locked', 'sealed', 'open', 'closed', 'full', 'empty', 'blank', 'dark',
      'light', 'sweet', 'spicy', 'sour', 'salty', 'bitter', 'iced', 'decaf', 'whole', 'ground',
      'loose', 'bagged', 'paperback', 'hardcover', 'digital', 'physical', 'handmade',
      'homemade', 'local', 'vintage', 'used', 'new', 'old', 'big', 'little', 'tiny', 'huge',
      'tall', 'short', 'wide', 'narrow', 'soft', 'cozy', 'comfy', 'cute', 'funny', 'weird',
      'crazy', 'awesome', 'amazing', 'wonderful', 'lovely', 'perfect', 'ideal'
    ) THEN
      RAISE EXCEPTION 'Identity guard: it looks like you are introducing yourself by name. Keep your identity secret.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_candidate IN
    SELECT lower((regexp_matches(v_zw_stripped, '(?:^|[.!?,;:\n]\s*|\s-\s*)from\s+([a-z]{2,20})(?:\s*[.!?]|$)', 'gi'))[1])
  LOOP
    IF v_candidate NOT IN (
      'santa', 'gifter', 'secret', 'your', 'the', 'a', 'an', 'my', 'our', 'this', 'that', 'here', 'there',
      'home', 'work', 'online', 'amazon', 'etsy', 'target', 'walmart', 'above', 'below'
    ) THEN
      RAISE EXCEPTION 'Identity guard: signing off with a name is not allowed in Anonymous Q&A.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 4. Block self-revelation phrases, emails, phone numbers, social @handles, and social profile URLs
  IF v_zw_stripped ~* '\m(my\s+name\s+is|i\s+go\s+by|call\s+me|my\s+initials\s+are|my\s+name\s+starts\s+with|starts\s+with\s+the\s+letter)\M'
     OR v_zw_stripped ~* '\m(it''?s|its|this\s+is)\s+me\M'
     OR v_zw_stripped ~* '\m(i\s+am|i''m)\s+the\s+(host|organizer)\M'
     OR v_zw_stripped ~* '\mi\s+created\s+this\s+exchange\M'
     OR v_zw_stripped ~* '(^|\n)\s*((love|cheers|best|sincerely|yours|signed|regards),|signed|from\s+your\s+friend,?)\s+(?!santa\M|gifter\M|anonymous\s+gifter\M)[a-z]{2,}'
     OR v_zw_stripped ~ '(^|\s)-\s*(?!Santa\M|Gifter\M|Anonymous\s+Gifter\M)[A-Z][a-z]{2,}\s*$' THEN
    RAISE EXCEPTION 'Identity guard: self-identification phrases are not allowed in Anonymous Q&A.'
      USING ERRCODE = '22023';
  END IF;

  IF v_zw_stripped ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' THEN
    RAISE EXCEPTION 'Identity guard: sharing email addresses is not allowed in Anonymous Q&A.'
      USING ERRCODE = '22023';
  END IF;

  IF v_zw_stripped ~* '(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\M'
     OR v_zw_stripped ~* '\m\d{10,14}\M' THEN
    RAISE EXCEPTION 'Identity guard: sharing phone numbers is not allowed in Anonymous Q&A.'
      USING ERRCODE = '22023';
  END IF;

  IF v_zw_stripped ~* '(^|\s)@[a-z0-9_]{3,}\M'
     OR v_zw_stripped ~* '(instagram\.com|twitter\.com|x\.com|linkedin\.com/in|facebook\.com|tiktok\.com/@|wa\.me|t\.me)/[^\s]+' THEN
    RAISE EXCEPTION 'Identity guard: social handles and profile links are not allowed in Anonymous Q&A.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_email_verified(p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, neon_auth
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM neon_auth."user" u
    WHERE u.id::text = p_user_id
      AND u."emailVerified" = true
  );
$$;

CREATE OR REPLACE FUNCTION app_private.set_participant_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, neon_auth
AS $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT COALESCE(NULLIF(trim(u.name), ''), NULLIF(trim(u.email), ''))
  INTO v_name
  FROM neon_auth."user" u
  WHERE u.id::text = NEW.user_id;

  IF v_name IS NOT NULL AND char_length(v_name) > 0 THEN
    NEW.display_name := substr(v_name, 1, 80);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_participant_display_name ON public.participants;
CREATE TRIGGER trg_set_participant_display_name
  BEFORE INSERT ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_participant_display_name();

DROP TRIGGER IF EXISTS trg_enforce_anonymous_message_privacy ON public.anonymous_messages;
CREATE TRIGGER trg_enforce_anonymous_message_privacy
  BEFORE INSERT OR UPDATE ON public.anonymous_messages
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_anonymous_message_privacy();

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

REVOKE ALL ON FUNCTION app_private.set_participant_display_name() FROM PUBLIC;

REVOKE ALL ON FUNCTION app_private.is_exchange_organizer(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_exchange_member(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_exchange_open(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_exchange_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.participants_in_exchange(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_assignment_thread(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_assignment_giver(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_assignment_recipient(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.assignment_matches_exchange(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.has_open_spot(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.valid_target_participants(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.normalize_identity_text(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_anonymous_message_privacy() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_email_verified(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.is_exchange_organizer(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_exchange_member(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_exchange_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_exchange_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.participants_in_exchange(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_assignment_thread(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_assignment_giver(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_assignment_recipient(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.assignment_matches_exchange(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_open_spot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.valid_target_participants(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_email_verified(TEXT) TO authenticated;

-- ============================================================================
-- 3. Row-Level Security Policies
-- ============================================================================

ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_messages ENABLE ROW LEVEL SECURITY;

-- exchanges policies
DROP POLICY IF EXISTS exchanges_select ON public.exchanges;
CREATE POLICY exchanges_select ON public.exchanges
  FOR SELECT
  TO authenticated
  USING (
    organizer_id = auth.user_id()
    OR app_private.is_exchange_member(id, auth.user_id())
  );

DROP POLICY IF EXISTS exchanges_insert ON public.exchanges;
CREATE POLICY exchanges_insert ON public.exchanges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organizer_id = auth.user_id()
    AND status = 'open'
    AND app_private.is_email_verified(auth.user_id())
  );

DROP POLICY IF EXISTS exchanges_update ON public.exchanges;
CREATE POLICY exchanges_update ON public.exchanges
  FOR UPDATE
  TO authenticated
  USING (organizer_id = auth.user_id() AND status = 'open')
  WITH CHECK (
    organizer_id = auth.user_id()
    AND status = 'open'
    AND app_private.valid_target_participants(id, target_participants)
  );

DROP POLICY IF EXISTS exchanges_delete ON public.exchanges;
CREATE POLICY exchanges_delete ON public.exchanges
  FOR DELETE
  TO authenticated
  USING (organizer_id = auth.user_id() AND status = 'open');

-- participants policies
DROP POLICY IF EXISTS participants_select ON public.participants;
CREATE POLICY participants_select ON public.participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.user_id()
    OR app_private.is_exchange_member(exchange_id, auth.user_id())
    OR app_private.is_exchange_organizer(exchange_id, auth.user_id())
  );

DROP POLICY IF EXISTS participants_insert ON public.participants;
CREATE POLICY participants_insert ON public.participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.user_id()
    AND app_private.is_email_verified(auth.user_id())
    AND app_private.is_exchange_organizer(exchange_id, auth.user_id())
    AND app_private.is_exchange_open(exchange_id)
    AND app_private.has_open_spot(exchange_id)
  );

DROP POLICY IF EXISTS participants_update ON public.participants;
CREATE POLICY participants_update ON public.participants
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.user_id()
    AND app_private.is_exchange_active(exchange_id)
  )
  WITH CHECK (
    user_id = auth.user_id()
    AND app_private.is_exchange_active(exchange_id)
  );

DROP POLICY IF EXISTS participants_delete ON public.participants;
CREATE POLICY participants_delete ON public.participants
  FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.user_id() OR app_private.is_exchange_organizer(exchange_id, auth.user_id()))
    AND app_private.is_exchange_open(exchange_id)
  );

-- exclusions policies
DROP POLICY IF EXISTS exclusions_select ON public.exclusions;
CREATE POLICY exclusions_select ON public.exclusions
  FOR SELECT
  TO authenticated
  USING (app_private.is_exchange_organizer(exchange_id, auth.user_id()));

DROP POLICY IF EXISTS exclusions_insert ON public.exclusions;
CREATE POLICY exclusions_insert ON public.exclusions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_exchange_organizer(exchange_id, auth.user_id())
    AND app_private.is_exchange_open(exchange_id)
    AND app_private.participants_in_exchange(exchange_id, giver_participant_id, excluded_participant_id)
  );

DROP POLICY IF EXISTS exclusions_delete ON public.exclusions;
CREATE POLICY exclusions_delete ON public.exclusions
  FOR DELETE
  TO authenticated
  USING (
    app_private.is_exchange_organizer(exchange_id, auth.user_id())
    AND app_private.is_exchange_open(exchange_id)
  );

-- assignments policies (strict secrecy: giver only)
DROP POLICY IF EXISTS assignments_select ON public.assignments;
CREATE POLICY assignments_select ON public.assignments
  FOR SELECT
  TO authenticated
  USING (giver_id = auth.user_id());

DROP POLICY IF EXISTS assignments_update ON public.assignments;
CREATE POLICY assignments_update ON public.assignments
  FOR UPDATE
  TO authenticated
  USING (giver_id = auth.user_id())
  WITH CHECK (giver_id = auth.user_id());

-- anonymous_messages policies
DROP POLICY IF EXISTS anonymous_messages_select ON public.anonymous_messages;
CREATE POLICY anonymous_messages_select ON public.anonymous_messages
  FOR SELECT
  TO authenticated
  USING (app_private.can_access_assignment_thread(assignment_id, auth.user_id()));

DROP POLICY IF EXISTS anonymous_messages_insert ON public.anonymous_messages;
CREATE POLICY anonymous_messages_insert ON public.anonymous_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exchanges e
      WHERE e.id = exchange_id
        AND e.status = 'drawn'
    )
    AND app_private.assignment_matches_exchange(assignment_id, exchange_id)
    AND (
      (sender_role = 'santa' AND app_private.is_assignment_giver(assignment_id, auth.user_id()))
      OR (sender_role = 'recipient' AND app_private.is_assignment_recipient(assignment_id, auth.user_id()))
    )
  );

-- ============================================================================
-- 4. Least-Privilege Grants for Neon Data API (`authenticated` role only)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

REVOKE ALL ON TABLE public.exchanges FROM PUBLIC;
REVOKE ALL ON TABLE public.participants FROM PUBLIC;
REVOKE ALL ON TABLE public.exclusions FROM PUBLIC;
REVOKE ALL ON TABLE public.assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.anonymous_messages FROM PUBLIC;

-- Exchanges: clients cannot forge status or drawn_at via Data API
GRANT SELECT, INSERT, DELETE ON public.exchanges TO authenticated;
GRANT UPDATE (title, description, budget_amount, currency, exchange_date, target_participants) ON public.exchanges TO authenticated;

-- Participants: clients cannot reassign user_id, exchange_id, or verified display_name
GRANT SELECT, INSERT, DELETE ON public.participants TO authenticated;
GRANT UPDATE (alias, wishlist_items, dislikes, delivery_notes) ON public.participants TO authenticated;

-- Exclusions
GRANT SELECT, INSERT, DELETE ON public.exclusions TO authenticated;

-- Assignments: clients can only read their own outgoing match and stamp revealed_at
GRANT SELECT ON public.assignments TO authenticated;
GRANT UPDATE (revealed_at) ON public.assignments TO authenticated;

-- Anonymous messages: append-only
GRANT SELECT, INSERT ON public.anonymous_messages TO authenticated;

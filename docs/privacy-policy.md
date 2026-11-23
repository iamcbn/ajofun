# Privacy Policy

**Effective Date:** November 2026  
**Project:** Àjọfún (Open-Source Multi-Group Anonymous Gifter)  
**License:** MIT License  
**Contact:** Project Maintainers (via GitHub repository issues / discussions)

---

## 1. Overview

Àjọfún helps friends, families, and teams organize private Anonymous Gifter gift exchanges without spoiling who drew whom. This Privacy Policy explains what personal data is collected, how it is handled, who can see it within an exchange, and how your privacy is protected by design.

---

## 2. Information We Collect

We collect only the information needed to authenticate your account, coordinate your gift exchanges, and deliver anonymous Q&A messages:

### A. Account & Authentication Data
- **Email & Password sign-up:** Your name, email address, and account credentials. Passwords are processed and hashed securely by our managed authentication provider (Neon Auth); plain-text passwords are never stored in application tables.
- **Google OAuth sign-in (optional):** If you choose to sign in with Google, we receive your basic profile identifiers (Google ID, name, and email address) needed to create and recognize your session.
- **Internal User Identifier:** A unique user ID (`user_id`) used to link your exchanges, participant records, and match assignment without exposing your email address to other exchange members.

### B. Gift Exchange Data
- **Exchange Settings (configured by Organizers):** Exchange title, optional description, suggested budget, currency, exchange date, invite code, exchange status (`open`, `drawn`, `completed`), and timestamps.
- **Exclusion Rules (configured by Organizers):** Records specifying which two participants in an open exchange should not be matched with each other.

### C. Participant & Wishlist Data
When you join an exchange, you provide per-exchange details:
- **Display Name:** The name by which your group knows you.
- **Wishlist Items:** Gift idea titles, optional external product URLs (`http://`/`https://`), and optional notes (up to 20 items per exchange).
- **Dislikes or Allergies:** Optional free-text notes (up to 500 characters).
- **Delivery or Handoff Notes:** Optional instructions (up to 500 characters)—for example, an office desk location or shipping notes.

> **Visibility Note on Delivery Notes:** In the application, your display name, wishlist items, dislikes, and delivery/handoff notes are visible to **members of that exchange group**. Please avoid entering sensitive home addresses in Delivery Notes unless you are comfortable with your group seeing it (or use Anonymous Q&A to share a shipping address privately with only your assigned Anonymous Gifter).

### D. Match Assignments & Anonymous Q&A Data
- **Assignments:** Once the organizer triggers a draw, the database stores pairings (`giver_id` to `recipient_id`), plus when the giver first reveals their match (`revealed_at`).
- **Anonymous Q&A Messages:** Message text, timestamps, and the sender's role (`santa` or `recipient`), linked to the corresponding assignment thread.

### E. Session & Technical Data
- **Authentication Tokens:** Strictly necessary HTTP session cookies and JSON Web Tokens (JWTs) used to authenticate API requests.
- **Server Logs:** Standard technical request logs generated transiently by hosting and database providers for security, rate-limiting, and error diagnosis.

---

## 3. How We Use Your Information

Data is processed strictly for:
- **Operating the Service:** Creating accounts, previewing and joining exchanges via invite codes, displaying wishlists, running randomized draws respecting exclusions, revealing your match, and delivering Anonymous Q&A messages.
- **Security & Integrity:** Authenticating JWTs, enforcing database Row-Level Security, preventing unauthorized access, and guarding against automated abuse.

**We do NOT sell personal data, display third-party advertisements, or train third-party AI models on your data.**

---

## 4. Who Can See Your Information & How Secrecy Works

### A. Public Invite Previews (`/join/CODE`)
Anyone who visits an invite link sees only a **non-personal preview** of the exchange: its title, description, suggested budget, exchange date, status, and total participant count. Names, emails, wishlists, and pairings are never returned in public invite previews.

### B. Within an Exchange Group
- **Other Participants & the Organizer** can see: exchange settings, participant display names, and each participant's wishlist items, dislikes, and delivery notes.
- **Your Email Address** is private to your account and is **never** shown to other participants or organizers.
- **Exclusion Rules** are visible only to the exchange organizer while configuring the exchange.

### C. Match Secrecy (Database-Enforced Privacy)
- **Database-Enforced RLS:** PostgreSQL Row-Level Security policies restrict `assignments` queries so each signed-in user can query **only** their own outgoing assignment (`giver_id = auth.user_id()`). During a draw, the backend computes pairings inside a single transaction and returns only a summary status (`drawn`, count, timestamp)—never the pairings list—so **the exchange organizer cannot view pairings in the application**.
- **Anonymous Q&A Privacy:** Messages are tagged only by role (`santa` or `recipient`) so recipients cannot see who their Anonymous Gifter is.

---

## 5. Cookies & Browser Storage

Àjọfún uses **strictly necessary** authentication tokens and session cookies solely to keep you signed in. We do not use third-party marketing cookies or tracking pixels.

---

## 6. Data Retention & Deletion

- **Open Exchanges:** While an exchange is `open`, you can edit your wishlist or leave the exchange at any time. Organizers can delete open exchanges, which permanently deletes all participants and exclusions.
- **Resetting a Draw:** If the organizer resets a drawn exchange, all existing match assignments and Anonymous Q&A messages for that exchange are immediately erased.
- **Account & Data Deletion:** Users may request account deletion or data removal by contacting project maintainers or filing a request on the community project repository.

---

## 7. Open Source & Self-Hosting

Àjọfún is free and open-source software distributed under the MIT License. If you deploy or self-host your own instance, you act as the administrator and data controller for that instance.

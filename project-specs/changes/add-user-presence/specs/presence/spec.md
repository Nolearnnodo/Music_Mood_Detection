# Capability: presence

## ADDED Requirements

### Requirement: Anonymous identity

The system SHALL provide each browser session an anonymous, persistent identity without requiring
account creation, email, or password.

#### Scenario: First visit

- **WHEN** the user opens Mood Radio in a browser for the first time
- **THEN** the client generates a UUID and a random Chinese-language nickname (adjective + noun)
- **AND** the client POSTs them to `/api/user/register`
- **AND** the server returns a numeric `user_id` and stores `{uuid, nickname}` in `users`
- **AND** the browser persists `{user_id, uuid, nickname}` in `localStorage` for all future visits

#### Scenario: Returning visit

- **WHEN** the browser already has `user_id` in `localStorage`
- **THEN** the client skips registration and uses the stored identity directly

### Requirement: Presence heartbeat

The system SHALL accept and persist a user's current mood and currently-playing track at most once
per minute, expressing "I am here and feeling this".

#### Scenario: Heartbeat with full mood

- **WHEN** the client POSTs `/api/presence` with `{user_id, mood_label, valence, arousal, current_track_id, source}`
- **THEN** the server UPSERTs into `presence` keyed by `user_id`
- **AND** records `updated_at = now`

#### Scenario: Heartbeat without a mood

- **WHEN** the user has not selected an emotion yet
- **THEN** the client still POSTs `/api/presence` with `mood_label = ""` and the track if any
- **AND** the user is counted as "active" but not contributing to the mood distribution

### Requirement: Community summary

The system SHALL aggregate active users into anonymized counts that surface "群体在场感" without
exposing any individual identity.

#### Scenario: Mood distribution

- **WHEN** the client GETs `/api/presence/summary`
- **THEN** the server returns `{active_users, moods: [{label, count, sample_valence, sample_arousal}], top_tracks: [...]}`
- **AND** "active" means `updated_at >= now − 5 minutes`
- **AND** the response NEVER includes user_id or nickname lists

#### Scenario: Top tracks privacy floor

- **GIVEN** only 1 listener is currently playing track X
- **WHEN** the client GETs `/api/presence/summary`
- **THEN** track X does NOT appear in `top_tracks`
- **AND** the threshold is `min_track_listeners >= 3` so a single user cannot be identified

#### Scenario: Inactive user drops out

- **GIVEN** a user's heartbeat is older than 5 minutes
- **WHEN** the next summary is requested
- **THEN** that user is NOT counted in `active_users` or any mood/track count

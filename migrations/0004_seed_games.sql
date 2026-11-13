-- A starting list for the duo Vibe Jam portal, so two players who step in together land somewhere
-- worth playing from day one. Without this the list held only fly.pieter.com.
--
-- Picked from two public Vibe Jam 2026 catalogues (github.com/delightc123/Vibe-Coded-Games and
-- github.com/seraseraqqq/awesome-ai-browser-games), which state that each of these is multiplayer.
-- Every URL was fetched on 2026-11-13 and answered 200 with the matching title. They are other
-- people's sites and may change or disappear: the owner can remove any of them from /admin.html,
-- and players can report them like any other entry.
INSERT INTO portals (kind, pad, title, url, multiplayer, nickname, ip_hash, owner_hash, created_at, expires_at)
VALUES
  ('jam', NULL, 'Capybara Delivery', 'https://capybara-vibejam26.leocoout.dev/', 1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'Tiny Skies',        'https://tinyskies.vercel.app/',            1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'Hop.Earth',         'https://hop.earth/',                       1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'VibeSail',          'https://vibesail.com/',                    1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'BeetleJump',        'https://beetlejump.com/',                  1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'Super Smash Royale','https://smashroyale.io/',                  1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'Null Range',        'https://nullrange.com/',                   1, 'Playverse', 'seed', 'seed', 0, 253402300799000),
  ('jam', NULL, 'Undersphere',       'https://playundersphere.com/',             1, 'Playverse', 'seed', 'seed', 0, 253402300799000);

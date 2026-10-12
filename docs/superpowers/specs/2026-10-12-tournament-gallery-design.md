# Tournament memories

Approved by the owner: upload photos directly to each tournament; organizer can upload multiple photos, edit captions and remove photos; visitors see a public album and enlarged images. Reuse existing visual styles and durable media storage. Compress images on the client.

## Scope and behavior

Add an “Ảnh kỷ niệm” management button to tournament cards and the tournament operator detail. Add a public album section and navigation anchor on tournament.html. An empty album shows a short message. Upload sequentially with progress and per-file errors; successful photos remain when another file fails. Caption maximum 300 characters. JPEG, PNG and WebP only, up to 6 MiB after compression. Removed photos are soft-deleted and no longer served, with audit history retained. Scores, standings and bracket data are unrelated and untouched.

## Persistence and authorization

Separate tournament_photos table in D1 and PostgreSQL. Store opaque storage keys, caption, MIME type, uploader, created timestamp, version and removed timestamp. Dedicated image route checks tournament visibility and active photo status; generic media routes must not bypass it. Public reads only for public tournaments. Organizer writes restricted to tournaments they manage; super admin can manage all. Mutations are audited transactionally. Optimistic versions prevent overwriting concurrent caption edits/removals. Failed metadata insertion cleans up uploaded media. Local Preview has matching UI methods, storing compressed data URLs with an explicit local-only label.

## Verification

Worker endpoint tests: upload/list/read/edit/remove, private visibility, foreign organizer and referee denial, invalid MIME/signature/size/caption, optimistic conflicts, audit rollback and media cleanup. PostgreSQL API integration follows the same contract. Browser tests at 375 and 1440 pixels: multi-upload, caption escaping/edit, viewer keyboard/close, deletion confirmation, partial failure and no horizontal overflow. Full Worker suite, CI and live read-only verification complete release.

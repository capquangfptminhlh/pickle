# Player Avatar in Create Profile — Design

## Goal

Add an avatar picker to the existing **Tạo hồ sơ VĐV** dialog so an authorized operator can create a system athlete profile and attach its photo in the same guided flow. The selected layout is option A: a compact circular preview at the top of the form with a clear file action. Creating a profile without a photo remains valid and continues to use initials.

## Interface

Place an avatar panel immediately below the dialog explanation and before the name field. It contains:

- a 76px circular preview using `object-fit: cover`;
- initials derived from the entered full name when no file is selected;
- a **Chọn ảnh** button backed by a file input;
- after selection, **Thay ảnh** and **Xóa ảnh** actions;
- help text: JPG, PNG or WebP, maximum 3 MB;
- an inline status region for validation, upload progress and recovery messages.

The picker must work in the existing light and dark themes, remain usable at 375px, expose a visible keyboard focus state, and keep every interactive target at least 44px high. Selecting a file creates a local object URL for preview only. Clearing or closing the dialog revokes that URL.

## Data Flow

Use the existing authorized APIs and R2 binding:

1. Validate the profile fields and optional image in the browser.
2. Call `POST /api/players` with the existing JSON profile payload.
3. If an image was selected, call `POST /api/players/:id/avatar` with multipart field `avatar` using the newly created player ID.
4. On success, refresh the admin state, close the dialog and show a success message that mentions whether a photo was added.

Do not pre-upload to the generic media endpoint because a failed profile creation would leave an orphaned R2 object. Do not add a new multipart player-creation endpoint because the current player and avatar endpoints already enforce the required role and player scope.

## Failure and Retry Behavior

Before profile creation, reject unsupported MIME types and files larger than 3 MB while keeping all entered fields and the preview visible.

If profile creation fails, keep the dialog open and allow the operator to correct the form.

If profile creation succeeds but avatar upload fails, retain the created player ID in the dialog and enter recovery mode. Disable profile-field changes and replace the main action with **Thử tải ảnh lại**. Also show **Hoàn tất không có ảnh**. Retrying calls only the avatar endpoint and never creates another player. Finishing without a photo refreshes the table and closes the dialog.

The submit button shows **Đang tạo hồ sơ...** and then **Đang tải ảnh...** so repeated clicks cannot duplicate requests.

## Security and Storage

The browser `accept` attribute is only a convenience. The Worker remains authoritative: it checks authentication, `canEditPlayer`, MIME type and the 3 MB limit before writing to the `avatars/` R2 prefix. The database stores only the returned media URL. Existing public player views may display that avatar URL; no private receipt or admin data is exposed.

## Verification

Add browser coverage that proves:

- the create dialog exposes the avatar picker in light and dark themes at desktop and 375px;
- initials update from the name before a photo is selected;
- selecting a valid image shows a preview and removing it restores initials;
- invalid MIME and oversized files are rejected before either API call;
- a valid submission creates exactly one player, uploads the avatar, refreshes the roster and displays the image;
- an avatar upload failure keeps the created ID, retry uploads without creating another player, and finishing without a photo closes safely;
- keyboard focus, touch-target size and dialog overflow remain valid.

Retain existing Worker avatar permission, MIME, size, persistence and R2 tests. No production records are created during verification.

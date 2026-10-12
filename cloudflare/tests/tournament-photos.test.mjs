import test from "node:test";
import assert from "node:assert/strict";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";

test("tournament photos lifecycle: upload, list, patch, delete, and album_url", async () => {
  const {api, tokens, env, db} = await scoringFixture();

  // 1. Public list is initially empty
  const publicReq = new Request("https://test.invalid/api/public/tournaments/tour/photos");
  const publicRes = await (await import("../src/index.js")).default.fetch(publicReq, env);
  assert.equal(publicRes.status, 200);
  const initialPhotos = await publicRes.json();
  assert.deepEqual(initialPhotos, []);

  // 2. Anonymous cannot upload
  const anonReq = new Request("https://test.invalid/api/tournaments/tour/photos", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({url: "https://example.com/p1.jpg", caption: "Ảnh 1"})
  });
  const anonRes = await (await import("../src/index.js")).default.fetch(anonReq, env);
  assert.equal(anonRes.status, 401);

  // 3. Organizer can upload single photo
  const orgUploadReq = new Request("https://test.invalid/api/tournaments/tour/photos", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + tokens.organizer,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({url: "https://example.com/photo1.jpg", caption: "Khai mạc giải", sortOrder: 1})
  });
  const orgUploadRes = await (await import("../src/index.js")).default.fetch(orgUploadReq, env);
  assert.equal(orgUploadRes.status, 201);
  const created1 = await orgUploadRes.json();
  assert.equal(created1.length, 1);
  assert.equal(created1[0].caption, "Khai mạc giải");
  assert.equal(created1[0].sort_order, 1);
  const photoId1 = created1[0].id;

  // 4. Organizer can upload batch photos
  const batchReq = new Request("https://test.invalid/api/tournaments/tour/photos", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + tokens.organizer,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      photos: [
        {url: "https://example.com/photo2.jpg", caption: "Trận chung kết", sortOrder: 2},
        {url: "https://example.com/photo3.jpg", caption: "Trao giải", sortOrder: 3}
      ]
    })
  });
  const batchRes = await (await import("../src/index.js")).default.fetch(batchReq, env);
  assert.equal(batchRes.status, 201);
  const createdBatch = await batchRes.json();
  assert.equal(createdBatch.length, 2);

  // 5. Public list returns 3 photos in sort order
  const listRes = await (await import("../src/index.js")).default.fetch(new Request("https://test.invalid/api/public/tournaments/tour/photos"), env);
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.length, 3);
  assert.equal(list[0].caption, "Khai mạc giải");
  assert.equal(list[1].caption, "Trận chung kết");
  assert.equal(list[2].caption, "Trao giải");

  // 6. Update caption and sort order
  const patchReq = new Request("https://test.invalid/api/tournaments/tour/photos/" + photoId1, {
    method: "PATCH",
    headers: {
      "Authorization": "Bearer " + tokens.organizer,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({caption: "Lễ khai mạc tưng bừng", sortOrder: 10})
  });
  const patchRes = await (await import("../src/index.js")).default.fetch(patchReq, env);
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.caption, "Lễ khai mạc tưng bừng");
  assert.equal(patched.sort_order, 10);

  // 7. Delete a photo
  const delReq = new Request("https://test.invalid/api/tournaments/tour/photos/" + photoId1, {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer " + tokens.organizer
    }
  });
  const delRes = await (await import("../src/index.js")).default.fetch(delReq, env);
  assert.equal(delRes.status, 200);

  const afterDelRes = await (await import("../src/index.js")).default.fetch(new Request("https://test.invalid/api/public/tournaments/tour/photos"), env);
  const afterDelList = await afterDelRes.json();
  assert.equal(afterDelList.length, 2);

  // 8. Update tournament album_url and verify state
  const patchTourReq = new Request("https://test.invalid/api/tournaments/tour", {
    method: "PATCH",
    headers: {
      "Authorization": "Bearer " + tokens.organizer,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({albumUrl: "https://photos.google.com/album-test-123"})
  });
  const patchTourRes = await (await import("../src/index.js")).default.fetch(patchTourReq, env);
  assert.equal(patchTourRes.status, 200);

  const state = await (await import("../src/state.js")).loadState(env, {publicOnly: false});
  const tour = state.tournaments.find(t => t.id === "tour");
  assert.equal(tour.albumUrl, "https://photos.google.com/album-test-123");
});

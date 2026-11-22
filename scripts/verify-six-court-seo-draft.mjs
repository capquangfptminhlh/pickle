#!/usr/bin/env node
// Source-only guard for PR #67. Never treats draft validation as publication approval.
import {readFileSync, existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve, dirname} from "node:path";
import assert from "node:assert/strict";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const draftPath=resolve(root,"governance/seo-drafts/six-court-scheduling-2026-11-21.md");
const imagePath=resolve(root,"docs/seo-assets/six-court-scheduling-diagram.svg");
assert.ok(existsSync(draftPath),"SEO draft must exist");
assert.ok(existsSync(imagePath),"Original SVG must exist");
const draft=readFileSync(draftPath,"utf8");
const svg=readFileSync(imagePath,"utf8");
assert.match(draft,/BẢN THẢO CHỜ DUYỆT/);
assert.match(draft,/Canonical owner:\s*UNASSIGNED\s*\/\s*HOLD/);
assert.match(draft,/SEO title dự kiến:/);
assert.match(draft,/Meta description dự kiến:/);
assert.match(draft,/## Câu hỏi thường gặp/);
assert.match(draft,/35 phút[\s\S]*không phải quy định/i);
assert.match(draft,/docs\/seo-assets\/six-court-scheduling-diagram\.svg/);
assert.match(svg,/<svg\b[^>]*viewBox="0 0 1200 675"/);
assert.match(svg,/<title id="title">[^<]+<\/title>/);
assert.match(svg,/<desc id="desc">[^<]+<\/desc>/);
assert.match(svg,/aria-labelledby="title desc"/);
assert.equal((svg.match(/>SÂN [1-6]</g)||[]).length,6,"six distinct court labels required");
assert.doesNotMatch(svg,/<(?:script|foreignObject|image)\b/i,"no active or externally linked SVG elements");
assert.doesNotMatch(svg,/\b(?:href|xlink:href)\s*=/i,"no external SVG resources");
console.log("PASS: six-court SEO draft and original SVG source invariants (NOT publication approval)");

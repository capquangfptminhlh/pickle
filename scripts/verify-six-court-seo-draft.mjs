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
assert.match(draft,/\*\*Canonical owner:\*\*\s*UNASSIGNED\s*\/\s*HOLD/);
assert.match(draft,/SEO title dự kiến:/);
assert.match(draft,/Meta description dự kiến:/);
assert.match(draft,/## Câu hỏi thường gặp/);
assert.match(draft,/35 phút[\s\S]*không phải quy định/i);
assert.match(draft,/docs\/seo-assets\/six-court-scheduling-diagram\.svg/);
assert.match(svg,/<svg\b[^>]*viewBox="0 0 1200 675"/);
assert.match(svg,/<title id="title">[^<]+<\/title>/);
assert.match(svg,/<desc id="desc">[^<]+<\/desc>/);
assert.match(svg,/aria-labelledby="title desc"/);
const courtLabels=[...svg.matchAll(/>SÂN ([1-6])</g)].map(match=>Number(match[1]));
assert.deepEqual([...courtLabels].sort((a,b)=>a-b),[1,2,3,4,5,6],"exactly one label for each of six courts");
assert.doesNotMatch(draft,/\b(?:https?:\/\/pickleup\.vn\/(?:blog|bai-viet|huong-dan)\/[^\s)]+)\b/i,"draft must not assert an unapproved public article URL");
assert.match(draft,/không phải quy định pickleball chính thức/i,"illustrative rest time must be explicitly non-official");
assert.doesNotMatch(draft,/!\[[^\]]*\]\(https?:\/\//i,"draft must not hotlink remote images");
assert.doesNotMatch(svg,/@import\b|url\s*\(/i,"SVG must not import remote styles or resources");
assert.doesNotMatch(svg,/<(?:script|foreignObject|image|iframe|audio|video|animate|animateMotion|animateTransform|set)\b/i,"no executable, animated or externally linked SVG elements");
assert.doesNotMatch(svg,/\bon[a-z]+\s*=/i,"SVG must not contain event-handler attributes");
assert.doesNotMatch(svg,/\b(?:href|xlink:href)\s*=/i,"no external SVG resources");
console.log("PASS: six-court SEO draft and original SVG source invariants (NOT publication approval)");

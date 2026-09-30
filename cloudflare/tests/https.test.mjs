import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("redirects HTTP requests to the same HTTPS URL",async()=>{
  const request=new Request("http://pickleup.vn/ranking.html?mode=club",{headers:{"cf-ray":"test-SIN"}});
  const response=await worker.fetch(request,{});

  assert.equal(response.status,308);
  assert.equal(response.headers.get("location"),"https://pickleup.vn/ranking.html?mode=club");
});

test("keeps local Wrangler requests on HTTP",async()=>{
  const env={ASSETS:{fetch:async()=>new Response("local")}};

  const response=await worker.fetch(new Request("http://127.0.0.1:8787/"),env);

  assert.equal(response.status,200);
  assert.equal(await response.text(),"local");
});

test("serves HTTPS pages from the static asset binding",async()=>{
  let requestedUrl="";
  const env={
    ASSETS:{
      fetch:async request=>{
        requestedUrl=request.url;
        return new Response("site",{headers:{"content-type":"text/html"}});
      }
    }
  };

  const response=await worker.fetch(new Request("https://pickleup.vn/"),env);

  assert.equal(response.status,200);
  assert.equal(await response.text(),"site");
  assert.equal(requestedUrl,"https://pickleup.vn/");
});

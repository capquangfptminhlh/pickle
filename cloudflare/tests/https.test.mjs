import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("redirects HTTP requests to the same HTTPS URL",async()=>{
  const response=await worker.fetch(new Request("http://pickleup.vn/ranking.html?mode=club"),{});

  assert.equal(response.status,308);
  assert.equal(response.headers.get("location"),"https://pickleup.vn/ranking.html?mode=club");
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

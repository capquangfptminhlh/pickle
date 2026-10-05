      const allowed=await Promise.all(linked.map(r=>req.user.role==="organizer"?canManageTournament(req.user,r.tournament_id):(!req.user.clubId||req.user.clubId===r.club_id)));
      if(!allowed.every(Boolean))return res.status(403).json({error:"FORBIDDEN"});
    }else if(!filename.startsWith(`receipt-${req.user.sub}-`))return res.status(403).json({error:"FORBIDDEN"});
  }
  next();
}),express.static(receiptDir,{fallthrough:false,maxAge:0}));
app.get("/",(req,res)=>res.sendFile(path.join(root,"index.html")));
app.get("/index.html",(req,res)=>res.sendFile(path.join(root,"index.html")));
const adminPage=wrap(async(req,res)=>{
  const user=await sessionUser(req);
  if(!user)return res.redirect(302,"/login");
  res.set("Cache-Control","no-store");
  res.sendFile(path.join(root,"admin.html"));
});
app.get("/admin",adminPage);
app.get("/admin.html",adminPage);
app.get("/login",(req,res)=>res.sendFile(path.join(root,"login.html")));
app.get("/login.html",(req,res)=>res.sendFile(path.join(root,"login.html")));
app.get("/tournament.html",(req,res)=>res.sendFile(path.join(root,"tournament.html")));
app.get("/court-board.html",(req,res)=>res.sendFile(path.join(root,"court-board.html")));
app.get("/referee.html",(req,res)=>res.sendFile(path.join(root,"referee.html")));
app.get("/ranking.html",(req,res)=>res.sendFile(path.join(root,"ranking.html")));
app.get("/player.html",(req,res)=>res.sendFile(path.join(root,"player.html")));
app.get("/checkin.html",(req,res)=>res.sendFile(path.join(root,"checkin.html")));
app.get("/about.html",(req,res)=>res.sendFile(path.join(root,"about.html")));
app.get("/manifest.webmanifest",(req,res)=>res.type("application/manifest+json").sendFile(path.join(root,"manifest.webmanifest")));
app.get("/service-worker.js",(req,res)=>{res.set("Cache-Control","no-cache");res.type("application/javascript").sendFile(path.join(root,"service-worker.js"))});
app.get("/offline.html",(req,res)=>res.sendFile(path.join(root,"offline.html")));
app.get("/robots.txt",(req,res)=>{
  const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nSitemap: ${base}/sitemap.xml\n`);
});
app.get("/sitemap.xml",wrap(async(req,res)=>{
import "dotenv/config";
import {pool,tx} from "./db.js";
import {hashPassword} from "./auth.js";

async function seedAdmin(){
  const email=process.env.ADMIN_EMAIL;
  const password=process.env.ADMIN_PASSWORD;
  if(!email||!password)return;
  const passwordHash=await hashPassword(password);
  await pool.query(`
    insert into app_users(email,display_name,role,password_hash)
    values($1,'Super Admin','super_admin',$2)
    on conflict(email) do nothing
  `,[email.toLowerCase(),passwordHash]);
}

async function seedDemo(){
  const {rows:[count]}=await pool.query("select count(*)::int n from tournaments");
  if(count.n>0)return;
  await tx(async c=>{
    const admin=(await c.query("select id from app_users where role='super_admin' order by created_at limit 1")).rows[0];
    const t=(await c.query(`
      insert into tournaments(owner_user_id,name,slug,venue_name,start_at,end_at,status,public_visible)
      values($1,'Saigon Pickle Open 2026','saigon-pickle-open-2026','Pickle Hub Bình Thạnh',
      now(),now()+interval '6 hours','live',true) returning id
    `,[admin?.id||null])).rows[0];
    const d=(await c.query(`
      insert into divisions(tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count)
      values($1,'Doubles 3.0–3.5','doubles','pool_to_knockout',3,11,true,2) returning id
    `,[t.id])).rows[0];

    const clubNames=["Bình Lợi","Gò Vấp","Phú Nhuận","Thủ Đức","Tân Bình"];
    const clubs={};
    for(const name of clubNames){
      const slug=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/đ/g,"d").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      const row=(await c.query("insert into clubs(name,slug,city) values($1,$2,'TP.HCM') returning id",[name,slug])).rows[0];
      clubs[name]=row.id;
    }

    const teamSeed=[
      ["Minh Búa / Quốc Anh","Bình Lợi","A",1],
      ["Hoàng Nam / Tuấn Kiệt","Gò Vấp","A",2],
      ["Gia Huy / Đức Long","Phú Nhuận","A",3],
      ["Bảo Minh / Trọng Nhân","Thủ Đức","B",1],
      ["Thanh Tùng / Hải Đăng","Bình Lợi","B",2],
      ["Quang Huy / Anh Khoa","Tân Bình","B",3]
    ];
    const teams={};
    for(const [name,club,g,seed] of teamSeed){
      const row=(await c.query(`
        insert into teams(division_id,name,club_id,seed,group_code) values($1,$2,$3,$4,$5) returning id
      `,[d.id,name,clubs[club],seed,g])).rows[0];
      teams[name]=row.id;
      for(const person of name.split("/").map(x=>x.trim()).filter(Boolean)){
        let p=(await c.query("select id from players where lower(full_name)=lower($1) limit 1",[person])).rows[0];
        if(!p)p=(await c.query("insert into players(club_id,full_name,rating) values($1,$2,3.000) returning id",[clubs[club]||null,person])).rows[0];
        await c.query("insert into team_players(team_id,player_id) values($1,$2) on conflict do nothing",[row.id,p.id]);
      }
    }

    const courts=[];
    for(let i=1;i<=6;i++){
      courts.push((await c.query("insert into courts(tournament_id,name,sort_order) values($1,$2,$3) returning id",[t.id,`Sân ${i}`,i])).rows[0].id);
    }
    const match=async(stage,courtIndex,a,b,status,mins)=>{
      const r=(await c.query(`
        insert into matches(division_id,court_id,team_a_id,team_b_id,stage,scheduled_at,status)
        values($1,$2,$3,$4,$5,now()+($6||' minutes')::interval,$7) returning id
      `,[d.id,courts[courtIndex-1],teams[a]||null,teams[b]||null,stage,String(mins),status])).rows[0];
      return r.id;
    };
    const m1=await match("Bảng A",1,"Minh Búa / Quốc Anh","Hoàng Nam / Tuấn Kiệt","completed",-60);
    const m2=await match("Bảng A",2,"Hoàng Nam / Tuấn Kiệt","Gia Huy / Đức Long","completed",-40);
    const m3=await match("Bảng A",1,"Minh Búa / Quốc Anh","Gia Huy / Đức Long","live",0);
    const m4=await match("Bảng B",2,"Bảo Minh / Trọng Nhân","Thanh Tùng / Hải Đăng","live",0);
    await match("Bảng B",3,"Thanh Tùng / Hải Đăng","Quang Huy / Anh Khoa","scheduled",35);
    await match("Bảng B",4,"Bảo Minh / Trọng Nhân","Quang Huy / Anh Khoa","scheduled",35);

    const semi1=await match("Bán kết 1",1,"Minh Búa / Quốc Anh","Thanh Tùng / Hải Đăng","scheduled",90);
    const semi2=await match("Bán kết 2",2,"Bảo Minh / Trọng Nhân","Hoàng Nam / Tuấn Kiệt","scheduled",90);
    const final=(await c.query(`
      insert into matches(division_id,court_id,stage,scheduled_at,status)
      values($1,$2,'Chung kết',now()+interval '135 minutes','scheduled') returning id
    `,[d.id,courts[0]])).rows[0].id;
    await c.query("update matches set next_match_id=$1,next_match_side='A' where id=$2",[final,semi1]);
    await c.query("update matches set next_match_id=$1,next_match_side='B' where id=$2",[final,semi2]);

    const seedSets=async(mid,sets,winnerName)=>{
      for(let i=0;i<sets.length;i++){
        await c.query("insert into match_sets(match_id,set_no,score_a,score_b,completed) values($1,$2,$3,$4,true)",[mid,i+1,sets[i][0],sets[i][1]]);
      }
      await c.query("update matches set winner_team_id=$1,completed_at=now(),status='completed' where id=$2",[teams[winnerName],mid]);
    };
    await seedSets(m1,[[11,7],[11,9]],"Minh Búa / Quốc Anh");
    await seedSets(m2,[[11,6],[10,12],[11,7]],"Hoàng Nam / Tuấn Kiệt");
    await c.query("insert into match_sets(match_id,set_no,score_a,score_b,completed) values($1,1,11,8,true)",[m3]);
    await c.query("update matches set current_score_a=7,current_score_b=5,started_at=now() where id=$1",[m3]);
    await c.query("update matches set current_score_a=9,current_score_b=6,started_at=now() where id=$1",[m4]);
  });
}

await seedAdmin();
await seedDemo();
console.log("seed complete");
await pool.end();

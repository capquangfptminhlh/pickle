(()=>{
  function parse(text){
    const rows=[];let row=[],cell="",quoted=false;
    const pushCell=()=>{row.push(cell);cell=""};
    const pushRow=()=>{if(row.some(x=>String(x).trim()!==""))rows.push(row);row=[]};
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){
        if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}
        else if(ch==='"')quoted=false;
        else cell+=ch;
      }else{
        if(ch==='"')quoted=true;
        else if(ch===',')pushCell();
        else if(ch==='\n'){pushCell();pushRow()}
        else if(ch!=='\r')cell+=ch;
      }
    }
    pushCell();pushRow();
    if(rows.length<2)return[];
    const headers=rows[0].map(x=>x.trim());
    return rows.slice(1).map(cols=>Object.fromEntries(headers.map((h,i)=>[h,(cols[i]??"").trim()])));
  }
  window.PickleCSV={parse};
})();
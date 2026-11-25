fetch('/api/site-content').then(response=>response.ok?response.json():{}).then(content=>{
 if (!content.proposalUrl) return;
 const url=new URL(content.proposalUrl);
 if (url.protocol!=='https:') return;
 const link=document.querySelector('#proposal-link');
 link.href=url.href; link.hidden=false;
 document.querySelector('#proposal-status').hidden=true;
}).catch(()=>{});
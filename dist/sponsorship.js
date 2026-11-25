fetch('/api/site-content').then(response=>response.ok?response.json():{}).then(content=>{
 for (const [i,tier] of (content.sponsorshipTiers || []).entries()) {
   const amount = document.querySelector('[data-tier-amount="'+i+'"]');
   const benefit = document.querySelector('[data-tier-benefit="'+i+'"]');
   if (amount && typeof tier.amount==='string') amount.textContent=tier.amount;
   if (benefit && typeof tier.benefit==='string') benefit.textContent=tier.benefit;
 }
 if (!content.proposalUrl) return;
 const url=new URL(content.proposalUrl);
 if (url.protocol!=='https:') return;
 const link=document.querySelector('#proposal-link');
 link.href=url.href; link.hidden=false;
 document.querySelector('#proposal-status').hidden=true;
}).catch(()=>{});
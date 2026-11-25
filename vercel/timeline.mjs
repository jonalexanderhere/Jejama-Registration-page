export const eventDates = [
  ['2026-11-25','2027-01-04'],
  ['2027-01-04','2027-01-04'],
  ['2027-01-08','2027-01-08'],
  ['2027-01-10','2027-01-10'],
  ['2027-01-17','2027-01-17'],
  ['2027-01-23','2027-01-23'],
  ['2027-01-24','2027-01-24'],
  ['2027-01-24','2027-01-24'],
];
const dateKey = now => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',
}).format(now);
export function timelineState(now,dates=eventDates) {
  const today=dateKey(now);
  return dates.map(([start,end])=>today<start?'upcoming':today>end?'completed':'active');
}
export function setupTimeline() {
  const items=[...document.querySelectorAll('.timeline li')];
  if (!items.length) return () => {};
  let settings={};
  const update = () => {
    const dates=eventDates.map(([start,end],i)=>{
      const override=settings['scheduled'+(i+1)];
      return override ? [override,override] : [start,end];
    });
    const states=timelineState(new Date(),dates);
    const format = value => new Intl.DateTimeFormat('id-ID',{
      weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC',
    }).format(new Date(value+'T00:00:00Z'));
    items.forEach((item,i)=>{
      const [start,end]=dates[i];
      item.dataset.state=states[i];
      let badge=item.querySelector('.timeline-status');
      if (!badge) {
        badge=document.createElement('span');
        badge.className='timeline-status';
        item.append(badge);
      }
      badge.textContent={active:'Sedang berlangsung',completed:'Selesai',upcoming:'Akan datang'}[states[i]];
      if (states[i]==='active') item.setAttribute('aria-current','step');
      else item.removeAttribute('aria-current');
      const label=item.querySelector('[data-content="date'+(i+1)+'"]');
      label.textContent=start===end?format(start):format(start)+' – '+format(end);
    });
    const active=states.indexOf('active');
    const next=states.indexOf('upcoming');
    const target=active>=0?active:next>=0?Math.max(0,next-1):items.length-1;
    for (const map of document.querySelectorAll('.timeline-map')) {
      map.querySelector('.timeline-ship-marker')?.remove();
    }
    const map=items[target].closest('.timeline-map');
    const svg=map.querySelector('svg');
    const local=target%4;
    const ship=document.createElementNS('http://www.w3.org/2000/svg','image');
    ship.classList.add('timeline-ship-marker');
    ship.setAttribute('href','assets/timeline-ship.webp');
    ship.setAttribute('x','-27');ship.setAttribute('y','-27');
    ship.setAttribute('width','54');ship.setAttribute('height','54');
    ship.setAttribute('transform','translate('+[125,375,625,875][local]+' '+[47,153,47,153][local]+')');
    svg.append(ship);
  };
  update();
  setInterval(update,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  return content=>{settings=content;update();};
}

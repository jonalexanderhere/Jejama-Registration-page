const dialog = document.querySelector('#registration-dialog');
const form = document.querySelector('#registration');
const feedback = document.querySelector('#feedback');
const submit = form.querySelector('button[type=submit]');
const maxProofSize = 5 * 1024 * 1024;
let opener;
let retryId;

for (const trigger of document.querySelectorAll('.register-trigger')) {
  trigger.addEventListener('click', () => {
    opener = trigger;
    dialog.showModal();
  });
}
document.querySelector('#close-registration').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => opener?.focus());
form.addEventListener('input', () => { retryId = undefined; });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const emails = ['captainEmail', 'member2Email', 'member3Email'].map(name => data.get(name).trim().toLowerCase());
  if (new Set(emails).size !== 3) {
    feedback.textContent = 'Enter a different email address for each participant.';
    return;
  }
  const proof = data.get('proof');
  if (!proof.size || proof.size > maxProofSize || !['image/jpeg', 'image/png', 'application/pdf'].includes(proof.type)) {
    feedback.textContent = 'Attach one JPEG, PNG, or PDF file up to 5 MB.';
    return;
  }
  const submissionId = retryId ??= crypto.randomUUID();
  data.set('submissionId', submissionId);
  submit.disabled = true;
  feedback.textContent = 'Submitting registration…';
  try {
    if (globalThis.uploadJejamaProof) {
      await globalThis.uploadJejamaProof(proof, submissionId);
      data.delete('proof');
    }
    const response = await fetch(form.action, {method: 'POST', body: data});
    const result = await response.json();
    if (response.ok) {
      feedback.textContent = 'Registration code: ' + result.id + '\nPayment proof received · Pending review';
      form.reset();
      retryId = undefined;
    } else {
      feedback.textContent = result.error || 'Registration could not be completed. Please try again.';
    }
  } catch {
    feedback.textContent = 'We couldn’t confirm your registration. Please try again.';
  } finally {
    submit.disabled = false;
  }
});

const contentNodes = document.querySelectorAll('[data-content]');
if (globalThis.uploadJejamaProof) {
  fetch('/api/site-content')
    .then(response => response.ok ? response.json() : {})
    .then(content => {
      for (const node of contentNodes) {
        const value = content[node.dataset.content];
        if (typeof value === 'string') node.textContent = value;
      }
    })
    .catch(() => {});
}

const sailingRoute = document.querySelector('#sailing-route');
const timelineShip = sailingRoute?.nextElementSibling;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (timelineShip) {
  let visible = false;
  let frame;
  const length = sailingRoute.getTotalLength();
  const sail = time => {
    const progress = (1 - Math.cos(time * Math.PI / 10000)) / 2;
    const point = sailingRoute.getPointAtLength(length * (.035 + .93 * progress));
    timelineShip.setAttribute('transform', 'translate(' + point.x + ' ' + point.y + ')');
    frame = requestAnimationFrame(sail);
  };
  const update = () => {
    cancelAnimationFrame(frame);
    if (visible && !reducedMotion.matches) frame = requestAnimationFrame(sail);
    else timelineShip.setAttribute('transform', 'translate(125 47)');
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  }).observe(sailingRoute.ownerSVGElement);
  reducedMotion.addEventListener('change', update);
}

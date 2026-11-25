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
    feedback.textContent = 'Gunakan alamat email yang berbeda untuk setiap peserta.';
    return;
  }
  const proof = data.get('proof');
  if (!proof.size || proof.size > maxProofSize || !['image/jpeg', 'image/png', 'application/pdf'].includes(proof.type)) {
    feedback.textContent = 'Unggah satu JPEG, PNG, atau PDF maksimal 5 MB.';
    return;
  }
  for (const kind of ['identity','social']) {
    const file = data.get(kind);
    if (!file?.size || file.size > maxProofSize || file.type !== 'application/pdf') {
      feedback.textContent = 'Unggah PDF identitas dan bukti media sosial, masing-masing maksimal 5 MB.';
      return;
    }
  }
  const submissionId = retryId ??= crypto.randomUUID();
  data.set('submissionId', submissionId);
  submit.disabled = true;
  feedback.textContent = 'Mengirim pendaftaran…';
  try {
    if (globalThis.uploadJejamaProof) {
      await globalThis.uploadJejamaProof(proof, submissionId);
      data.delete('proof');
      for (const kind of ['identity','social']) {
        await globalThis.uploadJejamaProof(data.get(kind),submissionId,kind);
        data.delete(kind);
      }
    }
    const response = await fetch(form.action, {method: 'POST', body: data});
    const result = await response.json();
    if (response.ok) {
      feedback.textContent = 'Kode pendaftaran: ' + result.id + '\nBukti transfer received · Pending review';
      form.reset();
      retryId = undefined;
    } else {
      feedback.textContent = result.error || 'Pendaftaran belum berhasil. Silakan coba lagi.';
    }
  } catch {
    feedback.textContent = 'Pendaftaran belum dapat dikonfirmasi. Silakan coba lagi.';
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
      for (let stage = 1; stage <= 4; stage++) {
        const date = content['scheduled' + stage];
        if (!date) continue;
        const time = document.createElement('time');
        time.dateTime = date;
        time.textContent = new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'medium', timeZone: 'UTC',
        }).format(new Date(date));
        document.querySelector('[data-content="date' + stage + '"]').replaceChildren(time);
      }
      if (content.guidebookUrl) {
        const link = document.querySelector('#guidebook-drive');
        link.href = content.guidebookUrl;
        link.hidden = false;
        document.querySelector('[data-content="guidebook"]').hidden = !content.guidebook;
      }
      if (Array.isArray(content.partners)) {
        const sponsorLogos = document.querySelector('#sponsor-logos');
        const mediaLogos = document.querySelector('#media .media-logos');
        sponsorLogos.replaceChildren();
        mediaLogos.replaceChildren();
        for (const sponsor of content.partners) {
          const logos = sponsor.category === 'media' ? mediaLogos : sponsorLogos;
          const card = document.createElement('div');
          card.className = 'organization-logo';
          const image = document.createElement('img');
          image.src = sponsor.asset || '/api/sponsor-logo/' + encodeURIComponent(sponsor.id);
          image.alt = sponsor.name;
          image.loading = 'lazy';
          card.append(image);
          logos.append(card);
        }
        sponsorLogos.hidden = !sponsorLogos.childElementCount;
        document.querySelector('#sponsor-placeholder').hidden = !sponsorLogos.hidden;
      }
    })
    .catch(() => {});
}

const form = document.querySelector('#registration');
const feedback = document.querySelector('#feedback');
const mode = document.querySelector('#mode');
const button = form.querySelector('button');
let demo = true;
button.disabled = true;
async function detectBackend() {
  try {
    const response = await fetch('/api/registrations', {headers: {Accept: 'application/json'}});
    demo = !(response.ok && response.headers.get('content-type')?.includes('application/json') && (await response.json()).enabled === true);
  } catch {
    demo = true;
  } finally {
    if (demo) {
      mode.textContent = 'Mode pratinjau. Formulir ini bisa dicoba tanpa mengirim data.';
      button.childNodes[1].textContent = ' Uji Formulir ';
    }
    button.disabled = false;
  }
}
detectBackend();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
  if (Object.values(data).some(value => !value)) {
    feedback.textContent = 'Isi semua kolom sebelum melanjutkan.';
    return;
  }
  if (demo) {
    feedback.textContent = 'Formulir valid. Pratinjau selesai tanpa mengirim data.';
    return;
  }
  button.disabled = true;
  feedback.textContent = 'Mengirim pendaftaran…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    const result = await response.json();
    feedback.textContent = response.ok ? 'Kru terdaftar! Kode pendaftaran: ' + result.id : result.error;
    if (response.ok) form.reset();
  } catch {
    feedback.textContent = 'Pengiriman belum terkonfirmasi. Coba lagi.';
  } finally {
    button.disabled = false;
  }
});

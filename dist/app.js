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
      mode.textContent = 'Preview mode. You can test this form without sending your details.';
      button.childNodes[1].textContent = ' Test Registration ';
    }
    button.disabled = false;
  }
}
detectBackend();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
  if (Object.values(data).some(value => !value)) {
    feedback.textContent = 'Fill in all fields before continuing.';
    return;
  }
  if (demo) {
    feedback.textContent = 'Preview complete. No registration data was sent.';
    return;
  }
  button.disabled = true;
  feedback.textContent = 'Submitting registration…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    const result = await response.json();
    feedback.textContent = response.ok ? 'Team registered! Registration code: ' + result.id : 'Registration could not be completed. Check your details and try again.';
    if (response.ok) form.reset();
  } catch {
    feedback.textContent = 'We couldn’t confirm your registration. Please try again.';
  } finally {
    button.disabled = false;
  }
});

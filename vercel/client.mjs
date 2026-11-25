import {setupTimeline} from './timeline.mjs';
import {put} from '@vercel/blob/client';

globalThis.uploadJejamaProof = async (proof, submissionId, kind = 'proof') => {
  const response = await fetch('/api/proof-token', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({submissionId, type: proof.type, kind}),
  });
  if (!response.ok) throw new Error('Could not authorize the upload.');
  const {token, pathname} = await response.json();
  await put(pathname, proof, {token, access: 'private', contentType: proof.type});
};
globalThis.updateJejamaTimeline = setupTimeline();
void import('../dist/app.js');


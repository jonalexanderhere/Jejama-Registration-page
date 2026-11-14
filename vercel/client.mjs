import {put} from '@vercel/blob/client';

globalThis.uploadJejamaProof = async (proof, submissionId) => {
  const response = await fetch('/api/proof-token', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({submissionId, type: proof.type}),
  });
  if (!response.ok) throw new Error('Could not authorize the upload.');
  const {token, pathname} = await response.json();
  await put(pathname, proof, {token, access: 'private', contentType: proof.type});
};
void import('../dist/app.js');


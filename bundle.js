const fs = require('fs');
const wbn = require('wbn');

const builder = new wbn.BundleBuilder();
builder.addExchange(
  'https://example.com/', // URL
  200, // response code
  { 'Content-Type': 'text/html' }, // response headers
  '<html>Hello, Web Bundle!</html>' // response body (string or Uint8Array)
);
builder.setPrimaryURL('https://example.com/'); // entry point URL

fs.writeFileSync('out.wbn', builder.createBundle());
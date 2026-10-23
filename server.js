const http = require('http');

const TARGET_BASE_URL = 'https://senshu-ikuta-room-navi-seven.vercel.app';

const server = http.createServer((req, res) => {
  const destination = `${TARGET_BASE_URL}${req.url}`;
  res.writeHead(301, {
    'Location': destination,
    'Content-Type': 'text/plain',
  });
  res.end(`Redirecting to ${destination}`);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Redirect server running on port ${PORT}`);
});
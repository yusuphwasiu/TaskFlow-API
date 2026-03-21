import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp();

server.listen(port, () => {
  console.log(`TaskFlow API listening on port ${port}`);
});

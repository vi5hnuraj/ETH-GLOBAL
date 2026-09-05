// PM2 wrapper - always starts the HTTP server
import app from './server.js';

const PORT = process.env.PORT || 5550;
const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

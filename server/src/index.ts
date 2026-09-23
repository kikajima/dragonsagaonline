import { server } from "./app.config.js";

const port = Number(process.env.PORT || 2567);

await server.listen(port);

console.log(`Dragon Saga Online multiplayer listening on port ${port}`);

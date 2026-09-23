import { defineRoom, defineServer } from "colyseus";
import { WorldRoom } from "./rooms/WorldRoom.js";

export const server = defineServer({
  rooms: {
    world: defineRoom(WorldRoom),
  },

  express: (app) => {
    app.use((req: any, res: any, next: any) => {
      const origin = process.env.CLIENT_ORIGIN || "*";
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }

      next();
    });

    app.get("/health", (_req: any, res: any) => {
      res.json({
        ok: true,
        service: "dragon-saga-online-colyseus",
        room: "world",
      });
    });
  },
});

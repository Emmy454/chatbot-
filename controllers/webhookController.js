import express from "express";
import { handleIncomingMessage } from "./ messageHandler.js";
import dotenvConfig from "../config/dotenvConfig.js";

export const webhookRouter = express.Router();

webhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === dotenvConfig.WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else res.sendStatus(403);
});

webhookRouter.post("/", async (req, res) => {
  res.sendStatus(200); // Respond immediately

  setImmediate(async () => {
    try {
      await handleIncomingMessage(req.body);
    } catch (err) {
      console.error("❌ Webhook error:", err);
    }
  });
});

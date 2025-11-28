import express from "express";
import dotenv from "dotenv";
import { webhookRouter } from "./controllers/webhookcontroller.js";

dotenv.config();

const app = express();
app.use(express.json());

// Routes
app.use("/webhook", webhookRouter);

app.get("/", (req, res) => res.send("✅ WhatsApp Bot Live"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
